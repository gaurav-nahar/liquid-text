import { useState, useRef, useEffect, useCallback } from "react";
import { useApp } from "./context/AppContext";
import PDFViewer from "./components/pdf/PDFViewer";
import Navbar from "./components/layout/Navbar";
import PDFSelector from "./components/pdf/PDFSelector";
import "./App.css";
import Workspace from "./components/workspace/Workspace";
import TraceLineLayer from "./components/workspace/TraceLineLayer";
import KeyboardShortcuts from "./components/layout/KeyboardShortcuts";
import useLayoutResizer from "./components/layout/useLayoutResizer";
import Toast from "./components/layout/Toast";
import AnnotationsSidebar from "./components/layout/AnnotationsSidebar";
import ScreenStickyNotes from "./components/layout/ScreenStickyNotes";
import BookmarksSidebar from "./components/layout/BookmarksSidebar";
import CrossPdfConnectionLayer from "./components/workspace/CrossPdfConnectionLayer";

/** Inline workspace-name input to avoid browser prompt() */
function NewWorkspaceBtn({ onAdd }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState("");
    if (editing) {
        return (
            <form
                onSubmit={e => { e.preventDefault(); if (name.trim()) { onAdd(name.trim()); setName(""); setEditing(false); } }}
                style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
            >
                <input
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onBlur={() => { setEditing(false); setName(""); }}
                    placeholder="Workspace name"
                    style={{ fontSize: 12, padding: "2px 6px", borderRadius: 6, border: "1px solid #aaa", width: 120 }}
                />
                <button type="submit" style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, border: "none", background: "#007bff", color: "white", cursor: "pointer" }}>Add</button>
            </form>
        );
    }
    return (
        <button className="add-workspace-btn" onClick={() => setEditing(true)} title="Create New Workspace">+</button>
    );
}

