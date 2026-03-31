import { useState, useEffect, useCallback } from "react";

/**
 * PDFConnectionLines
 * - Default: only anchor dots are visible (dots on both ends of each line)
 * - Click a dot: line appears + PDF scrolls to show the other anchor
 * - Click elsewhere: line hides again
 */
const PDFConnectionLines = ({ lines = [], drawingLine = null, getAnchorScreenPos, containerRef }) => {
    const [activeLineId, setActiveLineId] = useState(null);
    const [, setTick] = useState(0);

    // Re-render when PDF scrolls so dots track page positions
    useEffect(() => {
        const el = containerRef?.current;
        if (!el) return;
        const onScroll = () => setTick(t => t + 1);
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, [containerRef]);

    // Click outside any dot → hide active line
    useEffect(() => {
        if (!activeLineId) return;
        const handler = () => setActiveLineId(null);
        window.addEventListener("mousedown", handler);
        return () => window.removeEventListener("mousedown", handler);
    }, [activeLineId]);

    const scrollAnchorIntoView = useCallback((anchor) => {
        const container = containerRef?.current;
        if (!container || !anchor) return;
        const pageEl = container.querySelector(`.pdf-page-wrapper[data-page-number="${anchor.pageNum}"]`);
        if (pageEl) pageEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [containerRef]);

    const handleDotClick = useCallback((e, line, otherAnchor) => {
        e.stopPropagation();
        if (activeLineId === line.id) {
            setActiveLineId(null);
        } else {
            setActiveLineId(line.id);
            scrollAnchorIntoView(otherAnchor);
        }
    }, [activeLineId, scrollAnchorIntoView]);

    const containerEl = containerRef?.current;
    if (!containerEl) return null;
    const cRect = containerEl.getBoundingClientRect();

    const toLocal = (screenPt) => {
        if (!screenPt) return null;
        return { x: screenPt.x - cRect.left, y: screenPt.y - cRect.top };
    };

    const anchorToLocal = (anchor) => toLocal(getAnchorScreenPos(anchor.pageNum, anchor.xPct, anchor.yPct));

    const hasContent = lines.length > 0 || drawingLine;
    if (!hasContent) return null;

    return (
        <svg
            style={{
                position: "absolute", top: 0, left: 0,
                width: "100%", height: "100%",
                pointerEvents: "none",   // SVG itself passes clicks through
                zIndex: 500,
                overflow: "visible",
            }}
        >
            {lines.map((line) => {
                const from = anchorToLocal(line.from);
                const to   = anchorToLocal(line.to);
                if (!from || !to) return null;
                const isActive = activeLineId === line.id;
                const c = line.color || "#e53935";

                return (
                    <g key={line.id}>
                        {/* Line — only visible when active */}
                        {isActive && (
                            <>
                                <line
                                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                                    stroke="rgba(0,0,0,0.2)" strokeWidth={5} strokeLinecap="round"
                                />
                                <line
                                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                                    stroke={c} strokeWidth={2} strokeLinecap="round"
                                />
                            </>
                        )}

                        {/* FROM dot — always visible, clickable */}
                        <circle
                            cx={from.x} cy={from.y} r={isActive ? 7 : 5}
                            fill={c} opacity={isActive ? 1 : 0.75}
                            stroke="white" strokeWidth={1.5}
                            style={{ pointerEvents: "auto", cursor: "pointer" }}
                            onMouseDown={(e) => handleDotClick(e, line, line.to)}
                        />

                        {/* TO dot — always visible, clickable */}
                        <circle
                            cx={to.x} cy={to.y} r={isActive ? 7 : 5}
                            fill={c} opacity={isActive ? 1 : 0.75}
                            stroke="white" strokeWidth={1.5}
                            style={{ pointerEvents: "auto", cursor: "pointer" }}
                            onMouseDown={(e) => handleDotClick(e, line, line.from)}
                        />

                        {/* Page number badge on dots when active */}
                        {isActive && (
                            <>
                                <text x={from.x + 9} y={from.y - 6} fontSize="11" fill={c}
                                    fontWeight="bold" style={{ pointerEvents: "none" }}>
                                    p{line.from.pageNum}
                                </text>
                                <text x={to.x + 9} y={to.y - 6} fontSize="11" fill={c}
                                    fontWeight="bold" style={{ pointerEvents: "none" }}>
                                    p{line.to.pageNum}
                                </text>
                            </>
                        )}
                    </g>
                );
            })}

            {/* Live preview while dragging */}
            {drawingLine && (() => {
                const from = toLocal(drawingLine.startScreen);
                const to   = toLocal(drawingLine.endScreen);
                if (!from || !to) return null;
                return (
                    <g>
                        <line
                            x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                            stroke={drawingLine.color || "#e53935"}
                            strokeWidth={2} strokeDasharray="8 4"
                            strokeLinecap="round" opacity={0.8}
                        />
                        <circle cx={from.x} cy={from.y} r={5}
                            fill={drawingLine.color || "#e53935"}
                            stroke="white" strokeWidth={1.5}
                        />
                    </g>
                );
            })()}
        </svg>
    );
};

export default PDFConnectionLines;
