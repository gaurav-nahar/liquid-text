import React, { useRef, useState, useEffect, useCallback, createContext, useContext, useMemo } from 'react';
import { usePinch } from '@use-gesture/react';

const PAGE_COLORS = ['#e8f3ff', '#eef9ec'];
const INITIAL_PAGE = { id: 'ws-1', x: 0, y: 0, width: 1100, height: 1500, color: PAGE_COLORS[0] };

// Stable context: screenToWorld, worldToScreen, getScale, getPan, containerRef, rectRef, getPages
// This NEVER changes after mount → components using it don't re-render on pan/zoom
const CanvasStableContext = createContext({
    screenToWorld: (x, y) => ({ x, y }),
    worldToScreen: (x, y) => ({ x, y }),
    getScale: () => 1,
    getPan: () => ({ x: 0, y: 0 }),
    getPages: () => [],
    containerRef: { current: null },
    rectRef: { current: { left: 0, top: 0 } }
});

// View context: scale, pan — changes every frame while panning/zooming
// Only subscribe to this if you actually need reactive scale/pan for rendering
const CanvasViewContext = createContext({ scale: 1, pan: { x: 0, y: 0 } });

// Full context: backward-compatible hook (re-renders on pan/zoom — use sparingly)
export const useCanvas = () => ({
    ...useContext(CanvasStableContext),
    ...useContext(CanvasViewContext),
});

// Stable-only hook: does NOT re-render on pan/zoom — use in drag/drop, text boxes, etc.
export const useCanvasStable = () => useContext(CanvasStableContext);

