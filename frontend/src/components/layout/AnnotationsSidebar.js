import React, { useEffect, useRef } from "react";
import { useApp } from "../../context/AppContext";

export default function AnnotationsSidebar() {
    const {
        allAnnotations,
        showHighlightsList, setShowHighlightsList,
        hoveredAnnotationId, setHoveredAnnotationId,
        pdfRef,
        handleDeleteHighlight,
        handleDeletePdfText,
        handleDeletePdfDrawing,
        handleDeleteBrushHighlight,
    } = useApp();

    const panelRef = useRef(null);

    // Auto-open when a NEW annotation is added (not on initial load)
    const hasInitializedRef = useRef(false);
    const prevLengthRef = useRef(0);
    useEffect(() => {
        if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            prevLengthRef.current = allAnnotations.length;
            return;
        }
        if (allAnnotations.length > prevLengthRef.current) {
            setShowHighlightsList(true);
        }
        prevLengthRef.current = allAnnotations.length;
    }, [allAnnotations.length, setShowHighlightsList]);

    // Auto-hide on click outside
    useEffect(() => {
        if (!showHighlightsList) return;
        const handler = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                setShowHighlightsList(false);
            }
        };
        // slight delay so the open-click itself doesn't immediately close
        const t = setTimeout(() => document.addEventListener("mousedown", handler), 150);
        return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
    }, [showHighlightsList, setShowHighlightsList]);

    const onJumpToHighlight = (item) => {
        if (item.data && item.data.pageNum && item.data.xPct !== undefined) {
            pdfRef.current?.scrollToSnippet(item.data);
        } else {
            pdfRef.current?.scrollToPage(item.pageNum);
        }
        setShowHighlightsList(false);
    };

    const typeInfo = {
        highlight:       { label: "Highlight",       bg: "#fff9c4" },
        text:            { label: "Text Note",        bg: "#e3f2fd" },
        drawing:         { label: "Drawing",          bg: "#f5f5f5" },
        "brush-highlight": { label: "Brush",          bg: "#fce4ec" },
    };

    const deleteHandler = (item) => {
        if (item.type === "highlight")        return () => handleDeleteHighlight(item.id);
        if (item.type === "text")             return () => handleDeletePdfText(item.id);
        if (item.type === "drawing")          return () => handleDeletePdfDrawing(item.id);
        if (item.type === "brush-highlight")  return () => handleDeleteBrushHighlight(item.id);
        return null;
    };

    return (
        <>
            {/* Always-visible tab on right edge */}
            {!showHighlightsList && (
                <div
                    className="annotations-sidebar-tab"
                    onClick={() => setShowHighlightsList(true)}
                    title="All Annotations"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </div>
            )}

            {/* Slide-in panel */}
            <div ref={panelRef} className={`annotations-sidebar${showHighlightsList ? " open" : ""}`}>
                <div className="annotations-sidebar-header">
                    <span>All Annotations</span>
                    <span style={{ fontSize: 12, color: "#999", fontWeight: 400 }}>
                        {allAnnotations.length} item{allAnnotations.length !== 1 ? "s" : ""}
                    </span>
                    <button
                        onClick={() => setShowHighlightsList(false)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#666", fontSize: 18, lineHeight: 1, padding: "0 2px" }}
                        title="Close"
                    >✕</button>
                </div>

                <div className="annotations-sidebar-body">
                    {allAnnotations.length === 0 ? (
                        <div style={{ padding: "40px 20px", color: "#aaa", textAlign: "center", fontSize: 13 }}>
                            No annotations yet.<br />
                            <span style={{ fontSize: 12 }}>Highlight text or draw on the PDF.</span>
                        </div>
                    ) : (
                        allAnnotations.map((item, index) => {
                            const info = typeInfo[item.type] || { label: item.type, bg: "#f5f5f5" };
                            const onDelete = deleteHandler(item);
                            const words = (item.content || "").split(/\s+/);
                            const preview = words.length > 5 ? words.slice(0, 5).join(" ") + "…" : item.content;

                            return (
                                <div
                                    key={item.id || index}
                                    onClick={() => onJumpToHighlight(item)}
                                    className="annotation-item"
                                    style={{ padding: "10px 16px", borderBottom: "1px solid #f0f0f0", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10, transition: "background 0.15s" }}
                                    onMouseEnter={e => { e.currentTarget.style.background = "#f9f9f9"; setHoveredAnnotationId(item.id); }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; setHoveredAnnotationId(null); }}
                                >
                                    {/* Color stripe */}
                                    <div style={{ width: 3, borderRadius: 2, alignSelf: "stretch", background: item.color || "#ccc", flexShrink: 0 }} />

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                            <span style={{ fontSize: 11, color: "#007aff", fontWeight: 600 }}>P.{item.pageNum}</span>
                                            <span style={{ fontSize: 10, background: info.bg, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em", color: "#555" }}>
                                                {info.label}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 13, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {item.type === "drawing" || item.type === "brush-highlight"
                                                ? <span style={{ color: "#999", fontStyle: "italic" }}>{info.label} on page {item.pageNum}</span>
                                                : preview || <span style={{ color: "#bbb" }}>No content</span>
                                            }
                                        </div>
                                    </div>

                                    {onDelete && (
                                        <button
                                            onClick={e => { e.stopPropagation(); onDelete(); }}
                                            style={{ background: "none", border: "none", color: "#ff3b30", cursor: "pointer", opacity: 0.5, fontSize: 15, padding: "0 2px", flexShrink: 0, transition: "opacity 0.15s" }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                                            onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
                                            title="Delete"
                                        >✕</button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </>
    );
}
