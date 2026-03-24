import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../context/AppContext";

const LINK_COLORS = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

/**
 * CrossPdfConnectionLayer
 *
 * - Gutter tick marks on the right edge of each PDF panel (always visible)
 *   positioned proportionally to the page the connection is on.
 * - Click a tick → show the bezier line + a small floating action row
 * - Click anywhere else → hide the line
 */
const CrossPdfConnectionLayer = () => {
    const {
        crossPdfLinks, deleteCrossLink, pendingCrossLink, setCrossPdfLinks,
        pdfRef, pdf2Ref,
        pdfId, panel2PdfId,
        dragWire, moveDragWire, completeDragWireLink, cancelDragWire,
        setConnections, setIsDirty,
        lastCreatedCrossLinkId, setLastCreatedCrossLinkId,
    } = useApp();

    const [selectedId, setSelectedId]         = useState(null);
    const [linePos, setLinePos]               = useState(null);
    const [clipY, setClipY]                   = useState(135);
    const [gutterRects, setGutterRects]       = useState([]);
    const [popup, setPopup]                   = useState(null); // { x, y, linkId }
    const [dragPos, setDragPos]               = useState(null);
    const [dragFromScreen, setDragFromScreen] = useState(null);
    const [dropTarget, setDropTarget]         = useState(false);
    const rafRef       = useRef(null);
    const markerHitRef = useRef(false);

    // ── Measure navbar + PDF panel rects ─────────────────────────────────────
    useEffect(() => {
        const measure = () => {
            const firstPdf = document.querySelector(".pdf-viewer-outer-wrapper");
            if (firstPdf) setClipY(Math.max(100, firstPdf.getBoundingClientRect().top));

            const rects = [];
            document.querySelectorAll(".pdf-viewer-container").forEach((el, i) => {
                const ref  = i === 0 ? pdfRef    : pdf2Ref;
                const id   = i === 0 ? pdfId     : panel2PdfId;
                if (!id) return;
                const rect  = el.getBoundingClientRect();
                // Use getTotalPages() for reliable live count; fall back to pdfDoc.numPages
                const total = ref?.current?.getTotalPages?.() || ref?.current?.pdfDoc?.numPages || 1;
                rects.push({ rect, pdfId: id, ref, totalPages: total });
            });
            setGutterRects(rects);
        };
        measure();
        const iv = setInterval(measure, 600);
        window.addEventListener("resize", measure);
        return () => { clearInterval(iv); window.removeEventListener("resize", measure); };
    }, [pdfRef, pdf2Ref, pdfId, panel2PdfId]);

    // ── Deselect when link is deleted ─────────────────────────────────────────
    useEffect(() => {
        if (selectedId && !crossPdfLinks.find(l => l.id === selectedId)) {
            setSelectedId(null); setPopup(null); setLinePos(null);
        }
    }, [crossPdfLinks, selectedId]);

    // Show a newly created link immediately so the release action is visible.
    useEffect(() => {
        if (!lastCreatedCrossLinkId) return;
        const link = crossPdfLinks.find(l => l.id === lastCreatedCrossLinkId);
        if (!link) return;
        setSelectedId(link.id);
        setPopup(null);
        setLastCreatedCrossLinkId(null);
    }, [crossPdfLinks, lastCreatedCrossLinkId, setLastCreatedCrossLinkId]);

    // ── Click-outside → deselect ──────────────────────────────────────────────
    useEffect(() => {
        if (!selectedId && !popup) return;
        const handler = () => {
            if (markerHitRef.current) { markerHitRef.current = false; return; }
            setSelectedId(null); setPopup(null);
        };
        window.addEventListener("click", handler);
        return () => window.removeEventListener("click", handler);
    }, [selectedId, popup]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const getRefForPdf = useCallback((epId) => {
        if (String(epId) === String(pdfId))       return pdfRef;
        if (String(epId) === String(panel2PdfId)) return pdf2Ref;
        return null;
    }, [pdfId, panel2PdfId, pdfRef, pdf2Ref]);

    const getScreenPos = useCallback((ep) => {
        if (!ep) return null;
        if (ep.type === "snippet") {
            const el = document.getElementById(`workspace-item-${ep.snippetId}`);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        return getRefForPdf(ep.pdfId)?.current?.getAnchorScreenPos?.(ep.pageNum, ep.xPct, ep.yPct) ?? null;
    }, [getRefForPdf]);

    // ── RAF: track selected line position ─────────────────────────────────────
    useEffect(() => {
        if (!selectedId && !dragWire) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            setLinePos(null);
            return;
        }
        let running = true;
        const tick = () => {
            if (!running) return;
            if (selectedId) {
                const link = crossPdfLinks.find(l => l.id === selectedId);
                if (link) {
                    const from = getScreenPos(link.from);
                    const to   = getScreenPos(link.to);
                    setLinePos(from && to ? { from, to } : null);
                }
            }
            if (dragWire) setDragFromScreen(getScreenPos(dragWire.from));
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { running = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, dragWire, crossPdfLinks]);

    // ── Drag wire handlers ────────────────────────────────────────────────────
    const findDropTarget = useCallback((sx, sy) => {
        for (const { ref, pdfId: id } of [{ ref: pdfRef, pdfId }, { ref: pdf2Ref, pdfId: panel2PdfId }]) {
            if (!ref?.current || !id) continue;
            if (dragWire?.from?.pdfId && String(id) === String(dragWire.from.pdfId)) continue;
            const a = ref.current.getPageAnchorFromScreen?.(sx, sy);
            if (a) return { type: "pdf", pdfId: id, pageNum: a.pageNum, xPct: a.xPct, yPct: a.yPct, text: "" };
        }
        const el = document.elementFromPoint(sx, sy);
        if (el) {
            const note = el.closest("[id^='workspace-item-']");
            if (note) {
                const sid = note.id.replace("workspace-item-", "");
                if (!dragWire?.from?.snippetId || String(sid) !== String(dragWire.from.snippetId))
                    return { type: "snippet", snippetId: sid, pdfId: null };
            }
        }
        return null;
    }, [dragWire, pdfRef, pdf2Ref, pdfId, panel2PdfId]);

    const upFiredRef = useRef(false);
    useEffect(() => {
        if (!dragWire) { upFiredRef.current = false; return; }
        upFiredRef.current = false;
        const onMove = (e) => {
            setDragPos({ x: e.clientX, y: e.clientY });
            moveDragWire(e.clientX, e.clientY);
            setDropTarget(!!findDropTarget(e.clientX, e.clientY));
        };
        const onUp = (e) => {
            if (upFiredRef.current) return;
            upFiredRef.current = true;
            const t = findDropTarget(e.clientX, e.clientY);
            if (t) {
                if (t.type === "snippet") {
                    const fid = dragWire.from?.snippetId, tid = t.snippetId;
                    if (fid && tid && String(fid) !== String(tid)) {
                        setConnections?.(prev => [...prev, { id: `conn-${Date.now()}`, from: fid, to: tid }]);
                        setIsDirty?.(true); cancelDragWire();
                    } else if (!fid) completeDragWireLink(t);
                    else cancelDragWire();
                } else completeDragWireLink(t);
            } else cancelDragWire();
            setDragPos(null); setDropTarget(false);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    }, [dragWire, findDropTarget, moveDragWire, completeDragWireLink, cancelDragWire, setConnections, setIsDirty]);

    const makePath = (a, b) => {
        const dx = b.x - a.x;
        return `M ${a.x} ${a.y} C ${a.x + dx * 0.4} ${a.y}, ${b.x - dx * 0.4} ${b.y}, ${b.x} ${b.y}`;
    };

    const updateColor = (linkId, color) => {
        setCrossPdfLinks(prev => prev.map(l => l.id === linkId ? { ...l, color } : l));
        setIsDirty?.(true);
        markerHitRef.current = true;
    };

    const hasDrag   = !!dragWire;
    const curX      = dragPos?.x ?? dragWire?.x ?? 0;
    const curY      = dragPos?.y ?? dragWire?.y ?? 0;
    const selLink   = crossPdfLinks.find(l => l.id === selectedId);
    const lineColor = selLink?.color || "#3b82f6";

    if (!crossPdfLinks.length && !pendingCrossLink && !hasDrag) return null;

    return createPortal(
        <>
            {/* ── SVG overlay ── */}
            <svg
                style={{
                    position: "fixed", top: clipY, left: 0,
                    width: "100vw", height: window.innerHeight - clipY,
                    pointerEvents: "none", zIndex: 9000, overflow: "visible",
                }}
            >
                <g transform={`translate(0,${-clipY})`}>

                    {/* Selected connection line */}
                    {selectedId && linePos && (() => {
                        const { from, to } = linePos;
                        const d = makePath(from, to);
                        return (
                            <g>
                                <path d={d} fill="none" stroke="transparent" strokeWidth={18}
                                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                                    onClick={(e) => { e.stopPropagation(); markerHitRef.current = true; }}
                                />
                                <path d={d} fill="none" stroke={lineColor} strokeWidth={2.2} strokeLinecap="round"
                                    style={{ pointerEvents: "none", filter: `drop-shadow(0 0 4px ${lineColor}55)` }}
                                />
                                <circle cx={from.x} cy={from.y} r={5} fill={lineColor} stroke="white" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
                                <circle cx={to.x}   cy={to.y}   r={5} fill={lineColor} stroke="white" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
                            </g>
                        );
                    })()}

                    {/* Gutter tick marks */}
                    {gutterRects.map(({ rect, pdfId: gpdfId, ref, totalPages }) => {
                        const relevant = crossPdfLinks.filter(l =>
                            String(l.from?.pdfId) === String(gpdfId) ||
                            String(l.to?.pdfId)   === String(gpdfId)
                        );
                        if (!relevant.length) return null;

                        const gX = rect.right - 7;
                        const gH = rect.height;
                        const gT = rect.top;

                        return (
                            <g key={`gutter-${gpdfId}`}>
                                {/* thin background strip */}
                                <rect x={gX} y={gT} width={7} height={gH}
                                    fill="rgba(0,0,0,0.04)" style={{ pointerEvents: "none" }} />

                                {relevant.map(link => {
                                    const ep = String(link.from?.pdfId) === String(gpdfId) ? link.from : link.to;
                                    if (!ep || ep.type === "snippet") return null;

                                    // Use live getTotalPages() — skip mark until PDF is loaded
                                    const pages = ref?.current?.getTotalPages?.() || 0;
                                    if (!pages) return null; // PDF not loaded yet
                                    const ratio = pages <= 1
                                        ? 0
                                        : Math.max(0, Math.min(1, (ep.pageNum - 1) / (pages - 1)));
                                    const mY     = gT + ratio * gH;
                                    const color  = link.color || "#3b82f6";
                                    const isSel  = selectedId === link.id;

                                    return (
                                        <g key={`mark-${link.id}`}
                                            style={{ pointerEvents: "all", cursor: "pointer" }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                markerHitRef.current = true;
                                                setSelectedId(link.id);
                                                setPopup({ x: gX, y: mY, linkId: link.id });
                                                if (!isSel) ref?.current?.scrollToPage(ep.pageNum);
                                            }}
                                            title={`Page ${ep.pageNum} — click to show connection`}
                                        >
                                            {/* wider invisible hit area */}
                                            <rect x={gX - 8} y={mY - 9} width={22} height={18} fill="transparent" />
                                            {/* tick */}
                                            <rect x={gX} y={mY - 5} width={7} height={10} rx={2}
                                                fill={isSel ? color : `${color}aa`}
                                                stroke={isSel ? "white" : "none"} strokeWidth={1}
                                            />
                                            {/* arrow when selected */}
                                            {isSel && (
                                                <polygon
                                                    points={`${gX},${mY} ${gX - 6},${mY - 4} ${gX - 6},${mY + 4}`}
                                                    fill={color}
                                                />
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        );
                    })}

                    {/* Pending hint */}
                    {pendingCrossLink && !hasDrag && (
                        <text x="50%" y={clipY + 30} textAnchor="middle" fontSize="12" fontWeight="600" fill="#10b981"
                            style={{ pointerEvents: "none", userSelect: "none" }}>
                            Select text in the other PDF and click "Link Here"
                        </text>
                    )}

                    {/* Drag rubber-band */}
                    {hasDrag && dragFromScreen && (() => {
                        const d = makePath(dragFromScreen, { x: curX, y: curY });
                        return (
                            <g>
                                <path d={d} fill="none" stroke={dropTarget ? "#10b981" : "#3b82f6"}
                                    strokeWidth={2} strokeLinecap="round" strokeDasharray="7 4"
                                    style={{ pointerEvents: "none" }} />
                                <circle cx={dragFromScreen.x} cy={dragFromScreen.y} r={5}
                                    fill="#3b82f6" stroke="white" strokeWidth={2} style={{ pointerEvents: "none" }} />
                                <circle cx={curX} cy={curY} r={dropTarget ? 9 : 6}
                                    fill={dropTarget ? "#10b981" : "#3b82f6"} stroke="white" strokeWidth={2}
                                    style={{ pointerEvents: "none", filter: dropTarget ? "drop-shadow(0 0 7px rgba(16,185,129,0.8))" : "none" }} />
                                {dropTarget && (
                                    <text x={curX} y={curY - 14} textAnchor="middle" fontSize="11" fontWeight="700"
                                        fill="#10b981" style={{ pointerEvents: "none", userSelect: "none" }}>
                                        Release to connect
                                    </text>
                                )}
                            </g>
                        );
                    })()}
                </g>
            </svg>

            {/* ── Minimal floating action pill ── */}
            {popup && (() => {
                const popupLink = crossPdfLinks.find(l => l.id === popup.linkId);
                const curColor  = popupLink?.color || "#3b82f6";
                const left = Math.max(8, popup.x - 160);
                const top  = Math.min(popup.y - 14, window.innerHeight - 56);

                return (
                    <div
                        onClick={(e) => { e.stopPropagation(); markerHitRef.current = true; }}
                        style={{
                            position: "fixed", left, top,
                            display: "flex", alignItems: "center", gap: "5px",
                            padding: "5px 8px",
                            background: "rgba(15,15,20,0.82)",
                            backdropFilter: "blur(10px)",
                            WebkitBackdropFilter: "blur(10px)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "20px",
                            zIndex: 9999,
                            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
                        }}
                    >
                        {/* Color dots */}
                        {LINK_COLORS.map(c => (
                            <div key={c}
                                onClick={() => updateColor(popup.linkId, c)}
                                style={{
                                    width: c === curColor ? 14 : 11,
                                    height: c === curColor ? 14 : 11,
                                    borderRadius: "50%",
                                    backgroundColor: c,
                                    cursor: "pointer",
                                    border: c === curColor ? "2px solid white" : "1.5px solid rgba(255,255,255,0.2)",
                                    flexShrink: 0,
                                    transition: "all 0.1s",
                                    boxSizing: "border-box",
                                }}
                                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.3)"}
                                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                            />
                        ))}

                        {/* Divider */}
                        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)", margin: "0 2px", flexShrink: 0 }} />

                        {/* Delete */}
                        <div
                            onClick={() => { deleteCrossLink(popup.linkId); setPopup(null); setSelectedId(null); }}
                            title="Delete connection"
                            style={{
                                width: 20, height: 20, borderRadius: "50%",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                background: "rgba(239,68,68,0.15)",
                                color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 700,
                                flexShrink: 0, transition: "background 0.15s",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.35)"}
                            onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.15)"}
                        >×</div>
                    </div>
                );
            })()}
        </>,
        document.body
    );
};

export default CrossPdfConnectionLayer;