/** Modal to open a second PDF via file upload or URL */
function OpenPdfModal({ onSelect, onClose }) {
    const [tab, setTab] = useState("file");
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const overlayRef = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (e.target === overlayRef.current) onClose(); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (file && file.type === "application/pdf") {
            const fileUrl = URL.createObjectURL(file);
            onSelect(fileUrl, file.name, file.name);
            onClose();
        }
    };

    const handleUrl = async (e) => {
        e.preventDefault();
        if (!url.trim()) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch(url.trim(), { mode: "cors", cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const fileUrl = URL.createObjectURL(blob);
            let fileName = "document.pdf";
            try {
                const u = new URL(url.trim());
                const parts = u.pathname.split("/");
                const last = parts[parts.length - 1];
                if (last && last.toLowerCase().endsWith(".pdf")) fileName = decodeURIComponent(last);
            } catch {}
            onSelect(fileUrl, fileName, url.trim());
            onClose();
        } catch (err) {
            setError(err.message || "Failed to load PDF");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div ref={overlayRef} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
            <div style={{
                background: "#fff", borderRadius: 12, padding: "24px 28px",
                width: 420, maxWidth: "90vw",
                boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: "#1f2937" }}>Open PDF in New Tab</span>
                    <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>×</button>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                    {["file", "url"].map(t => (
                        <button key={t} onClick={() => { setTab(t); setError(""); }} style={{
                            padding: "6px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
                            fontWeight: tab === t ? 600 : 400,
                            background: tab === t ? "#007bff" : "#f3f4f6",
                            color: tab === t ? "white" : "#374151",
                        }}>{t === "file" ? "Upload File" : "From URL"}</button>
                    ))}
                </div>

                {tab === "file" && (
                    <div>
                        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>Select a PDF from your computer</p>
                        <input type="file" accept="application/pdf" onChange={handleFile}
                            style={{ fontSize: 13, cursor: "pointer", width: "100%" }} />
                    </div>
                )}

                {tab === "url" && (
                    <form onSubmit={handleUrl}>
                        <input
                            type="text" value={url} onChange={e => setUrl(e.target.value)}
                            placeholder="https://example.com/document.pdf"
                            disabled={loading}
                            style={{
                                width: "100%", padding: "10px 12px", fontSize: 13,
                                border: "1px solid #d1d5db", borderRadius: 8, boxSizing: "border-box",
                                marginBottom: error ? 8 : 12, outline: "none",
                            }}
                        />
                        {error && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 10 }}>{error}</div>}
                        <button type="submit" disabled={loading} style={{
                            width: "100%", padding: "10px", background: loading ? "#9ca3af" : "#007bff",
                            color: "white", border: "none", borderRadius: 8, fontSize: 14,
                            fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                        }}>
                            {loading ? "Loading..." : "Load PDF"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

export default function App() {
    const {
        loading,
        activeWorkspace,
        workspaces,
        setActiveWorkspace,
        selectedPDF,
        pdfPanelWidth,
        isResizing,
        pdfRef, pdf2Ref,
        pdfId,
        handlePDFSelect,
        handleAddWorkspace,
        pdfTabs, activeTabId,
        switchPdfTab, closePdfTab,
        panel2TabId, panel2PdfId, panel2PdfUrl, panel2PdfName,
        openInPanel2, closePanel2,
    } = useApp();

    const [showOpenModal, setShowOpenModal] = useState(false);
    const [pdf2PanelWidth, setPdf2PanelWidth] = useState(35); // right panel width %
    const [pdf2Zoom, setPdf2Zoom] = useState(1.0);            // right panel independent zoom
    const [isResizing2, setIsResizing2] = useState(false);
    const resizer2Ref = useRef({ startX: 0, startWidth: 35 });

    const { handleMouseDownResizer, handleTouchStartResizer } = useLayoutResizer();

    // Right-panel drag resizer (dragging leftward = wider panel 2)
    const handleMouseDownResizer2 = useCallback((e) => {
        setIsResizing2(true);
        resizer2Ref.current = { startX: e.clientX, startWidth: pdf2PanelWidth };
    }, [pdf2PanelWidth]);

    useEffect(() => {
        if (!isResizing2) return;
        const onMove = (e) => {
            const delta = resizer2Ref.current.startX - e.clientX; // dragging left = bigger
            const deltaPct = (delta / window.innerWidth) * 100;
            const next = Math.min(60, Math.max(15, resizer2Ref.current.startWidth + deltaPct));
            setPdf2PanelWidth(next);
        };
        const onUp = () => setIsResizing2(false);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    }, [isResizing2]);

    if (!selectedPDF && pdfTabs.length === 0) {
        return <PDFSelector onSelect={handlePDFSelect} />;
    }

    return (
        <div className="app-container">
            <KeyboardShortcuts />
            <Toast />
            <AnnotationsSidebar />
            <BookmarksSidebar />
            <ScreenStickyNotes />
            <TraceLineLayer />
            <CrossPdfConnectionLayer />

            {showOpenModal && (
                <OpenPdfModal
                    onSelect={handlePDFSelect}
                    onClose={() => setShowOpenModal(false)}
                />
            )}

            {loading && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.5)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ background: 'white', padding: '10px 20px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
                        Loading...
                    </div>
                </div>
            )}
            <Navbar />

            <div className="context-bar">
                {/* ── PDF TABS ── */}
                <div
                    className="pdf-tabs-container"
                    style={{ width: `${pdfPanelWidth}%` }}
                >
                    <span className="context-label" style={{ paddingLeft: '16px', flexShrink: 0 }}>Files:</span>
                    <div className="workspace-tabs-scroll" style={{ paddingLeft: 0, gap: 2 }}>
                        {pdfTabs.map(tab => (
                            <div
                                key={tab.tabId}
                                className={`workspace-tab-item ${tab.tabId === activeTabId ? 'active' : ''}`}
                                onClick={() => switchPdfTab(tab)}
                                title={tab.name}
                                style={{
                                    marginTop: 6,
                                    display: "flex", alignItems: "center", gap: 5,
                                    paddingRight: 6,
                                    maxWidth: 180,
                                    cursor: "pointer",
                                    background: tab.tabId === activeTabId ? "#e8f4ff" : "transparent",
                                    borderRadius: 6,
                                }}
                            >
                                {/* Color dot = source PDF identity */}
                                <div style={{
                                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                                    background: tab.color || "#9ca3af",
                                    boxShadow: tab.tabId === activeTabId ? `0 0 0 2px ${tab.color || "#9ca3af"}44` : "none",
                                }} />
                                <span className="tab-name" style={{
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    fontWeight: tab.tabId === activeTabId ? 600 : 400,
                                    color: tab.tabId === activeTabId ? (tab.color || "#0057c8") : "#374151",
                                    fontSize: 12,
                                }}>{tab.name}</span>
                                {/* Open in right panel button — only when 2+ PDFs */}
                                {pdfTabs.length > 1 && (
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            if (panel2TabId === tab.tabId) { closePanel2(); }
                                            else { openInPanel2(tab); }
                                        }}
                                        title={panel2TabId === tab.tabId ? "Close right panel" : "Open in right panel (side-by-side)"}
                                        style={{
                                            border: "none", background: "none", cursor: "pointer",
                                            color: panel2TabId === tab.tabId ? (tab.color || "#007bff") : "#9ca3af",
                                            fontSize: 11, lineHeight: 1, padding: "0 2px", flexShrink: 0,
                                            fontWeight: 700,
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.color = tab.color || "#007bff"}
                                        onMouseLeave={e => e.currentTarget.style.color = panel2TabId === tab.tabId ? (tab.color || "#007bff") : "#9ca3af"}
                                    >⊞</button>
                                )}
                                {pdfTabs.length > 1 && (
                                    <button
                                        onClick={e => { e.stopPropagation(); closePdfTab(tab.tabId); }}
                                        title="Close this PDF"
                                        style={{
                                            border: "none", background: "none", cursor: "pointer",
                                            color: "#9ca3af", fontSize: 14, lineHeight: 1,
                                            padding: "0 2px", flexShrink: 0,
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                                        onMouseLeave={e => e.currentTarget.style.color = "#9ca3af"}
                                    >×</button>
                                )}
                            </div>
                        ))}
                        {/* Open new PDF tab button */}
                        <button
                            onClick={() => setShowOpenModal(true)}
                            title="Open PDF in new tab"
                            style={{
                                marginTop: 6, height: 28, width: 28, border: "1px dashed #d1d5db",
                                borderRadius: 6, background: "transparent", cursor: "pointer",
                                color: "#9ca3af", fontSize: 18, display: "flex",
                                alignItems: "center", justifyContent: "center", flexShrink: 0,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = "#007bff"; e.currentTarget.style.color = "#007bff"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.color = "#9ca3af"; }}
                        >+</button>
                    </div>
                </div>

                {/* ── WORKSPACE TABS ── */}
                <div className="workspace-tabs-container">
                    <span className="context-label">Workspaces:</span>
                    <div className="workspace-tabs-scroll">
                        {workspaces.map(ws => (
                            <div
                                key={ws.id}
                                className={`context-tab workspace-tab-item ${activeWorkspace?.id === ws.id ? 'active' : ''}`}
                                onClick={() => setActiveWorkspace(ws)}
                                title={ws.name}
                            >
                                {activeWorkspace?.id === ws.id && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                                <span className="tab-name">{ws.name}</span>
                            </div>
                        ))}
                        <NewWorkspaceBtn onAdd={handleAddWorkspace} />
                    </div>
                </div>
            </div>

            <div className="main-content" style={{ cursor: isResizing || isResizing2 ? 'col-resize' : 'default' }}>
                {/* ── Left PDF panel ── */}
                <div className="pdf-view-container" style={{ width: `${pdfPanelWidth}%`, height: '100%', flex: 'none', position: 'relative' }}>
                    <PDFViewer key={activeTabId} ref={pdfRef} fileUrl={selectedPDF} sourcePdfId={pdfId} />
                </div>

                <div
                    className={`layout-resizer ${isResizing ? 'active' : ''}`}
                    onMouseDown={handleMouseDownResizer}
                    onTouchStart={handleTouchStartResizer}
                >
                    <div className="resizer-handle"><span>⋮</span></div>
                </div>

                {/* ── Workspace (middle) ── */}
                <div className="workspace-view-wrapper" style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                    <Workspace />
                </div>

                {/* ── Right PDF panel (side-by-side) ── */}
                {panel2PdfUrl && (
                    <>
                        {/* Drag resizer between workspace and right panel */}
                        <div
                            style={{
                                width: 6, height: '100%', cursor: 'col-resize', flexShrink: 0,
                                background: isResizing2 ? '#93c5fd' : '#e5e7eb',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.15s',
                            }}
                            onMouseDown={handleMouseDownResizer2}
                            onMouseEnter={e => e.currentTarget.style.background = '#93c5fd'}
                            onMouseLeave={e => { if (!isResizing2) e.currentTarget.style.background = '#e5e7eb'; }}
                        >
                            <span style={{ fontSize: 10, color: '#9ca3af', userSelect: 'none' }}>⋮</span>
                        </div>

                        {/* Right panel */}
                        <div style={{
                            width: `${pdf2PanelWidth}%`, height: '100%', flex: 'none',
                            position: 'relative', display: 'flex', flexDirection: 'column',
                            borderLeft: `3px solid ${pdfTabs.find(t => t.tabId === panel2TabId)?.color || '#e5e7eb'}`,
                        }}>
                            {/* Right panel header with independent zoom */}
                            <div style={{
                                height: 32, flexShrink: 0, display: 'flex', alignItems: 'center',
                                padding: '0 8px', gap: 4,
                                background: '#f8fafc', borderBottom: '1px solid #e5e7eb',
                            }}>
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                    background: pdfTabs.find(t => t.tabId === panel2TabId)?.color || '#9ca3af',
                                }} />
                                <span style={{
                                    flex: 1, fontSize: 11, fontWeight: 600, color: '#374151',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{panel2PdfName}</span>
                                {/* Independent zoom controls */}
                                <button onClick={() => setPdf2Zoom(z => Math.max(0.3, parseFloat((z - 0.15).toFixed(2))))}
                                    title="Zoom out" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#6b7280', padding: '0 3px', lineHeight: 1 }}>−</button>
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', minWidth: 30, textAlign: 'center' }}>{Math.round(pdf2Zoom * 100)}%</span>
                                <button onClick={() => setPdf2Zoom(z => Math.min(3.0, parseFloat((z + 0.15).toFixed(2))))}
                                    title="Zoom in" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#6b7280', padding: '0 3px', lineHeight: 1 }}>+</button>
                                <button
                                    onClick={closePanel2}
                                    title="Close right panel"
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, lineHeight: 1, padding: '0 2px', marginLeft: 2 }}
                                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                    onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                                >×</button>
                            </div>

                            {/* Right panel PDF viewer — independent zoom via localZoom prop */}
                            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                                <PDFViewer
                                    key={panel2TabId}
                                    ref={pdf2Ref}
                                    fileUrl={panel2PdfUrl}
                                    sourcePdfId={panel2PdfId}
                                    localZoom={pdf2Zoom}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
