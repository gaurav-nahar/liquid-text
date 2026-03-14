
import { useCallback, useEffect } from 'react';
import { useApp } from "../../context/AppContext";

export const usePdfText = (containerRef, getCurrentPageNum, contentRef = null) => {
    const {
        pdfAnnotations,
        setPdfAnnotations,
        handleDeletePdfText: onDeletePdfText,
        setIsDirty,
        tool,
        TOOL_MODES
    } = useApp();

    // 🎨 renderPdfAnnotation: Helper function to draw a text annotation on a page wrapper
    const renderPdfAnnotation = useCallback((wrapper, annot) => {
        const id = `pdf-annot-${annot.id}`;
        let div = wrapper.querySelector(`[data-annot-id="${id}"]`);

        if (!div) {
            div = document.createElement("div");
            div.dataset.annotId = id;
            div.style.position = "absolute";
            div.style.zIndex = "1000"; // 🚀 HIGH Z-INDEX to stay on top
            div.style.padding = "4px 8px";
            div.style.borderRadius = "4px";
            div.style.transform = "translate(-50%, -50%)"; // Center it
            wrapper.appendChild(div);
        }

        // Helper to update position visually without re-rendering component
        const updatePosition = (left, top) => {
            div.style.left = left;
            div.style.top = top;
        };

        // Initial Position
        div.style.left = `${annot.xPct * 100}%`;
        div.style.top = `${annot.yPct * 100}%`;

        // 🎨 Helper to update state and dirty flag
        const updateAnnotations = (updater) => {
            if (typeof updater === 'function') {
                setPdfAnnotations(updater);
            } else {
                setPdfAnnotations(updater);
            }
            if (setIsDirty) setIsDirty(true);
        };

        // 🎨 Common Styles (Applied always)
        div.style.background = "white"; // White background always
        div.style.color = "#333";
        div.style.fontSize = "14px";
        div.style.fontWeight = "500";
        div.style.userSelect = "none";
        div.style.pointerEvents = "auto";
        div.style.border = "1px solid #ccc"; // Default border
        div.style.boxShadow = "none";
        div.style.padding = "2px 6px";
        div.style.touchAction = annot.isEditing ? "auto" : "none"; // 🚀 Prevent scroll while dragging

        // Set cursor based on mode
        if (!annot.isEditing) {
            div.style.cursor = "grab";
        } else {
            div.style.cursor = "text";
            div.style.border = "1px solid #007aff"; // Active border
            div.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        }

        // ️ Common Drag Handler (Mouse & Touch)
        const handleStart = (clientX, clientY, isTouch) => {
            // 🚀 Optimization: Cache rect to avoid thrashing during move
            const wrapperRect = wrapper.getBoundingClientRect();
            const startX = clientX;
            const startY = clientY;
            const initialXPct = annot.xPct;
            const initialYPct = annot.yPct;

            let hasMoved = false;
            div.style.cursor = "grabbing";

            // Add visual feedback for touch drag immediately
            if (isTouch) {
                div.style.transform = "translate(-50%, -50%) scale(1.05)";
                div.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
                div.style.zIndex = "100";
            }

            const onMove = (moveX, moveY) => {
                const dx = moveX - startX;
                const dy = moveY - startY;

                // Threshold to detect drag vs click (slightly higher for touch)
                const threshold = isTouch ? 5 : 3;
                if (!hasMoved && (Math.abs(dx) > threshold || Math.abs(dy) > threshold)) {
                    hasMoved = true;
                    div.dataset.dragging = "true";
                }

                if (hasMoved) {
                    const curXPct = initialXPct + (dx / wrapperRect.width);
                    const curYPct = initialYPct + (dy / wrapperRect.height);

                    // Constraints: Keep within page bounds
                    const clampedX = Math.max(0, Math.min(1, curXPct));
                    const clampedY = Math.max(0, Math.min(1, curYPct));

                    updatePosition(`${clampedX * 100}%`, `${clampedY * 100}%`);
                }
            };

            const onEnd = (endX, endY) => {
                // Reset Styles
                div.style.cursor = annot.isEditing ? "text" : "grab";
                if (isTouch) {
                    div.style.transform = "translate(-50%, -50%)";
                    div.style.boxShadow = annot.isEditing ? "0 2px 4px rgba(0,0,0,0.1)" : "none";
                    div.style.zIndex = "1000";
                }

                if (hasMoved) {
                    // 💾 Commit New Position to State Only on End
                    const dx = endX - startX;
                    const dy = endY - startY;
                    const finalXPct = Math.max(0, Math.min(1, initialXPct + (dx / wrapperRect.width)));
                    const finalYPct = Math.max(0, Math.min(1, initialYPct + (dy / wrapperRect.height)));

                    updateAnnotations(prev => prev.map(a =>
                        a.id === annot.id ? { ...a, xPct: finalXPct, yPct: finalYPct } : a
                    ));

                    // Cleanup dragging flag after a short delay
                    setTimeout(() => delete div.dataset.dragging, 50);
                } else {
                    // 🖱️ Handle Tap for Touch (Wait, did we prevent default?)
                    // If we prevented default on touchstart, click won't fire.
                    // So we must manually trigger edit here if it was a tap.
                    if (isTouch) {
                        updateAnnotations(prev => prev.map(a =>
                            a.id === annot.id ? { ...a, isEditing: true } : a
                        ));
                    }
                }
            };

            return { onMove, onEnd };
        };

        // Attach Mouse Events
        div.onmousedown = (e) => {
            // Allow interaction with inputs/buttons
            if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;

            e.preventDefault(); // Prevent text selection
            e.stopPropagation();

            const { onMove, onEnd } = handleStart(e.clientX, e.clientY, false);

            const onMouseMove = (ev) => {
                ev.preventDefault(); // Stop selection
                onMove(ev.clientX, ev.clientY);
            };
            const onMouseUp = (ev) => {
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
                onEnd(ev.clientX, ev.clientY);
            };

            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        };

        // Attach Touch Events (Visual Drag Mode)
        const touchHandler = (e) => {
            // Allow buttons/inputs to work naturally
            if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") {
                e.stopPropagation();
                return;
            }

            if (e.touches.length !== 1) return;

            // 🛑 CRITICAL: Stop propagation so other layers don't see this touch
            e.stopPropagation();
            e.stopImmediatePropagation();

            // 🛑 Block touch interaction if in SELECT mode
            if (tool !== TOOL_MODES.SELECT) {
                return;
            }

            const touch = e.touches[0];
            const startX = touch.clientX;
            const startY = touch.clientY;

            let isDragging = false;
            let longPressTimer = null;
            let touchMovedDuringHold = false;

            // 🚀 Immediate Drag in ADD_TO_TEXT mode
            if (tool === TOOL_MODES.ADD_TO_TEXT) {
                isDragging = true;
                if (e.cancelable) e.preventDefault(); // 🚀 Prevent browser scroll
                div.style.transform = "translate(-50%, -50%) scale(1.1)";
                div.style.zIndex = "1001"; // Above all during drag
                div.style.boxShadow = "0 8px 16px rgba(0,0,0,0.3)";
                div.style.border = "2px solid #007aff";
                div.style.cursor = "grabbing";
            } else {
                // Standard Long-press for other modes (if any)
                longPressTimer = setTimeout(() => {
                    isDragging = true;
                    if (navigator.vibrate) navigator.vibrate(50);
                    div.style.transform = "translate(-50%, -50%) scale(1.1)";
                    div.style.zIndex = "1001";
                    div.style.boxShadow = "0 8px 16px rgba(0,0,0,0.3)";
                    div.style.border = "2px solid #007aff";
                    div.style.cursor = "grabbing";
                }, 500);
            }

            const onTouchMove = (ev) => {
                const t = ev.touches[0];
                const dx = t.clientX - startX;
                const dy = t.clientY - startY;

                if (!isDragging) {
                    // Timer running. Browser handling scroll?
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                        // User moved significant amount before timer.
                        // It's a Scroll/Swipe. Cancel timer.
                        clearTimeout(longPressTimer);
                        touchMovedDuringHold = true;
                    }
                } else {
                    // Drag Active! Block Scroll.
                    if (ev.cancelable) ev.preventDefault();
                    ev.stopPropagation();

                    const wrapperRect = wrapper.getBoundingClientRect();
                    const curXPct = annot.xPct + (dx / wrapperRect.width);
                    const curYPct = annot.yPct + (dy / wrapperRect.height);

                    const clampedX = Math.max(0, Math.min(1, curXPct));
                    const clampedY = Math.max(0, Math.min(1, curYPct));

                    div.style.left = `${clampedX * 100}%`;
                    div.style.top = `${clampedY * 100}%`;
                }
            };

            const onTouchEnd = (ev) => {
                clearTimeout(longPressTimer);
                window.removeEventListener("touchmove", onTouchMove);
                window.removeEventListener("touchend", onTouchEnd);

                // Cleanup Styles
                div.style.transform = "translate(-50%, -50%)";
                div.style.zIndex = "1000";
                div.style.cursor = "pointer";
                div.style.boxShadow = annot.isEditing ? "0 2px 4px rgba(0,0,0,0.1)" : "none";
                if (!annot.isEditing) div.style.border = "1px solid #ccc";

                if (isDragging) {
                    // Commit Drag
                    const t = ev.changedTouches[0];
                    const dx = t.clientX - startX;
                    const dy = t.clientY - startY;
                    const wrapperRect = wrapper.getBoundingClientRect();

                    const finalXPct = Math.max(0, Math.min(1, annot.xPct + (dx / wrapperRect.width)));
                    const finalYPct = Math.max(0, Math.min(1, annot.yPct + (dy / wrapperRect.height)));

                    updateAnnotations(prev => prev.map(a =>
                        a.id === annot.id ? { ...a, xPct: finalXPct, yPct: finalYPct } : a
                    ));

                    // Prevent Click trigger
                    ev.preventDefault();
                    ev.stopPropagation();
                } else {
                    // Tap -> Edit
                    // ONLY if not moved significantly (not a completed scroll)
                    if (!touchMovedDuringHold && !annot.isEditing) {
                        updateAnnotations(prev => prev.map(a =>
                            a.id === annot.id ? { ...a, isEditing: true } : a
                        ));
                    }
                }
            };

            window.addEventListener("touchmove", onTouchMove, { passive: false });
            window.addEventListener("touchend", onTouchEnd);
        };

        // Remove old to avoid duplicates
        div.removeEventListener("touchstart", div._lastTouchHandler);
        div.addEventListener("touchstart", touchHandler, { passive: false });
        div._lastTouchHandler = touchHandler;

        // 📝 Render Content (Edit vs View)
        if (annot.isEditing) {
            div.innerHTML = "";
            const input = document.createElement("input");
            input.type = "text";
            input.value = annot.text;
            // Input Styles
            input.style.border = "none";
            input.style.outline = "none";
            input.style.fontSize = "14px";
            input.style.padding = "2px 4px";
            input.style.background = "transparent";
            input.style.width = "100%";
            input.style.minWidth = "150px";
            input.style.color = "#333";

            const commit = () => {
                const newText = input.value;
                updateAnnotations(prev => prev.map(a =>
                    a.id === annot.id ? { ...a, text: newText, isEditing: false } : a
                ));
            };

            input.onblur = commit;
            input.onkeydown = (e) => {
                if (e.key === "Enter") commit();
            };

            div.appendChild(input);
            setTimeout(() => input.focus(), 10);
        } else {
            div.innerHTML = "";

            if (annot.text.trim()) {
                div.textContent = annot.text;

                // 🖱️ Click to Edit (Mouse only - touch handled in onEnd)
                div.onclick = (e) => {
                    if (div.dataset.dragging === "true") return;
                    // Only edit if clicking the div itself
                    if (e.target.tagName !== "BUTTON") {
                        updateAnnotations(prev => prev.map(a =>
                            a.id === annot.id ? { ...a, isEditing: true } : a
                        ));
                    }
                };

                // 🗑️ Delete Button
                const delBtn = document.createElement("button");
                delBtn.innerHTML = "&times;";
                delBtn.style.position = "absolute";
                delBtn.style.right = "-12px";
                delBtn.style.top = "-12px";
                delBtn.style.width = "20px";
                delBtn.style.height = "20px";
                delBtn.style.borderRadius = "50%";
                delBtn.style.background = "#ff3b30";
                delBtn.style.color = "white";
                delBtn.style.border = "2px solid white";
                delBtn.style.cursor = "pointer";
                delBtn.style.display = "none";
                delBtn.style.fontSize = "14px";
                delBtn.style.lineHeight = "1";
                delBtn.style.padding = "0";
                delBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
                delBtn.style.zIndex = "10"; // Ensure above div

                // 🛑 Critical: Stop propagation on delete click
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (onDeletePdfText) onDeletePdfText(annot.id);
                };

                // Allow touching delete button without triggering drag
                delBtn.ontouchstart = (e) => {
                    e.stopPropagation();
                };

                div.appendChild(delBtn);

                div.onmouseenter = () => {
                    div.style.borderColor = "#007aff";
                    delBtn.style.display = "flex";
                    delBtn.style.alignItems = "center";
                    delBtn.style.justifyContent = "center";
                };
                div.onmouseleave = () => {
                    div.style.borderColor = "#ccc";
                    delBtn.style.display = "none";
                };
            } else {
                div.remove();
                updateAnnotations(prev => prev.filter(a => a.id !== annot.id));
            }
        }
    }, [setPdfAnnotations, onDeletePdfText, setIsDirty, tool, TOOL_MODES]);

    // 🔄 Update DOM when annotations change
    useEffect(() => {
        const container = containerRef.current;
        const contentContainer = contentRef ? contentRef.current : container;
        if (!container || !contentContainer) return;

        // Cleanup removed annotations
        const allRenderedAnnots = contentContainer.querySelectorAll('[data-annot-id^="pdf-annot-"]');
        allRenderedAnnots.forEach(el => {
            const id = el.dataset.annotId.replace('pdf-annot-', '');
            if (!pdfAnnotations.some(a => String(a.id) === id)) {
                el.remove();
            }
        });

        pdfAnnotations.forEach(a => {
            const wrapper = contentContainer.querySelector(`.pdf-page-wrapper[data-page-number="${a.pageNum}"]`);
            if (wrapper && wrapper.dataset.loaded === "true") {
                renderPdfAnnotation(wrapper, a);
            }
        });
    }, [pdfAnnotations, renderPdfAnnotation, containerRef, contentRef]);

    const addPdfText = useCallback(() => {
        const pageNum = getCurrentPageNum ? getCurrentPageNum() : 1;
        const newAnnot = {
            id: `pdf-annot-${Date.now()}`,
            pageNum,
            xPct: 0.5,
            yPct: 0.5,
            text: "",
            isEditing: true
        };
        setPdfAnnotations(prev => [...prev, newAnnot]);
        if (setIsDirty) setIsDirty(true);
    }, [getCurrentPageNum, setPdfAnnotations, setIsDirty]);

    return { renderPdfAnnotation, addPdfText };
};
