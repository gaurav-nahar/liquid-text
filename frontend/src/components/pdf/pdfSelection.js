import { useState, useEffect, useCallback, useRef } from "react";
import { handleImageSelection } from "./pdfImageSelection";
import { handleTextDragStart } from "./pdfDragHandlers";

/**
 * Custom hook for PDF selection functionality (text and image)
 * Handles both text selection highlighting and box selection for images
 * @param {Object} containerRef - React ref to PDF container
 * @param {string} mode - Current mode ("select" or other)
 * @returns {Object} Object containing selection state and handlers
 */
export const useSelection = (containerRef, mode, contentRef = null, zoomLevel = 1) => {
    const [isDragging, setIsDragging] = useState(false);
    const [startPos, setStartPos] = useState(null);
    const [selectionBox, setSelectionBox] = useState(null);
    const [popupData, setPopupData] = useState(null);
    const [multiSelections, setMultiSelections] = useState([]);

    const clearPopup = useCallback(() => {
        setPopupData(null);
        window.getSelection()?.removeAllRanges();
    }, []);

    const addToMultiSelect = useCallback(() => {
        if (!containerRef.current?._lastSelection) return;
        setMultiSelections(prev => [...prev, containerRef.current._lastSelection]);
        clearPopup();
    }, [clearPopup, containerRef]);

    // Clear selection box
    const clearSelectionBox = useCallback(() => {
        try {
            if (selectionBox && containerRef.current?.contains(selectionBox)) {
                containerRef.current.removeChild(selectionBox);
            }
        } catch { }
        finally {
            setSelectionBox(null);
            setIsDragging(false);
            setStartPos(null);
        }
    }, [selectionBox, containerRef]);

    // Handle mouse up - process text selection or image selection
    const handleMouseUp = useCallback(() => {
        if (mode !== "select") {
            clearSelectionBox();
            return;
        }

        const selection = window.getSelection();
        const selectedText = selection?.toString().trim() || "";

        // Text selection handling
        if (selectedText.length > 0) {
            try {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                let pageNum = null;

                // Robust page detection: Find the page wrapper containing the selection nodes
                const anchorWrapper = selection.anchorNode?.parentElement?.closest('.pdf-page-wrapper');
                const focusWrapper = selection.focusNode?.parentElement?.closest('.pdf-page-wrapper');
                const targetWrapper = anchorWrapper || focusWrapper;

                const contentContainer = contentRef ? contentRef.current : containerRef.current;

                if (targetWrapper) {
                    pageNum = parseInt(targetWrapper.dataset.pageNumber, 10);
                } else {
                    // Fallback to coordinates with tolerance if node detection fails
                    const wrappers = Array.from(contentContainer.children);
                    wrappers.forEach((wrapper) => {
                        const wRect = wrapper.getBoundingClientRect();
                        // Add tolerance for rounding errors or small overflows
                        if (rect.top >= wRect.top - 10 && rect.bottom <= wRect.bottom + 10) {
                            pageNum = parseInt(wrapper.dataset.pageNumber, 10);
                        }
                    });
                }

                if (pageNum) {
                    const pageWrapper = contentContainer.children[pageNum - 1];
                    const canvas = pageWrapper.querySelector("canvas");
                    const canvasRect = canvas.getBoundingClientRect();

                    setPopupData({
                        position: {
                            x: (rect.left + rect.width / 2) - containerRef.current.getBoundingClientRect().left,
                            y: rect.top - containerRef.current.getBoundingClientRect().top - 80
                        }
                    });

                    // Store selection data for later usage
                    if (canvas) {
                        const selData = {
                            pageNum,
                            text: selectedText,
                            xPct: (rect.left - canvasRect.left) / canvasRect.width,
                            yPct: (rect.top - canvasRect.top) / canvasRect.height,
                            widthPct: rect.width / canvasRect.width,
                            heightPct: rect.height / canvasRect.height,
                            fromPDF: true,
                            type: "anchor",
                        };
                        containerRef.current._lastSelection = selData;
                    }
                }
                return;
            } catch (err) {
                console.warn("Selection processing failed:", err);
            }
        }

        // Image selection handling (box selection)
        if (isDragging && selectionBox) {
            const selBoxRect = selectionBox.getBoundingClientRect();
            handleImageSelection(
                containerRef.current,
                selBoxRect,
                clearSelectionBox,
                mode,
                zoomLevel // 🚀 Pass zoomLevel for coordinate correction
            );
            return;
        }

        clearSelectionBox();
    }, [mode, selectionBox, isDragging, clearSelectionBox, containerRef]);

    // Refs to track drag state and timing (persisting across renders)
    const longPressTimerRef = useRef(null);
    const isTouchSelectingRef = useRef(false);
    const touchStartCoordsRef = useRef(null);
    const isTouchEventRef = useRef(false); // 🔒 Lock to prevent mouse handlers during touch

    // Setup event listeners for selection
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const getClientPos = (e) => {
            if (e.touches && e.touches[0]) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        };

        // when selection box is created is update its size and position
        const updateBox = (clientX, clientY) => {
            const box = container.querySelector(".current-selection-box");
            if (!box) return;

            const startX = parseFloat(box.dataset.startX);
            const startY = parseFloat(box.dataset.startY);

            const rect = container.getBoundingClientRect();
            const currentX = clientX - rect.left + container.scrollLeft;
            const currentY = clientY - rect.top + container.scrollTop;

            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            const left = Math.min(currentX, startX);
            const top = Math.min(currentY, startY);

            box.style.left = `${left}px`;
            box.style.top = `${top}px`;
            box.style.width = `${width}px`;
            box.style.height = `${height}px`;
        };

        // it is used when mouse is pressed
        const startNewSelection = (clientX, clientY) => {
            const rect = container.getBoundingClientRect();
            const startX = clientX - rect.left + container.scrollLeft;
            const startY = clientY - rect.top + container.scrollTop;

            setIsDragging(true);
            setStartPos({ x: startX, y: startY });

            // FIX: Clear any existing text selection/popup to prevent conflicts
            clearPopup();

            // Remove any existing temporary boxes (cleanup)
            const oldBox = container.querySelector(".current-selection-box");
            if (oldBox) oldBox.remove();

            const box = document.createElement("div");
            box.style.position = "absolute";
            box.style.border = "2px dashed red";
            box.style.background = "rgba(255,0,0,0.08)";
            box.style.left = `${startX}px`;
            box.style.top = `${startY}px`;
            box.style.zIndex = "999";
            box.classList.add("selection-box");
            box.classList.add("current-selection-box"); // Marker class

            // Store start pos on element for reliable access in listeners
            box.dataset.startX = startX;
            box.dataset.startY = startY;

            container.appendChild(box);
            setSelectionBox(box);
        };

        // 🖱️ MOUSE HANDLER (Immediate)
        const handleMouseDown = (e) => {
            if (mode !== "select") return;
            if (e.button !== 0) return;

            // 🔒 Skip mouse if touch is active
            if (isTouchEventRef.current) return;

            const isTextNode = e.target.closest(".textLayer span");
            if (isTextNode) return;
            const isCanvasOrLayer = e.target.closest("canvas") || e.target.closest(".textLayer");
            if (!isCanvasOrLayer) return;

            e.preventDefault();
            const { x, y } = getClientPos(e);
            startNewSelection(x, y);
        };

        const handleMouseMove = (e) => {
            if (mode !== "select") return;

            // 🔒 Skip mouse if touch is active
            if (isTouchEventRef.current) return;

            // For mouse, we rely on React state isDragging or existence of box
            const box = container.querySelector(".current-selection-box");
            if (!box) return;

            e.preventDefault();
            const { x, y } = getClientPos(e);
            updateBox(x, y);
        };

        const handleMouseUpWrapper = () => {
            // 🔒 Skip mouse if touch is active
            if (isTouchEventRef.current) return;

            // Cleanup marker class on commit
            const box = container.querySelector(".current-selection-box");
            if (box) box.classList.remove("current-selection-box");
            handleMouseUp();
        };

        // 👆 TOUCH HANDLER (Delayed) using REFS
        const handleTouchStart = (e) => {
            if (mode !== "select") return;
            if (e.touches.length > 1) return;

            isTouchEventRef.current = true; // 🔒 Lock mouse handlers

            // 🛑 CRITICAL FIX: Allow native Text Selection!
            // If touching text, DO NOT start image selection timer.
            const isTextNode = e.target.closest(".textLayer span");
            const isDraggableImage = e.target.closest(".pdf-draggable-image");

            if (isTextNode || isDraggableImage) {
                isTouchEventRef.current = false;
                return;
            }

            const t = e.touches[0];
            touchStartCoordsRef.current = { x: t.clientX, y: t.clientY };
            isTouchSelectingRef.current = false;

            // Start Timer. DO NOT PREVENT DEFAULT (Allow Scroll).
            longPressTimerRef.current = setTimeout(() => {
                isTouchSelectingRef.current = true;
                if (navigator.vibrate) navigator.vibrate(50);
                startNewSelection(t.clientX, t.clientY);
            }, 500);
        };

        const handleTouchMove = (e) => {
            // If neither selecting nor waiting, ignore
            if (!longPressTimerRef.current && !isTouchSelectingRef.current) return;

            const t = e.touches[0];

            if (!isTouchSelectingRef.current) {
                // Timer is running. Check if moved?
                const dx = Math.abs(t.clientX - touchStartCoordsRef.current.x);
                const dy = Math.abs(t.clientY - touchStartCoordsRef.current.y);

                if (dx > 10 || dy > 10) {
                    // User moved -> It's a scroll -> Cancel timer
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                    isTouchEventRef.current = false; // 🔒 Release lock on scroll
                }
            } else {
                // Selection Triggered!
                // NOW we prevent default to block scroll while drawing box
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();

                updateBox(t.clientX, t.clientY);
            }
        };

        const handleTouchEnd = (e) => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }

            if (isTouchSelectingRef.current) {
                // Commit image selection ONLY
                const box = container.querySelector(".current-selection-box");
                if (box) box.classList.remove("current-selection-box");
                handleMouseUp();
            } else {
                // Check if user was doing native text selection
                const selection = window.getSelection();
                if (selection && selection.toString().trim().length > 0) {
                    // Small delay to let browser finish selection update
                    setTimeout(() => {
                        handleMouseUp();
                    }, 100);
                }
            }

            isTouchSelectingRef.current = false;
            isTouchEventRef.current = false; // 🔒 Release lock
        };

        // LISTENERS
        container.addEventListener("mousedown", handleMouseDown);
        container.addEventListener("mousemove", handleMouseMove);
        container.addEventListener("mouseup", handleMouseUpWrapper);
        container.addEventListener("dragstart", (e) => handleTextDragStart(e, containerRef, mode, zoomLevel));

        container.addEventListener("touchstart", handleTouchStart, { passive: true }); // Passive:true allows scroll
        container.addEventListener("touchmove", handleTouchMove, { passive: false }); // Passive:false allows preventDefault later
        container.addEventListener("touchend", handleTouchEnd);
        container.addEventListener("touchcancel", handleTouchEnd); // Handle cancel too


        // Handle text selection change
        const handleSelectionChange = () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0 && selection.toString().trim().length > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                let pageNum = null;
                const contentContainer = contentRef ? contentRef.current : containerRef.current;
                const wrappers = Array.from(contentContainer.children);
                wrappers.forEach((wrapper) => {
                    const wRect = wrapper.getBoundingClientRect();
                    if (rect.top >= wRect.top && rect.bottom <= wRect.bottom) {
                        pageNum = parseInt(wrapper.dataset.pageNumber, 10);
                    }
                });

                if (pageNum) {
                    const pageWrapper = Array.from(contentContainer.children).find(
                        (el) => parseInt(el.dataset.pageNumber, 10) === pageNum
                    );
                    const canvas = pageWrapper.querySelector("canvas");
                    if (canvas) {
                        const canvasRect = canvas.getBoundingClientRect();
                        const selData = {
                            pageNum,
                            text: selection.toString().trim(),
                            xPct: (rect.left - canvasRect.left) / canvasRect.width,
                            yPct: (rect.top - canvasRect.top) / canvasRect.height,
                            widthPct: rect.width / canvasRect.width,
                            heightPct: rect.height / canvasRect.height,
                            fromPDF: true,
                            type: "anchor",
                        };
                        containerRef.current._lastSelection = selData;
                    }
                }
            }
        };
        document.addEventListener("selectionchange", handleSelectionChange);

        return () => {
            // Cleanup listeners
            container.removeEventListener("mousedown", handleMouseDown);
            container.removeEventListener("mousemove", handleMouseMove);
            container.removeEventListener("mouseup", handleMouseUpWrapper);

            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchmove", handleTouchMove);
            container.removeEventListener("touchend", handleTouchEnd);
            container.removeEventListener("touchcancel", handleTouchEnd);

            document.removeEventListener("selectionchange", handleSelectionChange);

            // Cleanup timer
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
            }
        };
    }, [isDragging, selectionBox, startPos, mode, handleMouseUp, containerRef, clearSelectionBox, clearPopup, zoomLevel]);

    return {
        isDragging,
        startPos,
        selectionBox,
        clearSelectionBox,
        handleMouseUp,
        popupData,
        clearPopup,
        multiSelections,
        setMultiSelections,
        addToMultiSelect,
    };
};