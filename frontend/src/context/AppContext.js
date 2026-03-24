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

    // Bookmarks
    const [bookmarks, setBookmarks] = useState([]);
    const [showBookmarks, setShowBookmarks] = useState(false);

    // PDF Summary States
    const [showSummary, setShowSummary] = useState(false);
    const [summary, setSummary] = useState("");
    const [summaryLoading, setSummaryLoading] = useState(false);

    // Tracks a newly created "summary" workspace waiting to be auto-populated
    const [pendingSummaryWorkspaceId, setPendingSummaryWorkspaceId] = useState(null);

    // Settings
    const [autosaveInterval, setAutosaveInterval] = useState(5000);

    const [savingWorkspace, setSavingWorkspace] = useState(false);
    const [savingPdf, setSavingPdf] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [pdfRenderScale, setPdfRenderScale] = useState(1.5);
    const [pdfPanelWidth, setPdfPanelWidth] = useState(55);
    const [isResizing, setIsResizing] = useState(false);

    // Refs
    const pdfRef  = useRef(null);   // Left PDF panel ref
    const pdf2Ref = useRef(null);   // Right PDF panel ref
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
    const [groups, setGroups] = useState([]);

    // Refs to always access latest workspace state (used by undo/redo snapshot)
    const snippetsRef = useRef(snippets);
    const connectionsRef = useRef(connections);
    const editableBoxesRef = useRef(editableBoxes);
    const linesRef = useRef(lines);
    useEffect(() => { snippetsRef.current = snippets; }, [snippets]);
    useEffect(() => { connectionsRef.current = connections; }, [connections]);
    useEffect(() => { editableBoxesRef.current = editableBoxes; }, [editableBoxes]);
    useEffect(() => { linesRef.current = lines; }, [lines]);

    const groupsRef = useRef(groups);
    useEffect(() => { groupsRef.current = groups; }, [groups]);

    // Capture current workspace state as a snapshot
    const getSnapshot = useCallback(() => ({
        snippets: snippetsRef.current,
        editableBoxes: editableBoxesRef.current,
        lines: linesRef.current,
        connections: connectionsRef.current,
        groups: groupsRef.current,
    }), []);

    // PDF Tabs
    const [pdfTabs, setPdfTabs] = useState([]);
    const [activeTabId, setActiveTabId] = useState(null);

    // Color palette — one color per PDF tab (cycles if more than palette length)
    const PDF_TAB_COLORS = ["#3b82f6", "#10b981", "#f97316", "#8b5cf6", "#ef4444", "#06b6d4", "#f59e0b"];

    // Secondary PDFs open in the same workspace
    const [secondaryPdfs, setSecondaryPdfs] = useState([]);

    // Cross-PDF connection lines (LiquidText-style wire between text in two PDFs)
    const [crossPdfLinks, setCrossPdfLinks] = useState([]);
    const [pendingCrossLink, setPendingCrossLink] = useState(null);
    const [lastCreatedCrossLinkId, setLastCreatedCrossLinkId] = useState(null);

    // Drag-wire state: { from: endpoint, x: mouseX, y: mouseY }
    const [dragWire, setDragWire] = useState(null);

    // Use a ref so completeDragWireLink can read current dragWire without
    // nesting setCrossPdfLinks inside setDragWire (which React Strict Mode
    // double-invokes, causing duplicate links).
    const dragWireRef = useRef(null);
    useEffect(() => { dragWireRef.current = dragWire; }, [dragWire]);

    const pendingCrossLinkRef = useRef(null);
    useEffect(() => { pendingCrossLinkRef.current = pendingCrossLink; }, [pendingCrossLink]);

    const startCrossLink = useCallback((endpoint) => {
        setPendingCrossLink(endpoint);
    }, []);

    const completeCrossLink = useCallback((endpoint) => {
        const prev = pendingCrossLinkRef.current;
        if (!prev) return;
        const newLink = { id: `xlink-${Date.now()}`, from: prev, to: endpoint };
        setPendingCrossLink(null);
        setCrossPdfLinks(links => [...links, newLink]);
        setLastCreatedCrossLinkId(newLink.id);
        setIsDirty(true);
    }, []);

    const deleteCrossLink = useCallback((id) => {
        setCrossPdfLinks(prev => prev.filter(l => l.id !== id));
        setIsDirty(true);
    }, []);

    // Auto-deduplicate crossPdfLinks whenever they change
    // (cleans up duplicates that may have been saved to the backend)
    useEffect(() => {
        if (crossPdfLinks.length < 2) return;
        const sourceKey = (ep) =>
            `${ep?.pdfId}-${ep?.pageNum}-${Math.round((ep?.xPct||0)*100)}-${Math.round((ep?.yPct||0)*100)}-${ep?.snippetId||''}`;
        const seen = new Set();
        let hasDup = false;
        const deduped = crossPdfLinks.filter(l => {
            const k = sourceKey(l.from);
            if (seen.has(k)) { hasDup = true; return false; }
            seen.add(k);
            return true;
        });
        if (hasDup) setCrossPdfLinks(deduped);
    }, [crossPdfLinks]);

    const startDragWire = useCallback((endpoint, x, y) => {
        setDragWire({ from: endpoint, x, y });
    }, []);

    const moveDragWire = useCallback((x, y) => {
        setDragWire(prev => prev ? { ...prev, x, y } : null);
    }, []);

    const completeDragWireLink = useCallback((toEndpoint) => {
        const current = dragWireRef.current;
        if (!current) return;
        // Prevent connecting same PDF to itself
        if (current.from.pdfId && toEndpoint.pdfId &&
            String(current.from.pdfId) === String(toEndpoint.pdfId)) {
            setDragWire(null);
            return;
        }
        const newLink = { id: `xlink-${Date.now()}`, from: current.from, to: toEndpoint };
        // Clear the wire first so it can't fire twice
        setDragWire(null);
        dragWireRef.current = null;
        setCrossPdfLinks(links => {
            // Replace any existing link with the same source endpoint (dedup)
            const sourceKey = (ep) => `${ep.pdfId}-${ep.pageNum}-${Math.round((ep.xPct||0)*100)}-${Math.round((ep.yPct||0)*100)}-${ep.snippetId||''}`;
            const key = sourceKey(current.from);
            const filtered = links.filter(l => sourceKey(l.from) !== key && sourceKey(l.to) !== key);
            return [...filtered, newLink];
        });
        setLastCreatedCrossLinkId(newLink.id);
        setIsDirty(true);
    }, []);

    const cancelDragWire = useCallback(() => {
        setDragWire(null);
        dragWireRef.current = null;
    }, []);

    // Right PDF panel (side-by-side view)
    const [panel2TabId,  setPanel2TabId]  = useState(null);
    const [panel2PdfId,  setPanel2PdfId]  = useState(null);
    const [panel2PdfUrl, setPanel2PdfUrl] = useState(null);
    const [panel2PdfName, setPanel2PdfName] = useState(null);

    const openInPanel2 = useCallback((tab) => {
        setPanel2TabId(tab.tabId);
        setPanel2PdfId(tab.pdfId);
        setPanel2PdfUrl(tab.url);
        setPanel2PdfName(tab.name);
    }, []);

    const closePanel2 = useCallback(() => {
        // Remove cross-PDF links that reference the closing panel's PDF
        setPanel2PdfId(prev => {
            if (prev) {
                setCrossPdfLinks(links =>
                    links.filter(l =>
                        String(l.from.pdfId) !== String(prev) &&
                        String(l.to.pdfId)   !== String(prev)
                    )
                );
            }
            return null;
        });
        setPanel2TabId(null);
        setPanel2PdfUrl(null);
        setPanel2PdfName(null);
        setDragWire(null);
        setPendingCrossLink(null);
    }, []);

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
        viewStateRef,
        groups, setGroups,
        setCrossPdfLinks,
        crossPdfLinks,
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
        STICKY_NOTE: "sticky-note",
    };

    const handleAddWorkspace = useCallback(async (name, targetPdfId = null) => {
        const idToUse = targetPdfId || pdfId;
        if (!idToUse) return;
        try {
            const res = await api.createWorkspace(idToUse, name);
            setWorkspaces(prev => [...prev, res.data]);
            setActiveWorkspace(res.data);
            // If named "summary", flag it for auto-population after load
            if (name.trim().toLowerCase() === "summary") {
                setPendingSummaryWorkspaceId(res.data.id);
            }
            return res.data;
        } catch (err) {
            console.error("Error creating workspace:", err);
        }
    }, [pdfId]);

    const handlePDFSelect = useCallback(async (url, fileName, originalPath) => {
        if (loading) return;
        setLoading(true);
        setSelectedPDF(url);
        setPdfName(fileName);
        try {
            const backendPath = (originalPath || fileName).trim();
            const openRes = await api.openPdf(fileName, backendPath);
            const newPdfId = openRes.data.id;
            setPdfId(newPdfId);

            const wsRes = await api.listWorkspaces(newPdfId);
            setWorkspaces(wsRes.data);
            let firstWs;
            if (wsRes.data.length > 0) {
                firstWs = wsRes.data[0];
                setActiveWorkspace(firstWs);
            } else {
                firstWs = await handleAddWorkspace("Main", newPdfId);
                await handleAddWorkspace("summary", newPdfId);
            }

            // Register as a new tab (with color)
            const tabId = `tab-${newPdfId}-${Date.now()}`;
            setPdfTabs(prev => {
                // Don't duplicate same PDF
                const exists = prev.find(t => t.pdfId === newPdfId);
                if (exists) {
                    setActiveTabId(exists.tabId);
                    return prev;
                }
                const color = PDF_TAB_COLORS[prev.length % PDF_TAB_COLORS.length];
                setActiveTabId(tabId);
                return [...prev, { tabId, url, name: fileName, pdfId: newPdfId, color }];
            });
        } catch (err) {
            console.error("Error opening PDF:", err);
        } finally {
            setLoading(false);
        }
    }, [handleAddWorkspace, loading]);

    const switchPdfTab = useCallback((tab) => {
        if (activeTabId === tab.tabId) return;
        // Just swap the PDF viewer — keep the current workspace intact.
        // The workspace canvas stays the same; snippets from both PDFs coexist.
        setActiveTabId(tab.tabId);
        setSelectedPDF(tab.url);
        setPdfName(tab.name);
        setPdfId(tab.pdfId);
    }, [activeTabId]);

    const addSecondaryPdf = useCallback((url, name, newPdfId) => {
        setSecondaryPdfs(prev => {
            if (prev.find(p => p.pdfId === newPdfId)) return prev;
            const pdfRef = React.createRef();
            return [...prev, { url, name, pdfId: newPdfId, pdfRef }];
        });
    }, []);

    const removeSecondaryPdf = useCallback((pdfId) => {
        setSecondaryPdfs(prev => prev.filter(p => p.pdfId !== pdfId));
    }, []);

    const closePdfTab = useCallback((tabId) => {
        setPdfTabs(prev => {
            const remaining = prev.filter(t => t.tabId !== tabId);
            if (activeTabId === tabId && remaining.length > 0) {
                const next = remaining[remaining.length - 1];
                setActiveTabId(next.tabId);
                setSelectedPDF(next.url);
                setPdfName(next.name);
                setPdfId(next.pdfId);
                // workspace stays unchanged
            } else if (remaining.length === 0) {
                setActiveTabId(null);
                setSelectedPDF(null);
                setPdfName("");
                setPdfId(null);
                setWorkspaces([]);
                setActiveWorkspace(null);
            }
            return remaining;
        });
    }, [activeTabId]);


    // Jump to the source location of a workspace snippet in the correct PDF panel
    const jumpToSource = useCallback((snippet) => {
        const snippetPdfId = String(snippet.pdf_id || snippet.sourcePdfId || "");
        if (!snippetPdfId) return;

        const scrollRef = (ref) => {
            setTimeout(() => {
                if (!ref.current) return;
                if (snippet.xPct !== undefined && snippet.yPct !== undefined) {
                    ref.current.scrollToSnippet?.(snippet);
                } else if (snippet.pageNum) {
                    ref.current.scrollToPage?.(snippet.pageNum);
                }
            }, 150);
        };

        // Already showing in the right panel → scroll it directly
        if (panel2PdfId && String(panel2PdfId) === snippetPdfId) {
            scrollRef(pdf2Ref);
            return;
        }

        // Already showing in the left panel → scroll it directly
        if (String(pdfId) === snippetPdfId) {
            scrollRef(pdfRef);
            return;
        }

        // PDF is loaded in a tab but not currently visible → switch left panel to it
        setPdfTabs(prev => {
            const tab = prev.find(t => String(t.pdfId) === snippetPdfId);
            if (!tab) return prev;
            setActiveTabId(tab.tabId);
            setSelectedPDF(tab.url);
            setPdfName(tab.name);
            setPdfId(tab.pdfId);
            scrollRef(pdfRef);
            return prev;
        });
    }, [pdfId, panel2PdfId, pdfRef, pdf2Ref]); // eslint-disable-line

    // Load bookmarks when PDF changes
    useEffect(() => {
        if (!pdfId) return;
        api.listBookmarks(pdfId).then(res => setBookmarks(res.data)).catch(() => {});
    }, [pdfId]);

    const handleAddBookmark = useCallback(async (pageNum, name) => {
        if (!pdfId) return;
        const label = name || `Page ${pageNum}`;
        try {
            const res = await api.createBookmark(pdfId, pageNum, label);
            setBookmarks(prev => [...prev, res.data].sort((a, b) => a.page_num - b.page_num));
        } catch (err) {
            console.error("Bookmark create error:", err);
        }
    }, [pdfId]);

    const handleDeleteBookmark = useCallback(async (bookmarkId) => {
        try {
            await api.deleteBookmark(bookmarkId);
            setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
        } catch (err) {
            console.error("Bookmark delete error:", err);
        }
    }, []);

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

    const GROUP_PALETTE = ['#FFE4B5', '#B5E4FF', '#D4FFD4', '#FFD4E8', '#E0D4FF', '#FFFDB5'];

    const handleCreateGroup = useCallback((itemIds) => {
        recordHistory(getSnapshot());
        setGroups(prev => {
            const color = GROUP_PALETTE[prev.length % GROUP_PALETTE.length];
            return [...prev, {
                id: `group-${Date.now()}`,
                name: `Group ${prev.length + 1}`,
                color,
                itemIds: itemIds.map(String),
                collapsed: false,
            }];
        });
        setIsDirty(true);
    }, [recordHistory, getSnapshot]);

    const handleUngroupItems = useCallback((groupId) => {
        recordHistory(getSnapshot());
        setGroups(prev => prev.filter(g => g.id !== groupId));
        setIsDirty(true);
    }, [recordHistory, getSnapshot]);

    const handleToggleGroupCollapse = useCallback((groupId) => {
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g));
        setIsDirty(true);
    }, []);

    const handleSetGroupColor = useCallback((groupId, color) => {
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, color } : g));
        setIsDirty(true);
    }, []);

    const handleRenameGroup = useCallback((groupId, name) => {
        setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name } : g));
        setIsDirty(true);
    }, []);


    // Clear history when switching workspace/PDF
    useEffect(() => {
        clearHistory();
        setGroups([]);
    }, [activeWorkspace?.id, clearHistory]); // eslint-disable-line react-hooks/exhaustive-deps

    // Undo: restore previous snapshot (pass current state so redo can return to it)
    const handleUndo = useCallback(() => {
        const snapshot = undo(getSnapshot());
        if (!snapshot) return;
        setSnippets(snapshot.snippets);
        setEditableBoxes(snapshot.editableBoxes);
        setLines(snapshot.lines);
        setConnections(snapshot.connections);
        setGroups(snapshot.groups || []);
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
        setGroups(snapshot.groups || []);
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
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo]);

    // Auto-generate summary when a "summary" workspace is created
    useEffect(() => {
        if (!pendingSummaryWorkspaceId) return;
        if (activeWorkspace?.id !== pendingSummaryWorkspaceId) return;
        if (!pdfRef.current) return;

        setPendingSummaryWorkspaceId(null);

        (async () => {
            try {
                const text = await pdfRef.current.extractAllText();
                if (!text || !text.trim()) {
                    setEditableBoxes(prev => [...prev, {
                        id: `temp-summary-${Date.now()}`,
                        text: "No text could be extracted from this PDF.",
                        x: 30, y: 30, width: 520, height: 80
                    }]);
                    setIsDirty(true);
                    return;
                }
                const res = await api.summarizePdf(text);
                setEditableBoxes(prev => [...prev, {
                    id: `temp-summary-${Date.now()}`,
                    text: res.data.summary,
                    x: 30, y: 30, width: 560, height: 500
                }]);
                setIsDirty(true);
            } catch (err) {
                console.error("Auto-summary error:", err);
                setEditableBoxes(prev => [...prev, {
                    id: `temp-summary-${Date.now()}`,
                    text: "Failed to generate summary. Please try again.",
                    x: 30, y: 30, width: 520, height: 80
                }]);
                setIsDirty(true);
            }
        })();
    }, [pendingSummaryWorkspaceId, activeWorkspace]); // eslint-disable-line react-hooks/exhaustive-deps

    // PDF Summarization
    const handleSummarizePdf = useCallback(async () => {
        if (!pdfRef.current) return;
        setShowSummary(true);
        setSummaryLoading(true);
        setSummary("");
        try {
            const text = await pdfRef.current.extractAllText();
            if (!text || !text.trim()) {
                setSummary("No text could be extracted from this PDF.");
                return;
            }
            const res = await api.summarizePdf(text);
            const summaryText = res.data.summary;
            setSummary(summaryText);

            // If currently in the "summary" workspace, update/replace the box content
            if (activeWorkspace?.name?.toLowerCase() === "summary") {
                setEditableBoxes(prev => {
                    if (prev.length > 0) {
                        // Replace the first box with updated summary
                        return prev.map((b, i) => i === 0 ? { ...b, text: summaryText } : b);
                    }
                    return [...prev, {
                        id: `temp-summary-${Date.now()}`,
                        text: summaryText,
                        x: 30, y: 30, width: 560, height: 500
                    }];
                });
                setIsDirty(true);
            }
        } catch (err) {
            setSummary("Failed to generate summary. Please try again.");
            console.error("Summarization error:", err);
        } finally {
            setSummaryLoading(false);
        }
    }, [pdfRef, activeWorkspace, setEditableBoxes, setIsDirty]);

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
        pdfRef, pdf2Ref, canvasRef, saveRef, viewStateRef,
        handleDeleteBox, handleDeleteHighlight, handleDeleteBrushHighlight,
        handleDeleteSnippet, handleDeletePdfText, handleDeletePdfDrawing,
        handleBrushHighlightCreate, handlePDFSelect, handleGlobalSave,
        handleAddWorkspace,
        handleUndo, handleRedo, canUndo, canRedo, recordHistory, getSnapshot,
        groups, setGroups,
        handleCreateGroup, handleUngroupItems, handleToggleGroupCollapse, handleSetGroupColor, handleRenameGroup,
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
        TOOL_MODES,
        showSummary, setShowSummary,
        summary, setSummary,
        summaryLoading,
        handleSummarizePdf,
        bookmarks, setBookmarks,
        showBookmarks, setShowBookmarks,
        handleAddBookmark, handleDeleteBookmark,
        pdfTabs, activeTabId,
        switchPdfTab, closePdfTab,
        secondaryPdfs, addSecondaryPdf, removeSecondaryPdf,
        jumpToSource,
        pdf2Ref,
        panel2TabId, panel2PdfId, panel2PdfUrl, panel2PdfName,
        openInPanel2, closePanel2,
        crossPdfLinks, setCrossPdfLinks, pendingCrossLink,
        startCrossLink, completeCrossLink, deleteCrossLink,
        lastCreatedCrossLinkId, setLastCreatedCrossLinkId,
        dragWire, startDragWire, moveDragWire, completeDragWireLink, cancelDragWire,
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
