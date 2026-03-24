import React, { useState } from "react";

const SelectionPopup = ({ position, onSelectMore, onLink, onClose, showSelectMore, onHighlight, onBookmark, onConnectPdf, hasPendingCrossLink, onDragWireStart }) => {
    const dragStartedRef = React.useRef(false);
    const colors = [
        { hex: "#FFD60A", name: "Yellow" },
        { hex: "#32D74B", name: "Green" },
        { hex: "#0A84FF", name: "Blue" },
        { hex: "#FF375F", name: "Pink" },
        { hex: "#FF9F0A", name: "Orange" }
    ];

    const [hoveredColor, setHoveredColor] = useState(null);
    const [hoveredBtn, setHoveredBtn] = useState(null);
    const [bookmarked, setBookmarked] = useState(false);

    const handleBookmark = () => {
        if (bookmarked) return;
        setBookmarked(true);
        onBookmark?.();
        setTimeout(onClose, 600);
    };

    const btnBase = {
        background: "transparent",
        border: "none",
        padding: "5px 10px",
        borderRadius: "16px",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: "500",
        transition: "all 0.15s ease",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        whiteSpace: "nowrap",
    };

    return (
        <div
            className="selection-popup"
            style={{
                left: position.x,
                top: position.y,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 10px",
                background: "rgba(28,28,32,0.94)",
                backdropFilter: "blur(16px) saturate(180%)",
                WebkitBackdropFilter: "blur(16px) saturate(180%)",
                borderRadius: "32px",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.2)",
                zIndex: 1000,
                position: "absolute",
                transform: "translateX(-50%) translateY(-10px)",
                animation: "popupFadeIn 0.16s cubic-bezier(0.4,0,0.2,1)",
            }}
        >
            {/* Highlight color dots */}
            <div style={{
                display: "flex", gap: "6px", paddingRight: "8px",
                borderRight: "1px solid rgba(255,255,255,0.1)", alignItems: "center"
            }}>
                {colors.map((color) => (
                    <div
                        key={color.hex}
                        onClick={() => onHighlight(color.hex)}
                        onMouseEnter={() => setHoveredColor(color.hex)}
                        onMouseLeave={() => setHoveredColor(null)}
                        title={`Highlight ${color.name}`}
                        style={{
                            width: hoveredColor === color.hex ? "20px" : "15px",
                            height: hoveredColor === color.hex ? "20px" : "15px",
                            borderRadius: "50%",
                            backgroundColor: color.hex,
                            cursor: "pointer",
                            border: "2px solid rgba(255,255,255,0.3)",
                            boxShadow: hoveredColor === color.hex ? `0 0 0 2.5px ${color.hex}70` : "none",
                            transition: "all 0.15s ease",
                        }}
                    />
                ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "1px", alignItems: "center" }}>
                {showSelectMore && (
                    <button
                        onClick={onSelectMore}
                        onMouseEnter={() => setHoveredBtn("more")}
                        onMouseLeave={() => setHoveredBtn(null)}
                        style={{
                            ...btnBase,
                            color: "rgba(255,255,255,0.8)",
                            backgroundColor: hoveredBtn === "more" ? "rgba(255,255,255,0.1)" : "transparent",
                        }}
                    >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        More
                    </button>
                )}

                {/* Bookmark — LiquidText style */}
                <button
                    onClick={handleBookmark}
                    onMouseEnter={() => setHoveredBtn("bm")}
                    onMouseLeave={() => setHoveredBtn(null)}
                    title="Bookmark this selection"
                    style={{
                        ...btnBase,
                        color: bookmarked ? "#FFD60A" : "rgba(255,255,255,0.8)",
                        backgroundColor: hoveredBtn === "bm" ? "rgba(255,214,10,0.15)" : "transparent",
                    }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24"
                        fill={bookmarked ? "#FFD60A" : "none"}
                        stroke={bookmarked ? "#FFD60A" : "currentColor"}
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    {bookmarked ? "Saved!" : "Bookmark"}
                </button>

                {/* Link to Box */}
                <button
                    onClick={onLink}
                    onMouseEnter={() => setHoveredBtn("link")}
                    onMouseLeave={() => setHoveredBtn(null)}
                    style={{
                        ...btnBase,
                        background: hoveredBtn === "link" ? "#0071e3" : "#007aff",
                        color: "white",
                        fontWeight: "600",
                        padding: "5px 13px",
                        boxShadow: hoveredBtn === "link" ? "0 4px 12px rgba(0,122,255,0.4)" : "none",
                        transform: hoveredBtn === "link" ? "translateY(-1px)" : "none",
                    }}
                >
                    Link to Box
                </button>

                {/* Connect PDF — cross-PDF connection line (LiquidText style) */}
                {onConnectPdf && (
                    <button
                        onClick={(e) => {
                            // If a drag was initiated on mousedown, skip the click action
                            if (dragStartedRef.current) {
                                dragStartedRef.current = false;
                                return;
                            }
                            onConnectPdf(e);
                        }}
                        onMouseEnter={() => setHoveredBtn("xpdf")}
                        onMouseLeave={() => setHoveredBtn(null)}
                        onMouseDown={(e) => {
                            if (onDragWireStart && !hasPendingCrossLink) {
                                dragStartedRef.current = true;
                                onDragWireStart(e.clientX, e.clientY);
                                e.stopPropagation();
                            }
                        }}
                        title={hasPendingCrossLink
                            ? "Complete the cross-PDF connection"
                            : "Click to link step-by-step · Drag to the other PDF to connect instantly"}
                        style={{
                            ...btnBase,
                            background: hasPendingCrossLink
                                ? (hoveredBtn === "xpdf" ? "#059669" : "#10b981")
                                : (hoveredBtn === "xpdf" ? "rgba(255,255,255,0.15)" : "transparent"),
                            color: hasPendingCrossLink ? "white" : "rgba(255,255,255,0.85)",
                            fontWeight: hasPendingCrossLink ? "700" : "500",
                            border: hasPendingCrossLink ? "none" : "1px solid rgba(255,255,255,0.15)",
                            padding: "5px 11px",
                            boxShadow: hasPendingCrossLink && hoveredBtn === "xpdf" ? "0 4px 12px rgba(16,185,129,0.4)" : "none",
                            animation: hasPendingCrossLink ? "pulseGreen 1.4s ease-in-out infinite" : "none",
                            cursor: hasPendingCrossLink ? "pointer" : "grab",
                        }}
                    >
                        {hasPendingCrossLink ? "✓ Link Here" : "Connect PDF"}
                    </button>
                )}
            </div>

            {/* Close */}
            <button
                onClick={onClose}
                onMouseEnter={() => setHoveredBtn("x")}
                onMouseLeave={() => setHoveredBtn(null)}
                style={{
                    background: hoveredBtn === "x" ? "rgba(255,255,255,0.1)" : "transparent",
                    color: "rgba(255,255,255,0.4)",
                    border: "none", width: "20px", height: "20px", borderRadius: "50%",
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: "12px", transition: "all 0.15s ease",
                }}
            >✕</button>

            <style>{`
                @keyframes popupFadeIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(-4px) scale(0.94); }
                    to   { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1); }
                }
                @keyframes pulseGreen {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
                    50%       { box-shadow: 0 0 0 4px rgba(16,185,129,0.15); }
                }
                .selection-popup {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                }
            `}</style>
        </div>
    );
};

export default SelectionPopup;
