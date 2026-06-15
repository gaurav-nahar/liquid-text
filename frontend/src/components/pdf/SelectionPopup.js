import React, { useState } from "react";

const SelectionPopup = ({ position, onSelectMore, onLink, onClose, showSelectMore, onHighlight, onBookmark, onConnectPdf, hasPendingCrossLink, onDragWireStart }) => {
    const dragStartedRef = React.useRef(false);
    const dragPointerRef = React.useRef(null);
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
    const [bookmarkSaving, setBookmarkSaving] = useState(false);

    React.useEffect(() => {
        return () => {
            dragPointerRef.current?.cleanup?.();
            dragPointerRef.current = null;
        };
    }, []);

    React.useEffect(() => {
        const handleClickOutside = (e) => {
            if (!e.target.closest('.selection-popup')) {
                onClose();
            }
        };
        const timer = setTimeout(() => {
            window.addEventListener('pointerdown', handleClickOutside);
        }, 100);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('pointerdown', handleClickOutside);
        };
    }, [onClose]);

    React.useEffect(() => {
        setBookmarked(false);
        setBookmarkSaving(false);
    }, [position.x, position.y]);

    const handleBookmark = async () => {
        if (bookmarked || bookmarkSaving) return;
        setBookmarkSaving(true);
        try {
            await onBookmark?.();
            setBookmarked(true);
            setTimeout(onClose, 600);
        } catch (err) {
            console.error("Bookmark save failed:", err);
        } finally {
            setBookmarkSaving(false);
        }
    };

    const btnBase = {
        background: "transparent",
        border: "none",
        padding: "3px 7px",
        borderRadius: "10px",
        cursor: "pointer",
        fontSize: "11px",
        fontWeight: "500",
        transition: "all 0.15s ease",
        display: "flex",
        alignItems: "center",
        gap: "3px",
        whiteSpace: "nowrap",
        lineHeight: 1,
    };

    return (
        <div
            className="selection-popup"
            style={{
                left: position.x,
                top: position.y,
                display: "flex",
                alignItems: "center",
                flexWrap: "nowrap",
                gap: "4px",
                padding: "6px 10px",
                background: "rgba(255,255,255,0.92)",
                backdropFilter: "blur(24px) saturate(200%)",
                WebkitBackdropFilter: "blur(24px) saturate(200%)",
                borderRadius: "16px",
                border: "1px solid rgba(0,0,0,0.06)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.12), 0 2px 10px rgba(0,0,0,0.05)",
                zIndex: 1000,
                position: "absolute",
                transform: "translateX(-50%)",
                animation: "popupFadeIn 0.14s cubic-bezier(0.4,0,0.2,1)",
                maxWidth: "min(380px, 92vw)",
                boxSizing: "border-box",
            }}
        >
            {/* Highlight color dots */}
            <div style={{
                display: "flex", gap: "6px", paddingRight: "8px",
                borderRight: "1px solid rgba(0,0,0,0.08)", alignItems: "center",
                flexShrink: 0,
            }}>
                {colors.map((color) => (
                    <div
                        key={color.hex}
                        onClick={() => onHighlight(color.hex)}
                        onMouseEnter={() => setHoveredColor(color.hex)}
                        onMouseLeave={() => setHoveredColor(null)}
                        title={`Highlight ${color.name}`}
                        style={{
                            width: hoveredColor === color.hex ? "13px" : "10px",
                            height: hoveredColor === color.hex ? "13px" : "10px",
                            borderRadius: "50%",
                            backgroundColor: color.hex,
                            cursor: "pointer",
                            border: "1.5px solid rgba(0,0,0,0.1)",
                            boxShadow: hoveredColor === color.hex ? `0 0 0 2.5px ${color.hex}60` : "0 1px 3px rgba(0,0,0,0.1)",
                            transition: "all 0.12s ease",
                        }}
                    />
                ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "1px", alignItems: "center", flexShrink: 0 }}>
                {showSelectMore && (
                    <button
                        onClick={onSelectMore}
                        onMouseEnter={() => setHoveredBtn("more")}
                        onMouseLeave={() => setHoveredBtn(null)}
                        style={{
                            ...btnBase,
                            color: "#444",
                            backgroundColor: hoveredBtn === "more" ? "rgba(0,0,0,0.06)" : "transparent",
                            fontWeight: "600",
                        }}
                    >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        More
                    </button>
                )}

                {/* Bookmark */}
                <button
                    onClick={handleBookmark}
                    onMouseEnter={() => setHoveredBtn("bm")}
                    onMouseLeave={() => setHoveredBtn(null)}
                    title="Bookmark this selection"
                    disabled={bookmarkSaving}
                    style={{
                        ...btnBase,
                        color: bookmarked ? "#d97706" : "#444",
                        backgroundColor: hoveredBtn === "bm" ? "rgba(245,158,11,0.15)" : "transparent",
                        fontWeight: "600",
                        opacity: bookmarkSaving ? 0.65 : 1,
                    }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24"
                        fill={bookmarked ? "#d97706" : "none"}
                        stroke={bookmarked ? "#d97706" : "currentColor"}
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    {bookmarked ? "Saved!" : (bookmarkSaving ? "Saving…" : "Bookmark")}
                </button>


                {/* Connect PDF */}
                {onConnectPdf && (
                    <button
                        onClick={(e) => {
                            if (dragStartedRef.current) {
                                dragStartedRef.current = false;
                                return;
                            }
                            onConnectPdf(e);
                        }}
                        onMouseEnter={() => setHoveredBtn("xpdf")}
                        onMouseLeave={() => setHoveredBtn(null)}
                        onPointerDown={(e) => {
                            if (onDragWireStart && !hasPendingCrossLink) {
                                dragStartedRef.current = false;
                                const startX = e.clientX;
                                const startY = e.clientY;
                                const btn = e.currentTarget;
                                btn.setPointerCapture(e.pointerId);

                                const onMove = (moveEvent) => {
                                    const dx = moveEvent.clientX - startX;
                                    const dy = moveEvent.clientY - startY;
                                    if (!dragStartedRef.current && Math.hypot(dx, dy) >= 6) {
                                        dragStartedRef.current = true;
                                        onDragWireStart(startX, startY);
                                    }
                                };

                                const onUp = () => {
                                    btn.removeEventListener("pointermove", onMove);
                                    btn.removeEventListener("pointerup", onUp);
                                    btn.removeEventListener("pointercancel", onUp);
                                    dragPointerRef.current = null;
                                };

                                dragPointerRef.current = {
                                    cleanup: () => {
                                        btn.removeEventListener("pointermove", onMove);
                                        btn.removeEventListener("pointerup", onUp);
                                        btn.removeEventListener("pointercancel", onUp);
                                    },
                                };

                                btn.addEventListener("pointermove", onMove);
                                btn.addEventListener("pointerup", onUp);
                                btn.addEventListener("pointercancel", onUp);
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
                                : (hoveredBtn === "xpdf" ? "rgba(0,0,0,0.06)" : "transparent"),
                            color: hasPendingCrossLink ? "white" : "#444",
                            fontWeight: hasPendingCrossLink ? "700" : "600",
                            border: hasPendingCrossLink ? "none" : "1px solid rgba(0,0,0,0.1)",
                            padding: "4px 10px",
                            borderRadius: "12px",
                            boxShadow: hasPendingCrossLink && hoveredBtn === "xpdf" ? "0 2px 8px rgba(16,185,129,0.4)" : "none",
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
                    background: hoveredBtn === "x" ? "rgba(0,0,0,0.06)" : "transparent",
                    color: "rgba(0,0,0,0.4)",
                    border: "none", width: "18px", height: "18px", borderRadius: "50%",
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: "11px", transition: "all 0.15s ease",
                    flexShrink: 0, padding: 0, fontWeight: "bold"
                }}
            >✕</button>

            <style>{`
                @keyframes popupFadeIn {
                    from { opacity: 0; transform: translateX(-50%) scale(0.92); }
                    to   { opacity: 1; transform: translateX(-50%) scale(1); }
                }
                @keyframes pulseGreen {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
                    50%       { box-shadow: 0 0 0 3px rgba(16,185,129,0.15); }
                }
                .selection-popup {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                }
            `}</style>
        </div>
    );
};

export default SelectionPopup;
