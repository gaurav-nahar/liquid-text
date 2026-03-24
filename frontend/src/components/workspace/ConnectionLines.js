import React, { useMemo, memo, useState } from "react";

const getVal = (val, def) => { const n = parseFloat(val); return (isNaN(n) || !isFinite(n)) ? def : n; };

const ConnectionLines = memo(({ snippets, editableBoxes, connections, pdfColorMap = {}, onDeleteConnection }) => {
    const [hoveredId, setHoveredId] = useState(null);

    const itemsMap = useMemo(() => {
        const map = new Map();
        snippets.forEach(s => map.set(String(s.id), s));
        editableBoxes.forEach(b => map.set(String(b.id), b));
        return map;
    }, [snippets, editableBoxes]);

    const rendered = useMemo(() => {
        const gradients = [];
        const lines = [];

        connections.forEach((conn, i) => {
            const { from, to } = conn;
            const fromNote = itemsMap.get(String(from));
            const toNote = itemsMap.get(String(to));
            if (!fromNote || !toNote) return;
            if (
                fromNote.type === "anchor" || toNote.type === "anchor" ||
                String(from).includes("anchor-") || String(to).includes("anchor-")
            ) return;

            const x1 = getVal(fromNote.x, 0) + getVal(fromNote.width, 180) / 2;
            const y1 = getVal(fromNote.y, 0) + getVal(fromNote.height, 60) / 2;
            const x2 = getVal(toNote.x, 0) + getVal(toNote.width, 180) / 2;
            const y2 = getVal(toNote.y, 0) + getVal(toNote.height, 60) / 2;

            const fromPdfId = String(fromNote.pdf_id || "");
            const toPdfId   = String(toNote.pdf_id   || "");
            const isCrossPdf = fromPdfId && toPdfId && fromPdfId !== toPdfId;

            const fromColor = pdfColorMap[fromPdfId]?.color || "#007bff";
            const toColor   = pdfColorMap[toPdfId]?.color   || "#007bff";
            const gradId    = `grad-${from}-${to}-${i}`;

            if (isCrossPdf) {
                gradients.push(
                    <linearGradient key={gradId} id={gradId} gradientUnits="userSpaceOnUse"
                        x1={x1} y1={y1} x2={x2} y2={y2}>
                        <stop offset="0%"   stopColor={fromColor} />
                        <stop offset="100%" stopColor={toColor} />
                    </linearGradient>
                );
            }

            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const connId = conn.id || `${from}-${to}-${i}`;

            lines.push({ connId, x1, y1, x2, y2, mx, my, isCrossPdf, gradId, fromColor });
        });

        return { gradients, lines };
    }, [connections, itemsMap, pdfColorMap]);

    return (
        <svg
            width="100%"
            height="100%"
            style={{ position: "absolute", top: 0, left: 0, zIndex: 0, overflow: "visible" }}
        >
            <defs>{rendered.gradients}</defs>
            {rendered.lines.map(({ connId, x1, y1, x2, y2, mx, my, isCrossPdf, gradId, fromColor }) => {
                const isHov = hoveredId === connId;
                return (
                    <g key={connId}>
                        {/* Visible line */}
                        <line
                            x1={x1} y1={y1} x2={x2} y2={y2}
                            stroke={isCrossPdf ? `url(#${gradId})` : "#007bff"}
                            strokeWidth="2.5"
                            strokeOpacity="0.85"
                            strokeDasharray={isCrossPdf ? "7 4" : "none"}
                            style={{ pointerEvents: "none" }}
                        />
                        {/* Invisible wide hit area for hover */}
                        <line
                            x1={x1} y1={y1} x2={x2} y2={y2}
                            stroke="transparent" strokeWidth="20"
                            style={{ pointerEvents: "stroke", cursor: "pointer" }}
                            onMouseEnter={() => setHoveredId(connId)}
                            onMouseLeave={() => setHoveredId(null)}
                        />
                        {/* PDF ↔ PDF label */}
                        {isCrossPdf && (
                            <>
                                <text x={mx} y={my - 1} textAnchor="middle" fontSize="9"
                                    fill="white" stroke="white" strokeWidth="3" paintOrder="stroke"
                                    style={{ pointerEvents: "none", userSelect: "none" }}>
                                    PDF ↔ PDF
                                </text>
                                <text x={mx} y={my - 1} textAnchor="middle" fontSize="9"
                                    fill="#374151"
                                    style={{ pointerEvents: "none", userSelect: "none", fontWeight: 600 }}>
                                    PDF ↔ PDF
                                </text>
                            </>
                        )}
                        {/* Delete × — shown on hover */}
                        {isHov && onDeleteConnection && (
                            <g
                                transform={`translate(${mx},${my + (isCrossPdf ? 12 : 0)})`}
                                style={{ cursor: "pointer" }}
                                onClick={() => onDeleteConnection(connId)}
                                onMouseEnter={() => setHoveredId(connId)}
                                onMouseLeave={() => setHoveredId(null)}
                            >
                                <circle r={9} fill="#ef4444" stroke="white" strokeWidth={1.5} />
                                <text textAnchor="middle" dominantBaseline="middle"
                                    fontSize="11" fontWeight="700" fill="white"
                                    style={{ userSelect: "none" }}>×</text>
                            </g>
                        )}
                    </g>
                );
            })}
        </svg>
    );
});

export default ConnectionLines;
