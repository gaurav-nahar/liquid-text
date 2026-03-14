import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import useLocalStorageSync from "../hooks/useLocalStorageSync";
import useWorkspaceLoader from "../services/useWorkspaceLoader";
import useWorkspaceSaver from "../services/useWorkspaceSaver";
import useUndoRedo from "../hooks/useUndoRedo";
import api from "../api/api";
const AppContext = createContext();

export const AppProvider = ({ children }) => {
    // Tool and UI States
    const [tool, setTool] = useState("select");
    const [pdfId, setPdfId] = useState(null);
    const [userId, setUserId] = useState(null); // Added for user isolation
    const [pdfName, setPdfName] = useState("");
    const [activeWorkspace, setActiveWorkspace] = useState(null);
    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Effect to extract user_id from URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const uid = params.get("user_id") || params.get("uid");
        if (uid) {
            console.log(`[DEBUG] Found user_id in URL: ${uid}`);
            setUserId(uid);
            // Inject into API headers
            api.defaults.headers.common['X-User-ID'] = uid;
        }
    }, []);

    // Search and Selection
    const [searchText, setSearchText] = useState("");
    const [searchMatches, setSearchMatches] = useState([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
    const [selectedItem, setSelectedItem] = useState(null);

    // PDF Annotations Data
    const [highlights, setHighlights] = useState([]);
    const [pdfAnnotations, setPdfAnnotations] = useState([]);
    const [pdfLines, setPdfLines] = useState([]);
    const [brushHighlights, setBrushHighlights] = useState([]);
    const [deletedHighlights, setDeletedHighlights] = useState([]);
    const [deletedPdfTexts, setDeletedPdfTexts] = useState([]);

    // UI Toggle States
    const [showThumbnails, setShowThumbnails] = useState(false);
    const [showPageJump, setShowPageJump] = useState(false);
    const [showHighlightsList, setShowHighlightsList] = useState(false);
    const [showWorkspaceSidebar, setShowWorkspaceSidebar] = useState(false);

    // Settings
    const [autosaveInterval, setAutosaveInterval] = useState(5000);

    const [savingWorkspace, setSavingWorkspace] = useState(false);
    const [savingPdf, setSavingPdf] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [pdfRenderScale, setPdfRenderScale] = useState(1.0);
    const [pdfPanelWidth, setPdfPanelWidth] = useState(55);
    const [isResizing, setIsResizing] = useState(false);

    // Refs
    const pdfRef = useRef(null);
    const canvasRef = useRef(null);
    const saveRef = useRef(null);
    const viewStateRef = useRef({ scale: 1, pan: { x: 0, y: 0 } });

    // Undo/Redo
    const { recordHistory, undo, redo, canUndo, canRedo, clearHistory } = useUndoRedo();

    // Workspace Content States
    const [snippets, setSnippets] = useState([]);
    const [connections, setConnections] = useState([]);
    const [lineStartId, setLineStartId] = useState(null);
    const [editableBoxes, setEditableBoxes] = useState([]);
    const [lines, setLines] = useState([]);
    const [existingSnippetsMap, setExistingSnippetsMap] = useState({});

    // Refs to always access latest workspace state (used by undo/redo snapshot)
    const snippetsRef = useRef(snippets);
    const connectionsRef = useRef(connections);
    const editableBoxesRef = useRef(editableBoxes);
    const linesRef = useRef(lines);
    useEffect(() => { snippetsRef.current = snippets; }, [snippets]);
    useEffect(() => { connectionsRef.current = connections; }, [connections]);
    useEffect(() => { editableBoxesRef.current = editableBoxes; }, [editableBoxes]);
    useEffect(() => { linesRef.current = lines; }, [lines]);

    // Capture current workspace state as a snapshot
    const getSnapshot = useCallback(() => ({
        snippets: snippetsRef.current,
        editableBoxes: editableBoxesRef.current,
        lines: linesRef.current,
        connections: connectionsRef.current,
    }), []);

    // UI States
    const [selectedPDF, setSelectedPDF] = useState(null);
    const [pdfDrawingColor, setPdfDrawingColor] = useState("black");
    const [highlightBrushColor, setHighlightBrushColor] = useState("#FFEB3B");

    const contextState = {
        pdfId, activeWorkspace,
        snippets, setSnippets,
        editableBoxes, setEditableBoxes,
        lines, setLines,
        connections, setConnections,
        highlights, setHighlights,
        pdfAnnotations, setPdfAnnotations,
        pdfLines, setPdfLines,
        brushHighlights, setBrushHighlights,
        existingSnippetsMap, setExistingSnippetsMap,
        isDirty, setIsDirty,
        savingWorkspace, setSavingWorkspace,
        savingPdf, setSavingPdf,
        deletedHighlights, setDeletedHighlights,
        deletedPdfTexts, setDeletedPdfTexts,
        setLoading,
        autosaveInterval,
        viewStateRef
    };

    // Unified Annotations List (Highlights + Text Notes + Drawings)
    const allAnnotations = React.useMemo(() => {
        const combined = [];

        // Add Highlights
        highlights.forEach(hl => {
            combined.push({
                id: hl.id,
                pageNum: hl.pageNum,
                type: 'highlight',
                content: hl.content || `Highlighted text on page ${hl.pageNum}`,
                color: hl.color,
                data: hl
            });
        });

        // Add Text Notes
        pdfAnnotations.forEach(annot => {
            combined.push({
                id: annot.id,
                pageNum: annot.pageNum,
                type: 'text',
                content: annot.text || 'Text Note',
                color: null,
                data: annot
            });
        });

        // Add Brush Highlights
        brushHighlights.forEach(h => {
            combined.push({
                id: h.id,
                pageNum: h.pageNum,
                type: 'brush-highlight',
                content: `Brush highlight on page ${h.pageNum}`,
                color: h.color,
                data: h
            });
        });

        // Add Drawings
        pdfLines.forEach(line => {
            combined.push({
                id: line.id,
                pageNum: line.pageNum,
                type: 'drawing',
                content: `Pen Drawing`,
                color: line.color,
                data: line
            });
        });

        // Sort by page number
        return combined.sort((a, b) => a.pageNum - b.pageNum);
    }, [highlights, pdfAnnotations, pdfLines, brushHighlights]);

    const TOOL_MODES = {
        SELECT: "select",
        DRAW_LINE: "draw-line",
        ADD_BOX: "add-box",
        PEN: "pen",
        ERASER: "eraser",
        HIGHLIGHT_BRUSH: "highlight-brush",
    };

    const handleAddWorkspace = useCallback(async (name, targetPdfId = null) => {
        const idToUse = targetPdfId || pdfId;
        if (!idToUse) return;
        try {
            const res = await api.createWorkspace(idToUse, name);
            setWorkspaces(prev => [...prev, res.data]);
            setActiveWorkspace(res.data);
            return res.data;
        } catch (err) {
            console.error("Error creating workspace:", err);
        }
    }, [pdfId]);

    const handlePDFSelect = useCallback(async (url, fileName, originalPath) => {
        if (loading || (selectedPDF === url && pdfName === fileName)) return;
        setLoading(true);
        setSelectedPDF(url);
        setPdfName(fileName);
        try {
            const backendPath = (originalPath || fileName).trim();
            console.log(`[DEBUG] opening PDF in backend. name=${fileName}, path=${backendPath}`);
            const openRes = await api.openPdf(fileName, backendPath);
            const pdfId = openRes.data.id;
            console.log(`[DEBUG] PDF opened with ID: ${pdfId}`);
            setPdfId(pdfId);

            const wsRes = await api.listWorkspaces(pdfId);
            setWorkspaces(wsRes.data);
            if (wsRes.data.length > 0) {
                setActiveWorkspace(wsRes.data[0]);
            } else {
                // IMPORTANT: Create a default workspace if none exists
                const defWs = await handleAddWorkspace("Main", pdfId);
                if (defWs) setActiveWorkspace(defWs);
            }
        } catch (err) {
            console.error("Error opening PDF:", err);
        } finally {
            setLoading(false);
        }
    }, [handleAddWorkspace, loading, selectedPDF, pdfName]);


    // load workspace
    useWorkspaceLoader(contextState);
    //save pdf and workspace changes

    const { savePdfChanges, saveWorkspaceChanges } = useWorkspaceSaver(contextState);
    const handleGlobalSave = useCallback(async () => {
        if (savingWorkspace || savingPdf) return;
        await Promise.all([savePdfChanges(), saveWorkspaceChanges()]);
    }, [savePdfChanges, saveWorkspaceChanges, savingWorkspace, savingPdf]);

    // --- Workspace Handlers ---

    const handleDeleteBox = useCallback((targetBoxId) => {
        recordHistory(getSnapshot());
        const sBoxId = String(targetBoxId);
        setEditableBoxes(prev => prev.filter(b => String(b.id) !== sBoxId));
        setConnections(prevConns => {
            const toRemove = prevConns.filter(c => String(c.from) === sBoxId || String(c.to) === sBoxId);
            const otherSideIds = toRemove.map(c => String(c.from) === sBoxId ? String(c.to) : String(c.from));
            const nextConns = prevConns.filter(c => !toRemove.includes(c));
            if (otherSideIds.length > 0) {
                setSnippets(prevSnips => prevSnips.filter(s => !(otherSideIds.includes(String(s.id)) && s.type === 'anchor')));
            }
            return nextConns;
        });
        setIsDirty(true);
    }, [recordHistory, getSnapshot]);

    const handleDeleteHighlight = useCallback((highlightId) => {
        if (!window.confirm("Delete this highlight?")) return;
        if (!String(highlightId).startsWith('temp-')) {
            setDeletedHighlights(prev => [...prev, highlightId]);
        }
        setHighlights(prev => prev.filter(hl => hl.id !== highlightId));
        setIsDirty(true);
    }, []);

    const handleDeleteBrushHighlight = useCallback(async (highlightId) => {
        if (!window.confirm("Delete this brush highlight?")) return;
        setBrushHighlights(prev => prev.filter(h => h.id !== highlightId));
        setIsDirty(true);
    }, []);

    const handleDeleteSnippet = useCallback((targetSnippetId) => {
        recordHistory(getSnapshot());
        const sSnippetId = String(targetSnippetId);
        setSnippets(prev => prev.filter(s => String(s.id) !== sSnippetId));
        setConnections(prevConns => prevConns.filter(c => String(c.from) !== sSnippetId && String(c.to) !== sSnippetId));
        setIsDirty(true);
    }, [recordHistory, getSnapshot]);

    const handleDeletePdfText = useCallback((annotId) => {
        if (!window.confirm("Delete this text?")) return;
        if (!String(annotId).startsWith('pdf-annot-')) {
            setDeletedPdfTexts(prev => [...prev, annotId]);
        }
        setPdfAnnotations(prev => prev.filter(a => a.id !== annotId));
        setIsDirty(true);
    }, []);

    const handleDeletePdfDrawing = useCallback((lineId) => {
        if (!window.confirm("Delete this drawing?")) return;
        setPdfLines(prev => prev.filter(l => l.id !== lineId));
        setIsDirty(true);
    }, []);

    const handleBrushHighlightCreate = useCallback((highlight) => {
        setBrushHighlights(prev => [...prev, highlight]);
        setIsDirty(true);
    }, []);





    // Clear history when switching workspace/PDF
    useEffect(() => {
        clearHistory();
    }, [activeWorkspace?.id, clearHistory]); // eslint-disable-line react-hooks/exhaustive-deps

    // Undo: restore previous snapshot (pass current state so redo can return to it)
    const handleUndo = useCallback(() => {
        console.log('[UndoRedo] handleUndo called, canUndo=', canUndo);
        const snapshot = undo(getSnapshot());
        console.log('[UndoRedo] snapshot=', snapshot);
        if (!snapshot) return;
        setSnippets(snapshot.snippets);
        setEditableBoxes(snapshot.editableBoxes);
        setLines(snapshot.lines);
        setConnections(snapshot.connections);
        setIsDirty(true);
    }, [undo, getSnapshot]);

    // Redo: restore next snapshot (pass current state so undo can return to it)
    const handleRedo = useCallback(() => {
        const snapshot = redo(getSnapshot());
        if (!snapshot) return;
        setSnippets(snapshot.snippets);
        setEditableBoxes(snapshot.editableBoxes);
        setLines(snapshot.lines);
        setConnections(snapshot.connections);
        setIsDirty(true);
    }, [redo, getSnapshot]);

    // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y or Ctrl+Shift+Z = redo
    useEffect(() => {
        const handleKeyDown = (e) => {
            const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
            if (isInput) return;
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
                e.preventDefault();
                handleUndo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo]);

    // Local Storage Sync (Backup)
    useLocalStorageSync(snippets, connections, editableBoxes, lines, pdfLines);

    const value = {
        tool, setTool,
        pdfId, setPdfId,
        userId, setUserId,
        pdfName, setPdfName,
        activeWorkspace, setActiveWorkspace,
        workspaces, setWorkspaces,
        loading, setLoading,
        isDirty, setIsDirty,
        searchText, setSearchText,
        searchMatches, setSearchMatches,
        currentMatchIndex, setCurrentMatchIndex,
        selectedItem, setSelectedItem,
        highlights, setHighlights,
        pdfAnnotations, setPdfAnnotations,
        pdfLines, setPdfLines,
        brushHighlights, setBrushHighlights,
        deletedHighlights, setDeletedHighlights,
        deletedPdfTexts, setDeletedPdfTexts,
        showThumbnails, setShowThumbnails,
        showPageJump, setShowPageJump,
        showHighlightsList, setShowHighlightsList,
        showWorkspaceSidebar, setShowWorkspaceSidebar,
        autosaveInterval, setAutosaveInterval,
        savingWorkspace, setSavingWorkspace,
        savingPdf, setSavingPdf,
        zoomLevel, setZoomLevel,
        pdfRenderScale, setPdfRenderScale,
        pdfPanelWidth, setPdfPanelWidth,
        isResizing, setIsResizing,
        pdfRef, canvasRef, saveRef, viewStateRef,
        handleDeleteBox, handleDeleteHighlight, handleDeleteBrushHighlight,
        handleDeleteSnippet, handleDeletePdfText, handleDeletePdfDrawing,
        handleBrushHighlightCreate, handlePDFSelect, handleGlobalSave,
        handleAddWorkspace,
        handleUndo, handleRedo, canUndo, canRedo, recordHistory, getSnapshot,
        savePdfChanges, saveWorkspaceChanges,
        snippets, setSnippets,
        connections, setConnections,
        lineStartId, setLineStartId,
        editableBoxes, setEditableBoxes,
        lines, setLines,
        existingSnippetsMap, setExistingSnippetsMap,
        selectedPDF, setSelectedPDF,
        pdfDrawingColor, setPdfDrawingColor,
        highlightBrushColor, setHighlightBrushColor,
        allAnnotations,
        TOOL_MODES
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error("useApp must be used within an AppProvider");
    }
    return context;
};
