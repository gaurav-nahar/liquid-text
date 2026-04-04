/**
 * AppContext — orchestration layer.
 *
 * Provider tree:  UIProvider → WorkspaceProvider → PDFProvider → AppInner
 *
 * Three focused contexts hold state:
 *   useWorkspace()  — canvas data (snippets, boxes, lines, connections, groups, undo/redo)
 *   usePDF()        — PDF annotation data (highlights, drawings, bookmarks, search, summary)
 *   useUI()         — UI state (tool, tabs, panel2, cross-pdf wires, toggles, zoom)
 *
 * Two backward-compat hooks compose all three:
 *   useApp()        — full combined value (all 56 original fields + cross-context handlers)
 *   useAppActions() — ONLY stable cross-context callbacks; rarely causes re-renders
 *
 * Heavy consumers (Workspace, PDFViewer) import specific hooks to avoid
 * unnecessary re-renders when unrelated slices change.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { UIProvider, useUI } from './UIContext';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import { PDFProvider, usePDF } from './PDFContext';
import useLocalStorageSync from '../hooks/useLocalStorageSync';
import useWorkspaceLoader from '../services/useWorkspaceLoader';
import useWorkspaceSaver from '../services/useWorkspaceSaver';
import api from '../api/api';
import { getCurrentTimestampName } from '../utils/defaultNames';

// ── Two exported contexts ─────────────────────────────────────────────────────
// AppContext      — full combined value (backward compat for useApp())
// AppActionsContext — stable handlers only (for useAppActions())
const AppContext = createContext(null);
const AppActionsContext = createContext(null);
const SUMMARY_POLL_INTERVAL_MS = 2500;
const SUMMARY_MAX_POLL_ATTEMPTS = 180;

const buildCaseKey = (diaryNo = "", diaryYear = "", establishment = "") =>
    [diaryNo.trim(), diaryYear.trim(), establishment.trim().toLowerCase()].join("::");

const readCaseContextFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const diaryNo = (params.get("diary_no") || "").trim();
    const diaryYear = (params.get("diary_year") || "").trim();
    const establishment = (params.get("establishment") || "").trim();
    return {
        diaryNo,
        diaryYear,
        establishment,
        caseKey: buildCaseKey(diaryNo, diaryYear, establishment),
        hasCaseContext: Boolean(diaryNo || diaryYear || establishment),
    };
};

const getSummaryErrorMessage = (err) => {
    if (err?.code === "ECONNABORTED") {
        return "Summary request timed out in the browser. The GPU service may still be processing. Increase REACT_APP_SUMMARY_TIMEOUT_MS if this happens often.";
    }

    return err?.response?.data?.detail || err?.message || "Failed to generate summary. Please try again.";
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Inner orchestration component ─────────────────────────────────────────────
// Lives inside all three sub-context providers so it can read & combine them.
function AppInner({ children }) {
    // ── Pull state from each sub-context ─────────────────────────────────────
    const workspace = useWorkspace();
    const pdf = usePDF();
    const ui = useUI();

    const {
        pdfId, setPdfId,
        activeWorkspace, setActiveWorkspace,
        setWorkspaces,
        setSnippets, setEditableBoxes, setLines, setConnections, setGroups,
        setIsDirty, savingWorkspace, setSavingWorkspace,
        setExistingSnippetsMap,
        viewStateRef,
        pendingSummaryWorkspaceId, setPendingSummaryWorkspaceId,
        pendingSummaryText, setPendingSummaryText,
        pdfRef, pdf2Ref,
        handleUndo, handleRedo,
    } = workspace;

    const {
        setSelectedPDF, setPdfName,
        setHighlights, setPdfAnnotations, setPdfLines, setBrushHighlights,
        setDeletedHighlights, setDeletedPdfTexts,
        setBookmarks,
        setShowSummary, setSummary, setSummaryLoading,
        savingPdf, setSavingPdf,
    } = pdf;

    const {
        loading, setLoading,
        autosaveInterval,
        crossPdfLinks, setCrossPdfLinks,
        setPendingCrossLink, setDragWire,
        dragWireRef, pendingCrossLinkRef,
        pdfTabs,
        setPdfTabs,
        activeTabId, setActiveTabId,
        setLastCreatedCrossLinkId,
        PDF_TAB_COLORS,
        panel2PdfId,
        closePanel2,
        casePdfList, setCasePdfList,
    } = ui;

    const caseSessionRef = useRef({ key: null, workspacePdfId: null });
    const pdfBlobUrlCacheRef = useRef(new Map());

    // ── Build contextState for useWorkspaceLoader / useWorkspaceSaver ─────────
    // These services accept a flat object; we assemble it from all sub-contexts.
    const contextState = useMemo(() => ({
        pdfId, activeWorkspace,
        setLoading,
        setSnippets, setEditableBoxes, setLines, setConnections,
        setHighlights, setPdfAnnotations, setPdfLines, setBrushHighlights,
        setExistingSnippetsMap, setIsDirty, viewStateRef,
        setGroups, setCrossPdfLinks,
        snippets: workspace.snippets,
        editableBoxes: workspace.editableBoxes,
        lines: workspace.lines,
        connections: workspace.connections,
        highlights: pdf.highlights,
        pdfAnnotations: pdf.pdfAnnotations,
        pdfLines: pdf.pdfLines,
        brushHighlights: pdf.brushHighlights,
        existingSnippetsMap: workspace.existingSnippetsMap,
        isDirty: workspace.isDirty,
        savingWorkspace, setSavingWorkspace,
        savingPdf, setSavingPdf,
        deletedHighlights: pdf.deletedHighlights,
        setDeletedHighlights,
        deletedPdfTexts: pdf.deletedPdfTexts,
        setDeletedPdfTexts,
        autosaveInterval,
        groups: workspace.groups,
        crossPdfLinks,
        pendingSummaryText, setPendingSummaryText,
    }), [
        pdfId, activeWorkspace,
        workspace.snippets, workspace.editableBoxes, workspace.lines, workspace.connections,
        workspace.existingSnippetsMap, workspace.isDirty, workspace.groups,
        pdf.highlights, pdf.pdfAnnotations, pdf.pdfLines, pdf.brushHighlights,
        pdf.deletedHighlights, pdf.deletedPdfTexts,
        savingWorkspace, savingPdf, autosaveInterval, crossPdfLinks,
        pendingSummaryText, setPendingSummaryText,
        setLoading, setSnippets, setEditableBoxes, setLines, setConnections,
        setHighlights, setPdfAnnotations, setPdfLines, setBrushHighlights,
        setExistingSnippetsMap, setIsDirty, viewStateRef, setGroups, setCrossPdfLinks,
        setSavingWorkspace, setSavingPdf, setDeletedHighlights, setDeletedPdfTexts,
    ]);

    useWorkspaceLoader(contextState);
    const { savePdfChanges, saveWorkspaceChanges } = useWorkspaceSaver(contextState);

    // Keep localStorage as offline backup
    useLocalStorageSync(
        workspace.snippets, workspace.connections,
        workspace.editableBoxes, workspace.lines, pdf.pdfLines
    );

    // Load bookmarks when pdfId changes
    useEffect(() => {
        if (!pdfId) return;
        api.listBookmarks(pdfId).then(res => setBookmarks(res.data)).catch(() => {});
    }, [pdfId, setBookmarks]);

    const activatePdfTab = useCallback((tab) => {
        if (!tab) return;
        setActiveTabId(tab.tabId);
        setSelectedPDF(tab.url);
        setPdfName(tab.name);
        setPdfId(tab.pdfId);
    }, [setActiveTabId, setSelectedPDF, setPdfName, setPdfId]);

    const cachePdfBlobUrl = useCallback(async (sourceUrl) => {
        const normalized = (sourceUrl || "").trim();
        if (!normalized) {
            throw new Error("Missing PDF URL");
        }

        const cache = pdfBlobUrlCacheRef.current;
        if (cache.has(normalized)) {
            return cache.get(normalized);
        }

        const response = await fetch(normalized, {
            method: "GET",
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(`Failed to load PDF: ${response.status}`);
        }

        const blob = await response.blob();
        if (!blob || blob.size === 0) {
            throw new Error("Received empty PDF file");
        }

        // Validate PDF magic bytes before creating blob URL
        const header = await blob.slice(0, 5).text();
        if (!header.startsWith("%PDF-")) {
            throw new Error(`URL does not point to a valid PDF file: ${normalized}`);
        }

        const objectUrl = URL.createObjectURL(blob);
        cache.set(normalized, objectUrl);
        return objectUrl;
    }, []);

    const ensureCaseWorkspace = useCallback(async () => {
        const wsRes = await api.getCaseWorkspace();
        const ws = wsRes.data;
        setWorkspaces([ws]);
        setActiveWorkspace(ws);
        caseSessionRef.current.workspaceId = ws.id;
        return ws;
    }, [setWorkspaces, setActiveWorkspace]);

    const requestSummaryText = useCallback(async (text) => {
        const startRes = await api.startPdfSummary(text);
        const startPayload = startRes.data || {};

        if (startPayload.status === "completed" && startPayload.summary) {
            return startPayload.summary;
        }

        const cacheKey = startPayload.cache_key;
        if (!cacheKey) {
            throw new Error("Summary job did not return a cache key.");
        }

        for (let attempt = 0; attempt < SUMMARY_MAX_POLL_ATTEMPTS; attempt += 1) {
            const statusRes = await api.getPdfSummaryStatus(cacheKey);
            const statusPayload = statusRes.data || {};

            if (statusPayload.status === "completed" && statusPayload.summary) {
                return statusPayload.summary;
            }

            if (statusPayload.status === "failed") {
                throw new Error(statusPayload.error || "Summary generation failed.");
            }

            await sleep(SUMMARY_POLL_INTERVAL_MS);
        }

        throw new Error("Summary generation is still running. Please wait a bit and try again.");
    }, []);

    // ── Global save ───────────────────────────────────────────────────────────
    const handleGlobalSave = useCallback(async () => {
        if (savingWorkspace || savingPdf) return;
        await Promise.all([savePdfChanges(), saveWorkspaceChanges()]);
    }, [savePdfChanges, saveWorkspaceChanges, savingWorkspace, savingPdf]);

    // ── PDF annotation handlers (cross-context: need setIsDirty from Workspace) ─
    const handleDeleteHighlight = useCallback((highlightId) => {
        if (!window.confirm("Delete this highlight?")) return;
        if (!String(highlightId).startsWith('temp-')) {
            setDeletedHighlights(prev => [...prev, highlightId]);
        }
        setHighlights(prev => prev.filter(hl => hl.id !== highlightId));
        setIsDirty(true);
    }, [setDeletedHighlights, setHighlights, setIsDirty]);

    const handleDeleteBrushHighlight = useCallback(async (highlightId) => {
        if (!window.confirm("Delete this brush highlight?")) return;
        setBrushHighlights(prev => prev.filter(h => h.id !== highlightId));
        setIsDirty(true);
    }, [setBrushHighlights, setIsDirty]);

    const handleDeletePdfText = useCallback((annotId) => {
        if (!window.confirm("Delete this text?")) return;
        if (!String(annotId).startsWith('pdf-annot-')) {
            setDeletedPdfTexts(prev => [...prev, annotId]);
        }
        setPdfAnnotations(prev => prev.filter(a => a.id !== annotId));
        setIsDirty(true);
    }, [setDeletedPdfTexts, setPdfAnnotations, setIsDirty]);

    const handleDeletePdfDrawing = useCallback((lineId) => {
        if (!window.confirm("Delete this drawing?")) return;
        setPdfLines(prev => prev.filter(l => l.id !== lineId));
        setIsDirty(true);
    }, [setPdfLines, setIsDirty]);

    const handleBrushHighlightCreate = useCallback((highlight) => {
        setBrushHighlights(prev => [...prev, highlight]);
        setIsDirty(true);
    }, [setBrushHighlights, setIsDirty]);

    // ── Bookmark handlers ─────────────────────────────────────────────────────
    const handleAddBookmark = useCallback(async (pageNum, name) => {
        if (!pdfId) return;
        const label = name || `Page ${pageNum}`;
        try {
            const res = await api.createBookmark(pdfId, pageNum, label);
            setBookmarks(prev => {
                const existingIndex = prev.findIndex(b => b.id === res.data.id || b.page_num === res.data.page_num);
                if (existingIndex === -1) return [...prev, res.data].sort((a, b) => a.page_num - b.page_num);
                const next = [...prev];
                next[existingIndex] = res.data;
                return next.sort((a, b) => a.page_num - b.page_num);
            });
            return res.data;
        } catch (err) {
            console.error("Bookmark create error:", err);
            throw err;
        }
    }, [pdfId, setBookmarks]);

    const handleDeleteBookmark = useCallback(async (bookmarkId) => {
        try {
            await api.deleteBookmark(bookmarkId);
            setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
        } catch (err) {
            console.error("Bookmark delete error:", err);
        }
    }, [setBookmarks]);

    // ── Cross-PDF link handlers (need setIsDirty from WorkspaceContext) ───────
    const completeCrossLink = useCallback((endpoint) => {
        const prev = pendingCrossLinkRef.current;
        if (!prev) return;
        const newLink = { id: `xlink-${Date.now()}`, from: prev, to: endpoint };
        setPendingCrossLink(null);
        setCrossPdfLinks(links => [...links, newLink]);
        setLastCreatedCrossLinkId(newLink.id);
        setIsDirty(true);
    }, [pendingCrossLinkRef, setPendingCrossLink, setCrossPdfLinks, setLastCreatedCrossLinkId, setIsDirty]);

    const deleteCrossLink = useCallback((id) => {
        setCrossPdfLinks(prev => prev.filter(l => l.id !== id));
        setIsDirty(true);
    }, [setCrossPdfLinks, setIsDirty]);

    const completeDragWireLink = useCallback((toEndpoint) => {
        const current = dragWireRef.current;
        if (!current) return;
        if (current.from.pdfId && toEndpoint.pdfId &&
            String(current.from.pdfId) === String(toEndpoint.pdfId)) {
            setDragWire(null);
            return;
        }
        const newLink = { id: `xlink-${Date.now()}`, from: current.from, to: toEndpoint };
        setDragWire(null);
        dragWireRef.current = null;
        setCrossPdfLinks(links => {
            const sourceKey = (ep) =>
                `${ep.pdfId}-${ep.pageNum}-${Math.round((ep.xPct || 0) * 100)}-${Math.round((ep.yPct || 0) * 100)}-${ep.snippetId || ''}`;
            const key = sourceKey(current.from);
            const filtered = links.filter(l => sourceKey(l.from) !== key && sourceKey(l.to) !== key);
            return [...filtered, newLink];
        });
        setLastCreatedCrossLinkId(newLink.id);
        setIsDirty(true);
    }, [dragWireRef, setDragWire, setCrossPdfLinks, setLastCreatedCrossLinkId, setIsDirty]);

    // ── Workspace management ──────────────────────────────────────────────────
    const handleAddWorkspace = useCallback(async (name, targetPdfId = null) => {
        const idToUse = targetPdfId ?? (caseSessionRef.current.workspaceId ? 0 : (caseSessionRef.current.workspacePdfId || pdfId));
        if (idToUse === null || idToUse === undefined) return;
        const nextName = name?.trim() || getCurrentTimestampName();
        try {
            const res = await api.createWorkspace(idToUse, nextName);
            setWorkspaces(prev => [...prev, res.data]);
            setActiveWorkspace(res.data);
            if (nextName.toLowerCase() === "summary") {
                setPendingSummaryWorkspaceId(res.data.id);
            }
            return res.data;
        } catch (err) {
            console.error("Error creating workspace:", err);
        }
    }, [pdfId, setWorkspaces, setActiveWorkspace, setPendingSummaryWorkspaceId]);

    const openCasePdf = useCallback(async ({
        diaryNo,
        diaryYear,
        establishment,
        selectedPdf,
        workspaceRootPdf = null, // kept for backward compat with postMessage API, no longer used
        resetTabs = false,
    }) => {
        if (!selectedPdf?.url) return;
        if (loading) return;

        setLoading(true);
        try {
            const caseKey = buildCaseKey(diaryNo, diaryYear, establishment);
            const sameCase = caseSessionRef.current.key === caseKey && Boolean(caseSessionRef.current.workspaceId);

            const selectedOriginalPath = (selectedPdf.originalPath || selectedPdf.url || selectedPdf.name || "").trim();
            let existingTab = pdfTabs.find((tab) => tab.originalPath === selectedOriginalPath);

            let nextPdfId = existingTab?.pdfId || null;
            if (!nextPdfId) {
                const openRes = await api.openPdf(selectedPdf.name || "document.pdf", selectedOriginalPath);
                nextPdfId = openRes.data.id;
            }

            const resolvedUrl = existingTab?.url || await cachePdfBlobUrl(selectedPdf.url).catch(err => {
            console.error(`[openCasePdf] Failed to load PDF from URL "${selectedPdf.url}":`, err);
            throw err;
        });

            let caseWsId = caseSessionRef.current.workspaceId;
            if (!sameCase) {
                caseSessionRef.current = { key: caseKey, workspacePdfId: null, workspaceId: null };
                if (resetTabs) {
                    closePanel2();
                    setPdfTabs([]);
                }
                const ws = await ensureCaseWorkspace();
                caseWsId = ws.id;
            }

            // Register this PDF with the case workspace (persists the PDF list)
            if (caseWsId && nextPdfId && !existingTab) {
                api.registerPdfInWorkspace(caseWsId, nextPdfId, selectedPdf.name || "document.pdf", selectedOriginalPath)
                    .then(() => {
                        setCasePdfList(prev => {
                            if (prev.find(p => p.pdf_id === nextPdfId)) return prev;
                            return [...prev, { pdf_id: nextPdfId, pdf_name: selectedPdf.name || "document.pdf", pdf_url: selectedOriginalPath }];
                        });
                    })
                    .catch(e => console.error("PDF registration failed:", e));
            }

            const nextTabId = existingTab?.tabId || `tab-${nextPdfId}`;
            activatePdfTab({
                tabId: nextTabId,
                pdfId: nextPdfId,
                url: resolvedUrl,
                name: selectedPdf.name || "document.pdf",
            });

            setPdfTabs(prev => {
                const already = prev.find(
                    (tab) => tab.pdfId === nextPdfId || tab.originalPath === selectedOriginalPath
                );
                if (already) {
                    return prev.map(tab => (
                        tab.tabId === already.tabId
                            ? { ...tab, pdfId: nextPdfId, url: resolvedUrl, name: selectedPdf.name || tab.name, originalPath: selectedOriginalPath }
                            : tab
                    ));
                }
                const color = PDF_TAB_COLORS[prev.length % PDF_TAB_COLORS.length];
                return [...prev, {
                    tabId: nextTabId,
                    url: resolvedUrl,
                    name: selectedPdf.name || "document.pdf",
                    pdfId: nextPdfId,
                    originalPath: selectedOriginalPath,
                    color,
                }];
            });
        } catch (err) {
            console.error("Error opening shared-case PDF:", err);
        } finally {
            setLoading(false);
        }
    }, [
        loading, pdfTabs, setLoading, setPdfTabs, activatePdfTab,
        PDF_TAB_COLORS, cachePdfBlobUrl, ensureCaseWorkspace, closePanel2, setCasePdfList
    ]);

    const handlePDFSelect = useCallback(async (url, fileName, originalPath) => {
        if (loading) return;
        setLoading(true);
        setSelectedPDF(url);
        setPdfName(fileName);
        try {
            const caseContext = readCaseContextFromUrl();
            const backendPath = (originalPath || fileName).trim();
            const openRes = await api.openPdf(fileName, backendPath);
            const newPdfId = openRes.data.id;

            if (caseContext.hasCaseContext) {
                // In case context: use the shared case workspace
                let caseWsId = caseSessionRef.current.workspaceId;
                if (!caseWsId) {
                    const ws = await ensureCaseWorkspace();
                    caseWsId = ws.id;
                }
                // Register PDF with case workspace
                api.registerPdfInWorkspace(caseWsId, newPdfId, fileName, backendPath)
                    .then(() => {
                        setCasePdfList(prev => {
                            if (prev.find(p => p.pdf_id === newPdfId)) return prev;
                            return [...prev, { pdf_id: newPdfId, pdf_name: fileName, pdf_url: backendPath }];
                        });
                    })
                    .catch(e => console.error("PDF registration failed:", e));
            } else {
                // Non-case mode: use PDF-based workspace (existing behavior)
                const wsRes = await api.listWorkspaces(newPdfId);
                setWorkspaces(wsRes.data);
                if (wsRes.data.length > 0) {
                    setActiveWorkspace(wsRes.data[0]);
                } else {
                    await handleAddWorkspace("Main", newPdfId);
                }
            }

            setPdfId(newPdfId);
            const tabId = `tab-${newPdfId}`;
            setPdfTabs(prev => {
                const exists = prev.find(t => t.pdfId === newPdfId || t.originalPath === backendPath);
                if (exists) { setActiveTabId(exists.tabId); return prev; }
                const color = PDF_TAB_COLORS[prev.length % PDF_TAB_COLORS.length];
                setActiveTabId(tabId);
                return [...prev, { tabId, url, name: fileName, pdfId: newPdfId, color, originalPath: backendPath }];
            });
        } catch (err) {
            console.error("Error opening PDF:", err);
        } finally {
            setLoading(false);
        }
    }, [loading, setLoading, setSelectedPDF, setPdfName, setPdfId, setWorkspaces,
        setActiveWorkspace, handleAddWorkspace, setPdfTabs, setActiveTabId, PDF_TAB_COLORS,
        ensureCaseWorkspace, setCasePdfList]);

    const switchPdfTab = useCallback((tab) => {
        if (activeTabId === tab.tabId) return;
        activatePdfTab(tab);
    }, [activeTabId, activatePdfTab]);

    const closePdfTab = useCallback((tabId) => {
        setPdfTabs(prev => {
            const remaining = prev.filter(t => t.tabId !== tabId);
            if (activeTabId === tabId && remaining.length > 0) {
                activatePdfTab(remaining[remaining.length - 1]);
            } else if (remaining.length === 0) {
                caseSessionRef.current = { key: null, workspacePdfId: null, workspaceId: null };
                setActiveTabId(null);
                setSelectedPDF(null);
                setPdfName("");
                setPdfId(null);
                setWorkspaces([]);
                setActiveWorkspace(null);
            }
            return remaining;
        });
    }, [activeTabId, setPdfTabs, activatePdfTab, setActiveTabId, setSelectedPDF, setPdfName, setPdfId, setWorkspaces, setActiveWorkspace]);

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
        if (panel2PdfId && String(panel2PdfId) === snippetPdfId) { scrollRef(pdf2Ref); return; }
        if (String(pdfId) === snippetPdfId) { scrollRef(pdfRef); return; }
        setPdfTabs(prev => {
            const tab = prev.find(t => String(t.pdfId) === snippetPdfId);
            if (!tab) {
                const casePdf = (casePdfList || []).find(entry => String(entry.pdf_id) === snippetPdfId);
                if (casePdf) {
                    const { diaryNo, diaryYear, establishment } = readCaseContextFromUrl();
                    openCasePdf({
                        diaryNo,
                        diaryYear,
                        establishment,
                        selectedPdf: {
                            url: casePdf.pdf_url,
                            name: casePdf.pdf_name,
                            originalPath: casePdf.pdf_url,
                        },
                    });
                    scrollRef(pdfRef);
                }
                return prev;
            }
            setActiveTabId(tab.tabId);
            setSelectedPDF(tab.url);
            setPdfName(tab.name);
            setPdfId(tab.pdfId);
            scrollRef(pdfRef);
            return prev;
        });
    }, [pdfId, panel2PdfId, pdfRef, pdf2Ref, setPdfTabs, setActiveTabId, setSelectedPDF, setPdfName, setPdfId, casePdfList, openCasePdf]); // eslint-disable-line

    // ── PDF summarization ─────────────────────────────────────────────────────
    const handleSummarizePdf = useCallback(async () => {
        if (!pdfRef.current) return;
        setShowSummary(true);
        setSummaryLoading(true);
        setSummary("");
        try {
            const text = await pdfRef.current.extractAllText();
            if (!text || !text.trim()) { setSummary("No text could be extracted from this PDF."); return; }
            const summaryText = await requestSummaryText(text);
            setSummary(summaryText);
            setPendingSummaryText(summaryText);
        } catch (err) {
            setSummary(getSummaryErrorMessage(err));
            console.error("Summarization error:", err);
        } finally {
            setSummaryLoading(false);
        }
    }, [pdfRef, setShowSummary, setSummaryLoading, setSummary, setPendingSummaryText, requestSummaryText]);

    // Apply pending summary text when on the summary workspace and it's already loaded
    useEffect(() => {
        if (!pendingSummaryText) return;
        if (activeWorkspace?.name?.toLowerCase() !== "summary") return;
        if (loading) return;
        setEditableBoxes(prev => {
            if (prev.length > 0) return prev.map((b, i) => i === 0 ? { ...b, text: pendingSummaryText } : b);
            return [...prev, { id: `temp-summary-${Date.now()}`, text: pendingSummaryText, x: 36, y: 24, width: 720, height: 640 }];
        });
        setIsDirty(true);
        setPendingSummaryText(null);
    }, [pendingSummaryText]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-generate summary for newly created "summary" workspaces
    useEffect(() => {
        if (!pendingSummaryWorkspaceId) return;
        if (activeWorkspace?.id !== pendingSummaryWorkspaceId) return;
        if (!pdfRef.current) return;
        setPendingSummaryWorkspaceId(null);
        (async () => {
            try {
                const text = await pdfRef.current.extractAllText();
                if (!text || !text.trim()) {
                    setEditableBoxes(prev => [...prev, { id: `temp-summary-${Date.now()}`, text: "No text could be extracted from this PDF.", x: 30, y: 30, width: 520, height: 80 }]);
                    setIsDirty(true);
                    return;
                }
                const summaryText = await requestSummaryText(text);
                setEditableBoxes(prev => [...prev, { id: `temp-summary-${Date.now()}`, text: summaryText, x: 36, y: 24, width: 720, height: 640 }]);
                setIsDirty(true);
            } catch (err) {
                console.error("Auto-summary error:", err);
                setEditableBoxes(prev => [...prev, { id: `temp-summary-${Date.now()}`, text: getSummaryErrorMessage(err), x: 30, y: 30, width: 520, height: 80 }]);
                setIsDirty(true);
            }
        })();
    }, [pendingSummaryWorkspaceId, activeWorkspace, requestSummaryText]); // eslint-disable-line react-hooks/exhaustive-deps

    // Global keyboard shortcuts (Ctrl+Z / Ctrl+Y)
    useEffect(() => {
        const onKeyDown = (e) => {
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
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handleUndo, handleRedo]);

    useEffect(() => {
        const onMessage = (event) => {
            const data = event.data;
            if (!data || data.type !== "LIQUIDTEXT_OPEN_CASE_PDF") return;

            openCasePdf({
                diaryNo: data.diary_no,
                diaryYear: data.diary_year,
                establishment: data.establishment,
                selectedPdf: data.selected_pdf,
                workspaceRootPdf: data.workspace_root_pdf,
                resetTabs: Boolean(data.reset_tabs),
            });
        };

        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [openCasePdf]);

    useEffect(() => {
        const { hasCaseContext, diaryNo, diaryYear, establishment, caseKey } = readCaseContextFromUrl();
        if (!hasCaseContext) return;
        caseSessionRef.current = {
            key: caseKey,
            workspacePdfId: null,
            workspaceId: null,
            diaryNo,
            diaryYear,
            establishment,
        };

        // Auto-initialize the case workspace and restore saved PDF list
        (async () => {
            try {
                const wsRes = await api.getCaseWorkspace();
                const ws = wsRes.data;
                setWorkspaces([ws]);
                setActiveWorkspace(ws);
                caseSessionRef.current.workspaceId = ws.id;

                const pdfsRes = await api.listWorkspacePdfs(ws.id);
                setCasePdfList(pdfsRes.data || []);
            } catch (e) {
                console.error("Case workspace init failed:", e);
            }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-load pdf_url param on mount if provided
    const autoLoadedRef = useRef(false);
    useEffect(() => {
        if (autoLoadedRef.current) return;
        const params = new URLSearchParams(window.location.search);
        const pdfUrl = (params.get("pdf_url") || "").trim();
        if (!pdfUrl) return;
        autoLoadedRef.current = true;
        const { diaryNo, diaryYear, establishment } = readCaseContextFromUrl();
        const name = decodeURIComponent(pdfUrl.split("/").pop()) || "document.pdf";
        openCasePdf({
            diaryNo, diaryYear, establishment,
            selectedPdf: { url: pdfUrl, name, originalPath: pdfUrl },
        });
    }, [openCasePdf]);

    // ── AppActionsContext: stable cross-context callbacks ─────────────────────
    // These are all useCallback with stable deps, so this value rarely changes.
    // Components that ONLY need handlers can use useAppActions() and avoid re-renders
    // caused by state changes in WorkspaceContext / PDFContext / UIContext.
    const actionsValue = useMemo(() => ({
        handleGlobalSave,
        handleDeleteHighlight, handleDeleteBrushHighlight,
        handleDeletePdfText, handleDeletePdfDrawing, handleBrushHighlightCreate,
        handleAddBookmark, handleDeleteBookmark,
        completeCrossLink, deleteCrossLink, completeDragWireLink,
        handleAddWorkspace, handlePDFSelect,
        switchPdfTab, closePdfTab,
        jumpToSource,
        handleSummarizePdf,
        savePdfChanges, saveWorkspaceChanges,
        openCasePdf,
        // Expose setIsDirty here so PDFViewer doesn't need to import WorkspaceContext
        setIsDirty,
    }), [
        handleGlobalSave,
        handleDeleteHighlight, handleDeleteBrushHighlight,
        handleDeletePdfText, handleDeletePdfDrawing, handleBrushHighlightCreate,
        handleAddBookmark, handleDeleteBookmark,
        completeCrossLink, deleteCrossLink, completeDragWireLink,
        handleAddWorkspace, handlePDFSelect,
        switchPdfTab, closePdfTab, jumpToSource, handleSummarizePdf,
        savePdfChanges, saveWorkspaceChanges, openCasePdf, setIsDirty,
    ]);

    // ── AppContext: full combined value for useApp() backward compat ──────────
    const fullValue = useMemo(() => ({
        // Sub-context data (spread so all original field names are present)
        ...workspace,
        ...pdf,
        ...ui,
        // Cross-context handlers
        ...actionsValue,
    }), [workspace, pdf, ui, actionsValue]);

    return (
        <AppActionsContext.Provider value={actionsValue}>
            <AppContext.Provider value={fullValue}>
                {children}
            </AppContext.Provider>
        </AppActionsContext.Provider>
    );
}

// ── Public provider ───────────────────────────────────────────────────────────
export const AppProvider = ({ children }) => (
    <UIProvider>
        <WorkspaceProvider>
            <PDFProvider>
                <AppInner>{children}</AppInner>
            </PDFProvider>
        </WorkspaceProvider>
    </UIProvider>
);

// ── Public hooks ──────────────────────────────────────────────────────────────

/**
 * useApp() — full backward-compatible hook.
 * Returns all state from all three sub-contexts plus cross-context handlers.
 * Consumers re-render whenever ANY sub-context changes.
 * Prefer useWorkspace() / usePDF() / useUI() / useAppActions() for perf-critical components.
 */
export const useApp = () => {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
};

/**
 * useAppActions() — stable cross-context handlers only.
 * This context value rarely changes because all values are useCallback with stable deps.
 * Use this in components that only need handlers (jumpToSource, handleDeleteHighlight, etc.)
 * without subscribing to state changes.
 */
export const useAppActions = () => {
    const ctx = useContext(AppActionsContext);
    if (!ctx) throw new Error('useAppActions must be used within AppProvider');
    return ctx;
};

export default AppContext;
