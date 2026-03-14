import React, { useRef, memo, useCallback } from "react";
import { Stage, Layer, Line } from "react-konva";
import { useApp } from "../../context/AppContext";

const isNear = (x1, y1, x2, y2, zoomLevel = 1, threshold = 15) => {
    const adjThreshold = threshold / zoomLevel;
    return Math.abs(x1 - x2) < adjThreshold && Math.abs(y1 - y2) < adjThreshold;
};

const PDFDrawingLayer = memo(({ pageNum, width, height, tool, selectedColor, zoomLevel = 1, isResizing = false }) => {
    const { pdfLines: lines, setPdfLines: setLines, setIsDirty } = useApp();
    const isDrawing = useRef(false);
    const [activeLine, setActiveLine] = React.useState(null); // Local active line

    const updateLines = useCallback((updater) => {
        setLines(updater);
        if (setIsDirty) setIsDirty(true);
    }, [setLines, setIsDirty]);

    const getCoordinates = (e) => {
        const stage = e.target.getStage();
        const rect = stage.container().getBoundingClientRect();

        let clientX, clientY;
        if (e.evt.touches && e.evt.touches.length > 0) {
            clientX = e.evt.touches[0].clientX;
            clientY = e.evt.touches[0].clientY;
        } else if (e.evt.clientX !== undefined) {
            clientX = e.evt.clientX;
            clientY = e.evt.clientY;
        } else {
            // Fallback to Konva's pointer position if evt is not helpful
            const pos = stage.getPointerPosition();
            return pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 };
        }

        return {
            x: (clientX - rect.left) / zoomLevel,
            y: (clientY - rect.top) / zoomLevel
        };
    };

    const handlePointerDown = (e) => {
        if (tool !== "pen" && tool !== "eraser") return;

        // 🛡️ Prevent selection interference
        if (e.evt) {
            e.evt.stopPropagation();
            if (e.evt.cancelable) e.evt.preventDefault();
        }

        isDrawing.current = true;
        const { x, y } = getCoordinates(e);

        if (tool === "pen") {
            setActiveLine({
                id: `pdf-line-${Date.now()}-${Math.random()}`,
                pageNum,
                tool: "pen",
                points: [x, y],
                color: selectedColor,
                width: 2,
            });
        }
    };

    const handlePointerMove = (e) => {
        if (!isDrawing.current || (tool !== "pen" && tool !== "eraser")) return;

        // 🛡️ Prevent selection interference
        if (e.evt) {
            e.evt.stopPropagation();
        }

        const { x, y } = getCoordinates(e);

        if (tool === "pen") {
            setActiveLine((prev) => {
                if (!prev) return prev;
                return { ...prev, points: prev.points.concat([x, y]) };
            });
        } else if (tool === "eraser") {
            updateLines((prevLines) =>
                prevLines.filter(line => {
                    if (line.pageNum !== pageNum) return true;
                    for (let i = 0; i < line.points.length; i += 2) {
                        if (isNear(line.points[i], line.points[i + 1], x, y, zoomLevel)) {
                            return false;
                        }
                    }
                    return true;
                })
            );
        }
    };

    const handlePointerUp = () => {
        if (!isDrawing.current) return;
        isDrawing.current = false;

        if (tool === "pen" && activeLine) {
            if (activeLine.points.length > 2) {
                const lineToSave = {
                    ...activeLine,
                    points: activeLine.points // Keep original for backward compatibility
                };

                updateLines((prev) => [...prev, lineToSave]);
            }
            setActiveLine(null);
        }
    };

    const pageLines = lines.filter(l => l.pageNum === pageNum);

    return (
        <div className="pdf-drawing-container" style={{
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height,
            zIndex: 3, // Above text layer when drawing
            pointerEvents: (tool === "pen" || tool === "eraser") ? "auto" : "none",
        }}>
            <Stage
                width={Math.max(1, width)}
                height={Math.max(1, height)}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
            >
                <Layer>
                    {pageLines.map((line) => (
                        <Line
                            key={line.id}
                            points={line.points}
                            stroke={line.color}
                            strokeWidth={line.width}
                            tension={0.5}
                            lineCap="round"
                            lineJoin="round"
                            globalCompositeOperation={
                                line.tool === "eraser" ? "destination-out" : "source-over"
                            }
                        />
                    ))}
                    {activeLine && (
                        <Line
                            points={activeLine.points}
                            stroke={activeLine.color}
                            strokeWidth={activeLine.width}
                            tension={0.5}
                            lineCap="round"
                            lineJoin="round"
                        />
                    )}
                </Layer>
            </Stage>
        </div>
    );
});

export default PDFDrawingLayer;
