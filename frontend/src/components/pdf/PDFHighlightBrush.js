import React, { useEffect, useRef, useState, memo } from 'react';
import { useApp } from '../../context/AppContext';
const PDFHighlightBrush = memo(({
    pageNum,
    width,
    height,
    zoomLevel = 1,
    isResizing = false // 📏 Sync prop
}) => {
    const {
        tool,
        brushHighlights: existingHighlights,
        highlightBrushColor: selectedColor,
        handleBrushHighlightCreate: onHighlightCreate
    } = useApp();
    const isActive = tool === "highlight-brush";
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPath, setCurrentPath] = useState([]);

    // 🎨 Render highlights for this page
    useEffect(() => {
        if (isResizing) return; // 🚀 OPTIMIZATION: Skip expensive re-draw during drag to fix flickering

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(zoomLevel, zoomLevel);
        ctx.clearRect(0, 0, width, height);

        // Filter highlights for THIS page
        const pageHighlights = existingHighlights.filter(h => h.pageNum === pageNum);

        pageHighlights.forEach(highlight => {
            if (!highlight.path || highlight.path.length < 2) return;

            ctx.beginPath();
            ctx.strokeStyle = highlight.color;
            ctx.lineWidth = highlight.brushWidth || 20;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.5;

            highlight.path.forEach((point, i) => {
                const x = point.xPct * width;
                const y = point.yPct * height;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.stroke();
        });
        ctx.restore();
    }, [existingHighlights, pageNum, width, height, zoomLevel, isResizing]);

    // Helper to get cleaner coordinates
    const getCoordinates = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        let clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // 🎯 Robust coordinate translation: (ScreenPos - CanvasStart) / Zoom
        // This factors in centering, padding, and zoom.
        return {
            x: (clientX - rect.left) / zoomLevel,
            y: (clientY - rect.top) / zoomLevel
        };
    };

    // Handle mouse/touch events for drawing
    const handleStart = (e) => {
        if (!isActive) return;

        if (e.type === 'touchstart') {
            // Passive touch listener may not allow preventDefault, but we try anyway
            // if we want to block scroll
            if (e.cancelable) e.preventDefault();
        } else {
            e.preventDefault();
        }
        e.stopPropagation();

        const { x, y } = getCoordinates(e);
        setIsDrawing(true);
        setCurrentPath([{ x, y }]);
    };

    const handleMove = (e) => {
        if (!isDrawing) return;

        // CRITICAL: Prevent scrolling on touch devices while drawing
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();

        const { x, y } = getCoordinates(e);
        const newPath = [...currentPath, { x, y }];
        setCurrentPath(newPath);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // --- Full redraw to prevent alpha compounding ---
        ctx.save();
        ctx.scale(zoomLevel, zoomLevel);
        ctx.clearRect(0, 0, width, height);

        // 1. Redraw all saved highlights for this page
        const pageHighlights = existingHighlights.filter(h => h.pageNum === pageNum);
        pageHighlights.forEach(highlight => {
            if (!highlight.path || highlight.path.length < 2) return;
            ctx.beginPath();
            ctx.strokeStyle = highlight.color;
            ctx.lineWidth = highlight.brushWidth || 20;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.5;
            highlight.path.forEach((point, i) => {
                const px = point.xPct * width;
                const py = point.yPct * height;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();
        });

        // 2. Draw the current in-progress path as a single stroke
        if (newPath.length >= 2) {
            ctx.beginPath();
            ctx.strokeStyle = selectedColor;
            ctx.lineWidth = 20;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.5;
            newPath.forEach((point, i) => {
                if (i === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            });
            ctx.stroke();
        }

        ctx.restore();
    };

    const handleEnd = (e) => {
        if (!isDrawing) return;

        if (currentPath.length >= 2) {
            // Convert to normalized coordinates
            const normalizedPath = currentPath.map(point => ({
                xPct: point.x / width,
                yPct: point.y / height
            }));

            const highlight = {
                id: `brush-${Date.now()}`,
                pageNum: pageNum,
                color: selectedColor,
                path: normalizedPath,
                brushWidth: 20
            };

            onHighlightCreate(highlight);
        }

        setIsDrawing(false);
        setCurrentPath([]);
    };

    return (
        <canvas
            ref={canvasRef}
            className="brush-highlight-canvas"
            width={width * zoomLevel}
            height={height * zoomLevel}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: width + 'px',
                height: height + 'px',
                pointerEvents: isActive ? 'auto' : 'none',
                zIndex: isActive ? 10 : 2,
                cursor: isActive ? 'crosshair' : 'default',
                userSelect: 'none',
                touchAction: isActive ? 'none' : 'auto', // Disable default touch behavior like scrolling
            }}
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
            onTouchCancel={handleEnd}
        />
    );
});

export default PDFHighlightBrush;