const InfiniteCanvas = React.forwardRef(({ children, className, style, initialScale = 1, initialPan = { x: 0, y: 0 }, onViewChange, panningEnabled = true }, ref) => {
    const [pan, setPan] = useState(initialPan);
    const [scale, setScale] = useState(initialScale);
    const [pages, setPages] = useState(() => {
        try {
            const saved = localStorage.getItem('airpdf_workspace_pages');
            if (saved) {
                const parsed = JSON.parse(saved);
                return Array.isArray(parsed) && parsed.length > 0 ? parsed : [INITIAL_PAGE];
            }
            return [INITIAL_PAGE];
        } catch { return [INITIAL_PAGE]; }
    });

    useEffect(() => {
        localStorage.setItem('airpdf_workspace_pages', JSON.stringify(pages));
    }, [pages]);

    // Listen to manual or cross-tab storage events to sync pages from the loader
    useEffect(() => {
        const handleStorage = () => {
            try {
                const saved = localStorage.getItem('airpdf_workspace_pages');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setPages(parsed);
                    }
                }
            } catch (e) {
                console.error("Failed to parse workspace pages from storage", e);
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);
    const containerRef = useRef(null);
    const isPanning = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const isSpacePressed = useRef(false);
    const isPinching = useRef(false); // true while @use-gesture pinch is active

    // Refs for stable access in callbacks without re-creating functions
    const panRef = useRef(pan);
    const scaleRef = useRef(scale);
    const rectRef = useRef({ left: 0, top: 0, width: 0, height: 0 });
    const pagesRef = useRef(pages);

    useEffect(() => {
        pagesRef.current = pages;
    }, [pages]);

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

    // 📐 Helper to Calculate Minimum Zoom Scale
    const getMinScale = useCallback(() => {
        const pagesList = pagesRef.current || [];
        if (pagesList.length === 0) return 0.1;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pagesList.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x + p.width > maxX) maxX = p.x + p.width;
            if (p.y + p.height > maxY) maxY = p.y + p.height;
        });

        const contentW = maxX - minX;
        const contentH = maxY - minY;

        const vw = rectRef.current?.width || window.innerWidth || 1000;
        const vh = rectRef.current?.height || window.innerHeight || 800;

        // Ensure 100px fixed margin in screen coordinates (50px each side)
        const targetW = vw - 100;
        const targetH = vh - 100;

        const scaleX = targetW / contentW;
        const scaleY = targetH / contentH;

        // The minimum scale is the smaller of the two to ensure both fit
        const minScale = Math.min(scaleX, scaleY);

        return Math.min(Math.max(0.01, minScale), 1.0); // Don't allow less than 1% or greater than 100%
    }, []);

    // 🔬 Helper to Clamp Pan to Pages
    const clampPan = useCallback((x, y, s) => {
        const pagesList = pagesRef.current || [];
        if (pagesList.length === 0) return { x, y };

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        pagesList.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x + p.width > maxX) maxX = p.x + p.width;
            if (p.y + p.height > maxY) maxY = p.y + p.height;
        });

        const vw = rectRef.current?.width || window.innerWidth || 1000;
        const vh = rectRef.current?.height || window.innerHeight || 800;
        const margin = 50;

        const contentScreenMinX = minX * s;
        const contentScreenMaxX = maxX * s;
        const contentScreenMinY = minY * s;
        const contentScreenMaxY = maxY * s;

        const contentWidth = contentScreenMaxX - contentScreenMinX;
        const contentHeight = contentScreenMaxY - contentScreenMinY;

        let resX = x;
        let resY = y;

        if (contentWidth <= vw - margin * 2) {
            resX = (vw - contentWidth) / 2 - contentScreenMinX;
        } else {
            const maxPanX = margin - contentScreenMinX;
            const minPanX = vw - margin - contentScreenMaxX;
            resX = Math.min(maxPanX, Math.max(minPanX, x));
        }

        if (contentHeight <= vh - margin * 2) {
            resY = (vh - contentHeight) / 2 - contentScreenMinY;
        } else {
            const maxPanY = margin - contentScreenMinY;
            const minPanY = vh - margin - contentScreenMaxY;
            resY = Math.min(maxPanY, Math.max(minPanY, y));
        }

        return { x: resX, y: resY };
    }, []);

    // Stable context value — deps are empty-dep callbacks, so this is created once
    const stableContextValue = useMemo(() => ({
        screenToWorld,
        worldToScreen,
        getScale: () => scaleRef.current,
        getPan: () => panRef.current,
        getPages: () => pagesRef.current,
        containerRef,
        rectRef
    }), [screenToWorld, worldToScreen]);

    // View context value — changes on every pan/zoom, only DrawingCanvas subscribes to this
    const viewContextValue = useMemo(() => ({ scale, pan }), [scale, pan]);

    // Expose helpers to parent via Ref
    React.useImperativeHandle(ref, () => ({
        screenToWorld,
        worldToScreen,
        getScale: () => scaleRef.current,
        getPan: () => panRef.current,
        getPages: () => pagesRef.current
    }), [screenToWorld, worldToScreen]);

    // 👌 Pinch-to-zoom via @use-gesture/react — replaces manual activePointers Map
    usePinch(
        ({ origin, offset: [pinchScale], first, last, event, memo }) => {
            event?.preventDefault?.();
            if (first) {
                isPinching.current = true;
                isPanning.current = false;
                memo = { initialScale: scaleRef.current, initialPan: panRef.current };
            }
            if (!memo) return;

            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return memo;

            const ox = origin[0] - rect.left;
            const oy = origin[1] - rect.top;
            const wx = (ox - memo.initialPan.x) / memo.initialScale;
            const wy = (oy - memo.initialPan.y) / memo.initialScale;

            const newScale = Math.min(Math.max(getMinScale(), pinchScale * memo.initialScale), 5);
            const newPan = clampPan(ox - wx * newScale, oy - wy * newScale, newScale);

            setScale(newScale);
            setPan(newPan);

            if (last) isPinching.current = false;
            return memo;
        },
        { target: containerRef, eventOptions: { passive: false }, pinchOnWheel: false }
    );

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
            newScale = Math.min(Math.max(getMinScale(), newScale), 5); // minScale to 5x

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
    }, [clampPan, getMinScale]);

    // 🖱️✏️📱 Unified Pointer Down (mouse + touch + pen/stylus)
    // Pinch zoom is handled by usePinch above; this only deals with pan.
    const handlePointerDown = (e) => {
        if (e.defaultPrevented) return;
        if (isPinching.current) return; // let usePinch own multi-touch

        const isMiddleClick = e.button === 1;
        const isActionButton = e.button === 0 || e.pointerType === 'pen' || e.pointerType === 'touch';
        const shouldPan = isMiddleClick || (isActionButton && (e.altKey || isSpacePressed.current || panningEnabled));

        if (shouldPan) {
            e.preventDefault();
            isPanning.current = true;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            document.body.style.cursor = 'grabbing';
            if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
            e.currentTarget.setPointerCapture(e.pointerId);
        }
    };

    useEffect(() => {
        const handlePointerMove = (e) => {
            if (!isPanning.current || isPinching.current) return;
            e.preventDefault();
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setPan(prev => clampPan(prev.x + dx, prev.y + dy, scaleRef.current));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        };

        const handlePointerUp = () => {
            if (isPanning.current) {
                isPanning.current = false;
                document.body.style.cursor = 'default';
                if (containerRef.current) {
                    containerRef.current.style.cursor = isSpacePressed.current ? 'grab' : 'default';
                }
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
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
    const doZoom = (delta) => {
        const currentScale = scaleRef.current;
        let newScale = currentScale + delta;
        newScale = Math.min(Math.max(getMinScale(), newScale), 5);
        if (newScale === currentScale) return;

        const rect = rectRef.current;
        const originX = rect.width ? rect.width / 2 : window.innerWidth / 2;
        const originY = rect.height ? rect.height / 2 : window.innerHeight / 2;

        const newPan = {
            x: originX - (originX - panRef.current.x) * (newScale / currentScale),
            y: originY - (originY - panRef.current.y) * (newScale / currentScale)
        };

        setPan(clampPan(newPan.x, newPan.y, newScale));
        setScale(newScale);
    };

    const zoomIn = () => doZoom(0.2);
    const zoomOut = () => doZoom(-0.2);

    return (
        <CanvasStableContext.Provider value={stableContextValue}>
            <CanvasViewContext.Provider value={viewContextValue}>
                <div
                    ref={containerRef}
                    className={className}
                    style={{
                        ...style,
                        overflow: 'hidden',
                        backgroundColor: '#F4F5F7',
                        backgroundImage: 'radial-gradient(circle, #CBD5E1 1.2px, transparent 0)',
                        backgroundSize: `${40 * scale}px ${40 * scale}px`,
                        backgroundPosition: `${pan.x}px ${pan.y}px`,
                        willChange: 'background-position, background-size, transform'
                    }}
                    onPointerDown={handlePointerDown}
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
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                pointerEvents: 'none',
                                zIndex: 0
                            }}
                        >
                            {pages.map((section) => (
                                <div
                                    key={`bg-${section.id}`}
                                    style={{
                                        position: 'absolute',
                                        left: section.x,
                                        top: section.y,
                                        width: section.width,
                                        height: section.height,
                                        background: section.color || PAGE_COLORS[0],
                                        border: '1px solid rgba(15, 23, 42, 0.08)',
                                        borderRadius: '4px',
                                        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                                        overflow: 'hidden'
                                    }}
                                >
                                    <div
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            backgroundImage: 'linear-gradient(rgba(15,23,42,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.03) 1px, transparent 1px)',
                                            backgroundSize: '48px 48px',
                                            opacity: 0.5,
                                            pointerEvents: 'none'
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                        {children}
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                pointerEvents: 'none',
                                zIndex: 50
                            }}
                        >
                            {pages.map((section) => {
                                const hasRight = pages.some(p => Math.abs(p.x - (section.x + 1150)) < 10 && Math.abs(p.y - section.y) < 10);
                                const hasLeft = pages.some(p => Math.abs(p.x - (section.x - 1150)) < 10 && Math.abs(p.y - section.y) < 10);
                                const hasBottom = pages.some(p => Math.abs(p.x - section.x) < 10 && Math.abs(p.y - (section.y + 1550)) < 10);
                                const hasTop = pages.some(p => Math.abs(p.x - section.x) < 10 && Math.abs(p.y - (section.y - 1550)) < 10);

                                const addPage = (newX, newY) => {
                                    setPages(prev => {
                                        const nextColor = PAGE_COLORS[prev.length % PAGE_COLORS.length];
                                        return [...prev, { id: `ws-${Date.now()}-${Math.random()}`, x: newX, y: newY, width: 1100, height: 1500, color: nextColor }];
                                    });
                                };

                                const deletePage = (idToRemove) => {
                                    if (pages.length <= 1) return;
                                    if (window.confirm("Are you sure you want to remove this page? Any drawings or notes on it will be lost.")) {
                                        setPages(prev => prev.filter(p => p.id !== idToRemove));
                                    }
                                };

                                const addBtnStyle = {
                                    position: 'absolute', width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#3b82f6',
                                    color: 'white', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'all', zIndex: 10
                                };

                                return (
                                    <React.Fragment key={`ui-${section.id}`}>
                                        {pages.length > 1 && (
                                            <button
                                                onPointerDown={(e) => { e.stopPropagation(); deletePage(section.id); }}
                                                style={{
                                                    position: 'absolute', top: section.y + 12, left: section.x + section.width - 44, width: 32, height: 32,
                                                    borderRadius: '50%', border: 'none', background: 'rgba(239, 68, 68, 0.1)',
                                                    color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    zIndex: 20, transition: 'background 0.2s', fontSize: '18px', pointerEvents: 'auto'
                                                }}
                                                title="Remove page"
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                                            >
                                                ×
                                            </button>
                                        )}

                                        {/* 4-way Add Page Buttons */}
                                        {!hasRight && (
                                            <button onPointerDown={(e) => { e.stopPropagation(); addPage(section.x + 1150, section.y); }}
                                                style={{ ...addBtnStyle, left: section.x + section.width + 7, top: section.y + section.height / 2 - 18 }} title="Add page right">
                                                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path></svg>
                                            </button>
                                        )}
                                        {!hasLeft && (
                                            <button onPointerDown={(e) => { e.stopPropagation(); addPage(section.x - 1150, section.y); }}
                                                style={{ ...addBtnStyle, left: section.x - 43, top: section.y + section.height / 2 - 18 }} title="Add page left">
                                                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path></svg>
                                            </button>
                                        )}
                                        {!hasBottom && (
                                            <button onPointerDown={(e) => { e.stopPropagation(); addPage(section.x, section.y + 1550); }}
                                                style={{ ...addBtnStyle, left: section.x + section.width / 2 - 18, top: section.y + section.height + 7 }} title="Add page below">
                                                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path></svg>
                                            </button>
                                        )}
                                        {!hasTop && (
                                            <button onPointerDown={(e) => { e.stopPropagation(); addPage(section.x, section.y - 1550); }}
                                                style={{ ...addBtnStyle, left: section.x + section.width / 2 - 18, top: section.y - 43 }} title="Add page above">
                                                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path></svg>
                                            </button>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>

                    {/* HUD / Indicators / Controls */}
                    <div style={{
                        position: 'absolute',
                        bottom: 70,
                        right: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        zIndex: 1000
                    }}>
                        <button
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                if (pages.length > 0 && containerRef.current) {
                                    const firstPage = pages[0];
                                    const rect = containerRef.current.getBoundingClientRect();
                                    const pageCenterX = firstPage.x + firstPage.width / 2;
                                    const pageCenterY = firstPage.y + firstPage.height / 2;
                                    const viewCenterX = rect.width / 2;
                                    const viewCenterY = rect.height / 2;

                                    const targetScale = Math.max(0.1, Math.min(
                                        (rect.width - 100) / firstPage.width,
                                        (rect.height - 100) / firstPage.height,
                                        1
                                    ));

                                    setPan({
                                        x: viewCenterX - pageCenterX * targetScale,
                                        y: viewCenterY - pageCenterY * targetScale
                                    });
                                    setScale(targetScale);
                                } else {
                                    setPan({ x: 0, y: 0 });
                                    setScale(1);
                                }
                            }}
                            style={{ ...btnStyle, padding: 0 }}
                            title="Reset View"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                                <polyline points="9 22 9 12 15 12 15 22"></polyline>
                            </svg>
                        </button>
                        <button onPointerDown={(e) => { e.stopPropagation(); zoomIn(); }} style={btnStyle} title="Zoom In (+)">+</button>
                        <button onPointerDown={(e) => { e.stopPropagation(); zoomOut(); }} style={btnStyle} title="Zoom Out (-)">-</button>
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
            </CanvasViewContext.Provider>
        </CanvasStableContext.Provider>
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
