import React, { useRef, useState, useEffect, useCallback, createContext, useContext, useMemo } from 'react';

// Create a context so children can access coordinate helpers
const CanvasContext = createContext({
    screenToWorld: (x, y) => ({ x, y }),
    worldToScreen: (x, y) => ({ x, y }),
    scale: 1,
    pan: { x: 0, y: 0 },
    containerRef: { current: null },
    rectRef: { current: { left: 0, top: 0 } }
});

export const useCanvas = () => useContext(CanvasContext);

const InfiniteCanvas = React.forwardRef(({ children, className, style, initialScale = 1, initialPan = { x: 0, y: 0 }, onViewChange, panningEnabled = true }, ref) => {
    const [pan, setPan] = useState(initialPan);
    const [scale, setScale] = useState(initialScale);
    const containerRef = useRef(null);
    const isPanning = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const isSpacePressed = useRef(false);
    const isZooming = useRef(false); // Track if 2-finger zoom started on canvas

    // Refs for stable access in callbacks without re-creating functions
    const panRef = useRef(pan);
    const scaleRef = useRef(scale);
    const rectRef = useRef({ left: 0, top: 0, width: 0, height: 0 });

    // 📏 Cache rect size to avoid getBoundingClientRect reflows during drawing
    useEffect(() => {
        if (!containerRef.current) return;
        const updateRect = () => {
            if (containerRef.current) {
                rectRef.current = containerRef.current.getBoundingClientRect();
            }
        };
        updateRect();
        const observer = new ResizeObserver(updateRect);
        observer.observe(containerRef.current);
        window.addEventListener('scroll', updateRect, true);
        return () => {
            observer.disconnect();
            window.removeEventListener('scroll', updateRect, true);
        };
    }, []);

    useEffect(() => {
        panRef.current = pan;
        scaleRef.current = scale;
        // Notify parent of view change (debounced or throttled appropriately by parent or here)
        if (onViewChange) {
            const timer = setTimeout(() => {
                onViewChange({ scale, pan });
            }, 500); // 500ms debounce
            return () => clearTimeout(timer);
        }
    }, [pan, scale, onViewChange]);

    // 🌍 Coordinate Transformation Helpers (Stable Reference)
    const screenToWorld = useCallback((screenX, screenY) => {
        const rect = rectRef.current;
        const containerX = screenX - rect.left;
        const containerY = screenY - rect.top;
        return {
            x: (containerX - panRef.current.x) / scaleRef.current,
            y: (containerY - panRef.current.y) / scaleRef.current
        };
    }, []);

    const worldToScreen = useCallback((worldX, worldY) => {
        const rect = rectRef.current;
        return {
            x: worldX * scaleRef.current + panRef.current.x + rect.left,
            y: worldY * scaleRef.current + panRef.current.y + rect.top
        };
    }, []);

    // Stable context value
    const canvasContextValue = useMemo(() => ({
        screenToWorld,
        worldToScreen,
        getScale: () => scaleRef.current,
        getPan: () => panRef.current,
        scale,
        pan,
        containerRef,
        rectRef
    }), [screenToWorld, worldToScreen, scale, pan]);

    // Expose helpers to parent via Ref
    React.useImperativeHandle(ref, () => ({
        screenToWorld,
        worldToScreen,
        getScale: () => scaleRef.current,
        getPan: () => panRef.current
    }));

    // ⌨️ Keyboard Listeners for Space Pan
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space' && !e.repeat && !isSpacePressed.current) {
                isSpacePressed.current = true;
                if (containerRef.current) containerRef.current.style.cursor = 'grab';
            }
        };
        const handleKeyUp = (e) => {
            if (e.code === 'Space') {
                isSpacePressed.current = false;
                if (containerRef.current) containerRef.current.style.cursor = 'default';
                if (isPanning.current) {
                    isPanning.current = false; // Stop panning if space released
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // 🔬 Helper to Clamp Pan
    const clampPan = useCallback((x, y, s) => {
        // Simple bounds: -2500 to +2500 (approx 5000px width ~ 4-5 pages)
        const limit = 2500 * s;
        return {
            x: Math.min(limit, Math.max(-limit, x)),
            y: Math.min(limit, Math.max(-limit, y))
        };
    }, []);

    // 🖱️ Mouse Wheel -> ZOOM or PAN
    const handleWheel = useCallback((e) => {
        const currentScale = scaleRef.current;
        const currentPan = panRef.current;

        if (e.ctrlKey || e.metaKey) {
            // ZOOM
            e.preventDefault();
            const zoomIntensity = 0.1;
            const direction = e.deltaY > 0 ? -1 : 1;
            const factor = direction * zoomIntensity;

            let newScale = currentScale + factor;
            newScale = Math.min(Math.max(0.1, newScale), 5); // 0.1x to 5x

            const rect = containerRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const worldMouseX = (mouseX - currentPan.x) / currentScale;
            const worldMouseY = (mouseY - currentPan.y) / currentScale;

            let newPanX = mouseX - worldMouseX * newScale;
            let newPanY = mouseY - worldMouseY * newScale;

            // Clamp both
            const clamped = clampPan(newPanX, newPanY, newScale);

            setScale(newScale);
            setPan(clamped);
        } else {
            // PAN
            e.preventDefault();
            const newX = currentPan.x - e.deltaX;
            const newY = currentPan.y - e.deltaY;
            setPan(clampPan(newX, newY, currentScale));
        }
    }, [clampPan]); // Only depends on clampPan which is also stable if defined outside or wrapped in useCallback

    // 🖱️ Mouse Down -> Start Pan
    const handleMouseDown = (e) => {
        // Panning Logic:
        // 1. Middle Click OR Space+Left = ALWAYS ALLOWED
        // 2. Alt+Left = ALWAYS ALLOWED
        // 3. Left Click on Background = ONLY IF panningEnabled is TRUE (Select Tool)

        if (e.defaultPrevented) return;

        const isLeftClick = e.button === 0;
        const isMiddleClick = e.button === 1;
        const isSpacePan = isSpacePressed.current;

        const shouldPan = isMiddleClick ||
            (isLeftClick && (e.altKey || isSpacePan || panningEnabled));

        if (shouldPan) {
            e.preventDefault();
            isPanning.current = true;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            document.body.style.cursor = 'grabbing';
            if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
        }
    };

    // 📱 Touch Handlers
    const lastTouchDistance = useRef(0);
    const lastTouchCenter = useRef({ x: 0, y: 0 });

    const handleTouchStart = (e) => {
        if (e.defaultPrevented) return;

        if (e.touches.length === 1 && panningEnabled) {
            isPanning.current = true;
            lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            isPanning.current = false; // Stop panning to zoom
            isZooming.current = true; // Two fingers touch started HERE
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastTouchDistance.current = Math.sqrt(dx * dx + dy * dy);
            lastTouchCenter.current = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2
            };
        }
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isPanning.current) return;
            e.preventDefault();

            const clientX = e.clientX ?? e.touches?.[0]?.clientX;
            const clientY = e.clientY ?? e.touches?.[0]?.clientY;

            if (clientX === undefined) return;

            const dx = clientX - lastMousePos.current.x;
            const dy = clientY - lastMousePos.current.y;

            setPan(prev => clampPan(prev.x + dx, prev.y + dy, scaleRef.current));
            lastMousePos.current = { x: clientX, y: clientY };
        };

        const handleTouchMove = (e) => {
            if (e.touches.length === 1 && isPanning.current) {
                handleMouseMove(e);
            } else if (e.touches.length === 2) {
                if (!isZooming.current) return; // Ignore if gesture started outside
                e.preventDefault();
                const currentScale = scaleRef.current;
                const currentPan = panRef.current;

                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const center = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                };

                const factor = distance / lastTouchDistance.current;
                let newScale = currentScale * factor;
                newScale = Math.min(Math.max(0.1, newScale), 5);

                const rect = containerRef.current.getBoundingClientRect();
                const mouseX = center.x - rect.left;
                const mouseY = center.y - rect.top;

                const worldMouseX = (mouseX - currentPan.x) / currentScale;
                const worldMouseY = (mouseY - currentPan.y) / currentScale;

                const newPanX = mouseX - worldMouseX * newScale;
                const newPanY = mouseY - worldMouseY * newScale;

                setPan(clampPan(newPanX, newPanY, newScale));
                setScale(newScale);

                lastTouchDistance.current = distance;
                lastTouchCenter.current = center;
            }
        };

        const handleUp = () => {
            isZooming.current = false; // Reset zooming state
            if (isPanning.current) {
                isPanning.current = false;
                document.body.style.cursor = 'default';
                if (containerRef.current) containerRef.current.style.cursor = isSpacePressed.current ? 'grab' : 'default';
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleUp);
        };
    }, [clampPan]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e) => {
            handleWheel(e);
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', onWheel);
        };
    }, [handleWheel]);

    // ➕➖ Zoom Buttons Handlers
    const zoomIn = () => {
        setScale(prev => Math.min(prev + 0.2, 5));
    };
    const zoomOut = () => {
        setScale(prev => Math.max(prev - 0.2, 0.1));
    };

    return (
        <CanvasContext.Provider value={canvasContextValue}>
            <div
                ref={containerRef}
                className={className}
                style={{
                    ...style,
                    overflow: 'hidden',
                    position: 'relative',
                    cursor: 'default',
                    touchAction: 'none',
                    backgroundColor: '#f8f9fa',
                    backgroundImage: 'radial-gradient(circle, #d1d1d1 1.2px, transparent 0)',
                    backgroundSize: `${40 * scale}px ${40 * scale}px`,
                    backgroundPosition: `${pan.x}px ${pan.y}px`,
                    willChange: 'background-position, background-size'
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
            >
                {/* The World Container */}
                <div
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                        transformOrigin: '0 0',
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        willChange: 'transform'
                    }}
                >
                    {children}
                </div>

                {/* HUD / Indicators / Controls */}
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    right: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    zIndex: 1000
                }}>
                    <button onClick={zoomIn} style={btnStyle} title="Zoom In (+)">+</button>
                    <button onClick={zoomOut} style={btnStyle} title="Zoom Out (-)">-</button>
                    <div style={{
                        background: 'rgba(0,0,0,0.6)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        textAlign: 'center',
                        pointerEvents: 'none'
                    }}>
                        {(scale * 100).toFixed(0)}%
                    </div>
                </div>
            </div>
        </CanvasContext.Provider>
    );
});

const btnStyle = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: 'none',
    background: 'white',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    cursor: 'pointer',
    fontSize: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    color: '#333'
};

export default InfiniteCanvas;
