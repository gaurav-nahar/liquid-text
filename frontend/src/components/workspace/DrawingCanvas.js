import React, { useRef, memo, useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Stage, Layer, Line } from "react-konva";
import { useCanvas } from "./InfiniteCanvas";

/**
 * 🖌️ DrawingCanvas (Multi-Layer High Performance Edition)
 */
const isNear = (x1, y1, x2, y2, threshold = 15) => {
  const dx = x1 - x2;
  if (Math.abs(dx) > threshold) return false;
  const dy = y1 - y2;
  if (Math.abs(dy) > threshold) return false;
  return (dx * dx + dy * dy) < (threshold * threshold);
};

const DrawingCanvas = memo(({ tool, lines, setLines, selectedColor }) => {
  const isDrawing = useRef(false);
  const { screenToWorld, pan, scale, containerRef } = useCanvas();

  // High performance refs
  const activeLineRef = useRef(null);
  const staticLayerRef = useRef(null);
  const currentPoints = useRef([]);
  const lastPoint = useRef({ x: 0, y: 0 });

  // Track container size
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [containerRef]);

  // Handle caching of static lines for extreme performance
  useEffect(() => {
    if (staticLayerRef.current) {
      // We don't use layer.cache() here because we want to maintain zoom crispness,
      // but we use listening={false} for huge speed gains in Konva's hit graph.
    }
  }, [lines]);

  const handlePointerDown = (e) => {
    if (tool !== "pen" && tool !== "eraser") return;

    const nativeEvent = e.evt;
    if (!nativeEvent) return;

    // 👆 Finger (touch) passes through — lets user pan/scroll the workspace while drawing with pen
    if (nativeEvent.pointerType === 'touch') return;

    nativeEvent.preventDefault(); // Stop scrolling/etc
    nativeEvent.stopPropagation();

    // For pointer events: only left button or pen (ignore right-click, barrel button, etc.)
    if (nativeEvent.pointerType === 'mouse' && nativeEvent.button !== 0) return;

    isDrawing.current = true;
    const clientX = nativeEvent.clientX || nativeEvent.touches?.[0]?.clientX;
    const clientY = nativeEvent.clientY || nativeEvent.touches?.[0]?.clientY;

    const worldPos = screenToWorld(clientX, clientY);
    lastPoint.current = worldPos;
    currentPoints.current = [worldPos.x, worldPos.y];

    if (tool === "pen" && activeLineRef.current) {
      activeLineRef.current.visible(true);
      activeLineRef.current.stroke(selectedColor);
      activeLineRef.current.points(currentPoints.current);
      activeLineRef.current.getLayer().batchDraw(); // Only redraw active layer
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawing.current || (tool !== "pen" && tool !== "eraser")) return;

    const nativeEvent = e.evt;
    if (!nativeEvent || nativeEvent.pointerType === 'touch') return; // Touch scrolls, pen draws
    nativeEvent.preventDefault();
    nativeEvent.stopPropagation();

    const clientX = nativeEvent.clientX || nativeEvent.touches?.[0]?.clientX;
    const clientY = nativeEvent.clientY || nativeEvent.touches?.[0]?.clientY;

    const worldPos = screenToWorld(clientX, clientY);

    const dx = worldPos.x - lastPoint.current.x;
    const dy = worldPos.y - lastPoint.current.y;
    const distSq = dx * dx + dy * dy;

    if (tool === "pen") {
      if (distSq < 2) return; // World-unit threshold

      lastPoint.current = worldPos;
      currentPoints.current.push(worldPos.x, worldPos.y);

      if (activeLineRef.current) {
        activeLineRef.current.points(currentPoints.current);
        activeLineRef.current.getLayer().batchDraw(); // SILKY SMOOTH
      }
    } else if (tool === "eraser") {
      if (distSq < 25) return;
      lastPoint.current = worldPos;

      setLines((prevLines) => {
        const nextLines = prevLines.filter(line => {
          for (let i = 0; i < line.points.length; i += 2) {
            if (isNear(line.points[i], line.points[i + 1], worldPos.x, worldPos.y, 25 / scale)) {
              return false;
            }
          }
          return true;
        });
        return nextLines.length === prevLines.length ? prevLines : nextLines;
      });
    }
  };

  const handlePointerUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (tool === "pen" && currentPoints.current.length > 2) {
      const newLine = {
        tool: "pen",
        points: [...currentPoints.current],
        color: selectedColor,
        width: 2
      };
      setLines((prev) => [...prev, newLine]);

      if (activeLineRef.current) {
        activeLineRef.current.visible(false);
        activeLineRef.current.getLayer().batchDraw();
      }
    }
    currentPoints.current = [];
  };

  // Memoize stationary lines so they don't recalculate props during a stroke
  const renderedStaticLines = useMemo(() => (
    lines.map((line, i) => (
      <Line
        key={i}
        points={line.points}
        stroke={line.color}
        strokeWidth={line.width / scale}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
        listening={false} // HUGE: disables hit detection for old lines
        perfectDrawEnabled={false} // Skip expensive curve math for history
      />
    ))
  ), [lines, scale]);

  const canvasContent = (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 10
    }}>
      <Stage
        width={size.width}
        height={size.height}
        pixelRatio={1} // Prevents blurry but heavy high-DPI canvases
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          pointerEvents: (tool === "pen" || tool === "eraser") ? "auto" : "none",
        }}
      >
        {/* 📚 STATIC LAYER: Redraws only when lines change */}
        <Layer ref={staticLayerRef} x={pan.x} y={pan.y} scaleX={scale} scaleY={scale} listening={false}>
          {renderedStaticLines}
        </Layer>

        {/* 🖌️ ACTIVE LAYER: Zero-lag high-frequency layer */}
        <Layer x={pan.x} y={pan.y} scaleX={scale} scaleY={scale}>
          <Line
            ref={activeLineRef}
            visible={false}
            stroke={selectedColor}
            strokeWidth={2 / scale}
            tension={0.5}
            lineCap="round"
            lineJoin="round"
            perfectDrawEnabled={false} // Fast drawing
            listening={false}
            shadowForStrokeEnabled={false}
          />
        </Layer>
      </Stage>
    </div>
  );

  return containerRef.current ? createPortal(canvasContent, containerRef.current) : null;
});

export default DrawingCanvas;
