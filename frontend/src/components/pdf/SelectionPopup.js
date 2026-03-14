import React, { useState } from "react";

/**
 * ✨ SelectionPopup: A premium, modern floating toolbar for text selection.
 * Features: High-quality shadows, glassmorphism, and smooth hover effects.
 */
const SelectionPopup = ({ position, onSelectMore, onLink, onClose, showSelectMore, onHighlight }) => {
    const colors = [
        { hex: "#FFD60A", name: "Yellow" }, // Vibrant Yellow
        { hex: "#32D74B", name: "Green" },  // Apple Green
        { hex: "#0A84FF", name: "Blue" },   // Apple Blue
        { hex: "#FF375F", name: "Pink" },   // Vivid Pink
        { hex: "#FF9F0A", name: "Orange" }  // Bright Orange
    ];

    const [hoveredColor, setHoveredColor] = useState(null);
    const [hoveredBtn, setHoveredBtn] = useState(null);

    return (
        <div
            className="selection-popup animate-in"
            style={{
                left: position.x,
                top: position.y,
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "6px 14px",
                background: "rgba(255, 255, 255, 0.85)",
                backdropFilter: "blur(12px) saturate(180%)",
                WebkitBackdropFilter: "blur(12px) saturate(180%)",
                borderRadius: "30px", // Pill shape
                border: "1px solid rgba(255, 255, 255, 0.3)",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.06)",
                zIndex: 1000,
                position: "absolute",
                transform: "translateX(-50%) translateY(-10px)",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                animation: "popupFadeIn 0.2s ease-out"
            }}
        >
            {/* 🎨 Highlight Color Picker */}
            <div style={{
                display: "flex",
                gap: "8px",
                paddingRight: "12px",
                borderRight: "1px solid rgba(0,0,0,0.08)",
                alignItems: "center"
            }}>
                {colors.map((color) => (
                    <div
                        key={color.hex}
                        onClick={() => onHighlight(color.hex)}
                        onMouseEnter={() => setHoveredColor(color.hex)}
                        onMouseLeave={() => setHoveredColor(null)}
                        style={{
                            width: hoveredColor === color.hex ? "22px" : "18px",
                            height: hoveredColor === color.hex ? "22px" : "18px",
                            borderRadius: "50%",
                            backgroundColor: color.hex,
                            cursor: "pointer",
                            border: "2px solid white",
                            boxShadow: hoveredColor === color.hex
                                ? `0 0 0 2px ${color.hex}44, 0 4px 10px rgba(0,0,0,0.15)`
                                : "0 2px 5px rgba(0,0,0,0.1)",
                            transition: "all 0.2s ease",
                            transform: hoveredColor === color.hex ? "scale(1.15)" : "scale(1)"
                        }}
                        title={`Highlight ${color.name}`}
                    />
                ))}
            </div>

            {/* 🛠️ Action Buttons */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {showSelectMore && (
                    <button
                        onClick={onSelectMore}
                        onMouseEnter={() => setHoveredBtn("more")}
                        onMouseLeave={() => setHoveredBtn(null)}
                        style={{
                            background: "transparent",
                            color: "#1d1d1f",
                            border: "none",
                            padding: "6px 10px",
                            borderRadius: "16px",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: "500",
                            transition: "all 0.2s ease",
                            backgroundColor: hoveredBtn === "more" ? "rgba(0,0,0,0.05)" : "transparent",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px"
                        }}
                    >
                        <span style={{ fontSize: "16px" }}>+</span> Select More
                    </button>
                )}
                <button
                    onClick={onLink}
                    onMouseEnter={() => setHoveredBtn("link")}
                    onMouseLeave={() => setHoveredBtn(null)}
                    style={{
                        background: hoveredBtn === "link" ? "#0071e3" : "#007aff",
                        color: "white",
                        border: "none",
                        padding: "6px 14px",
                        borderRadius: "16px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: "600",
                        boxShadow: hoveredBtn === "link" ? "0 4px 12px rgba(0,122,255,0.3)" : "none",
                        transition: "all 0.2s ease",
                        transform: hoveredBtn === "link" ? "translateY(-1px)" : "none"
                    }}
                >
                    Link to Box
                </button>
            </div>

            {/* ❌ Close Button */}
            <button
                onClick={onClose}
                onMouseEnter={() => setHoveredBtn("close")}
                onMouseLeave={() => setHoveredBtn(null)}
                style={{
                    background: hoveredBtn === "close" ? "rgba(0,0,0,0.08)" : "transparent",
                    color: "#86868b",
                    border: "none",
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    transition: "all 0.2s ease",
                    marginLeft: "4px"
                }}
            >
                ✕
            </button>

            {/* Styles for Animations */}
            <style>
                {`
                @keyframes popupFadeIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(0px) scale(0.95); }
                    to { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1); }
                }
                .selection-popup {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                }
                `}
            </style>
        </div>
    );
};

export default SelectionPopup;
