import { useEffect, useRef, useState } from "react";

/**
 * 🌊 Liquid PDF Shrink & Expand (The "Accordion" Feature)
 * This logic mimics LiquidText by allowing pages to shrink and stack.
 * 
 * HOW IT WORKS: 
 * It changes the 'transform: scaleY()' of PDF pages and stacks them at the top or bottom.
 * 
 * LIBRARY: None (Uses standard React hooks & Browser CSS/Event APIs).
 * CALL LOCATION: Imported and used ONLY in PDFViewer.js.
 */

// Configuration constants

export const MIN_SCALE = 0.04; // Completely flat
export const STACK_GAP = 0;   // No gap
export const TRANSITION = "transform 0.36s cubic-bezier(.22,.9,.32,1)"; // Smooth movement


/**
 * 🎯 getCurrentPageNum: Finds which page is currently in the middle of your screen.
 * CALL LOCATION: Called by simulateShrinkExpand (below) to know where to start shrinking.
 * 
 * @param {HTMLElement} container - The main PDF scroll area.
 * @param {HTMLElement} contentContainer - The element containing the page wrappers (can be same as container).
 * @returns {number} The current page number (1, 2, 3...).
 */
export const getCurrentPageNum = (container, contentContainer = null) => {
    if (!container) return 1;
    const pagesParent = contentContainer || container;
    const children = Array.from(pagesParent.children);
    const scrollTop = container.scrollTop;
    const viewportCenter = scrollTop + container.clientHeight / 2;
    let best = 1;
    let minDiff = Infinity;
    for (let i = 0; i < children.length; i++) {
        const w = children[i];
        if (w.style.position === "absolute") continue;
        const top = w.offsetTop;
        const center = top + w.offsetHeight / 2;
        const diff = Math.abs(center - viewportCenter);
        if (diff < minDiff) {
            minDiff = diff;
            best = parseInt(w.dataset.pageNumber || i + 1, 10);
        }
    }
    return best;
};

/**
 * 🛠️ applyAllShrinks: The "Visual Engine". It actually moves the pages on screen.
 * CALL LOCATION: Called every time a page shrinks or expands.
 * 
 * LOGIC: 
 * 1. It makes shrunk pages 'Absolute' so they can stack on top of each other.
 * 2. It keeps the "Focused" page 'Static' so you can still scroll normally.
 * 3. It adds "Margin" to the focused page to make room for the stack above it.
 * 
 * @param {number} focusedPage - The main page you are reading.
 * @param {HTMLElement} container - The PDF scroll area (for scrolling).
 * @param {HTMLElement} contentContainer - The element containing the pages (for layout).
 * @param {Object} shrinkMapRef - A dictionary of scales {Page1: 0.5, Page2: 1.0}.
 * @param {Object} shrunkBelowRef - List of pages sitting in the bottom stack.
 * @param {Object} shrunkAboveRef - List of pages sitting in the top stack.
 * @param {boolean} debug - If true, it prints logs to console.
 */
export const applyAllShrinks = (
    focusedPage,
    container,
    contentContainer,
    shrinkMapRef,
    shrunkBelowRef,
    shrunkAboveRef,
    debug = false
) => {
    if (!container || !contentContainer) return;
    const pages = Array.from(contentContainer.children);
    if (!pages.length || focusedPage < 1 || focusedPage > pages.length) return;

    const focusedEl = pages[focusedPage - 1];
    const prevRect = focusedEl.getBoundingClientRect();
    const prevTopComp = prevRect.top;

    const below = [...shrunkBelowRef.current]
        .filter((p) => p > focusedPage && p <= pages.length)
        .sort((a, b) => a - b);
    const above = [...shrunkAboveRef.current]
        .filter((p) => p < focusedPage && p >= 1)
        .sort((a, b) => b - a);

    contentContainer.style.position = "relative";

    // 1. Calculate reserved height for the Above stack
    // (We skip calculating individual heights to keep the stack tight at the top)
    let aboveStackHeight = 0;
    if (above.length > 0) {
        aboveStackHeight = 20; // Small fixed space for the top stack
    }

    // 2. Initial Layout Reset: Set Shrunken to Absolute, Rest to Static
    // This allows the browser to calculate the focused page's "flow" position correctly
    const shrunkSet = new Set([...below, ...above]);
    pages.forEach((el, i) => {
        const num = i + 1;
        if (shrunkSet.has(num)) {
            el.style.position = "absolute";
            el.style.pointerEvents = "none";
            el.classList.add(num < focusedPage ? "page-above" : "page-below");
            el.style.overflow = "hidden";
            el.style.backgroundColor = num < focusedPage ? "#cccccc" : "#dddddd";
        } else {
            el.style.position = "static";
            el.style.backgroundColor = "";
            el.style.marginTop = num === focusedPage ? `${aboveStackHeight}px` : "0px";
            el.style.transform = "translateY(0) scaleY(1)";
            el.style.zIndex = num === focusedPage ? 200 : 1;
            el.style.pointerEvents = "auto";
            el.style.transition = TRANSITION;
            el.classList.remove("page-below", "page-above");
        }
    });

    // 3. Capture Anchor Point
    // Now that shrunken pages are out of flow and Margin is applied, 
    // offsetTop is the exact visual top edge of the focused page.
    const anchorTop = focusedEl.offsetTop;
    const focusedHeight = focusedEl.offsetHeight;

    // 4. Style Helpers for Shrunken Pages
    const applyBelow = (el, top, scale, zIndex) => {
        el.style.top = `${top}px`;
        el.style.transformOrigin = "top center";
        el.style.transform = `scaleY(${scale})`;
        el.style.zIndex = zIndex;
        el.style.transition = TRANSITION;
        // If scale is 0, hide it completely
        el.style.opacity = scale < 0.01 ? "0" : "1";
    };

    const applyAbove = (el, bottom, scale, zIndex) => {
        // Place the box so its bottom is at the 'bottom' coordinate
        const top = bottom - el.offsetHeight;
        el.style.top = `${top}px`;
        el.style.transformOrigin = "bottom center";
        el.style.transform = `scaleY(${scale})`;
        el.style.zIndex = zIndex;
        el.style.transition = TRANSITION;
        el.style.opacity = scale < 0.01 ? "0" : "1";
    };

    // 5. Position 'Below' Stack (TIGHT - NO GAP)
    let nextBelowTop = anchorTop + focusedHeight;
    below.forEach((pageNum, idx) => {
        const el = pages[pageNum - 1];
        if (!el) return;
        const scale = shrinkMapRef.current[pageNum] ?? 1;
        applyBelow(el, nextBelowTop, scale, 100 - idx);
        // No increment = purely overlapping at the same spot
    });

    // 6. Position 'Above' Stack (TIGHT - NO GAP)
    let nextAboveBottom = anchorTop;
    above.forEach((pageNum, idx) => {
        const el = pages[pageNum - 1];
        if (!el) return;
        const scale = shrinkMapRef.current[pageNum] ?? 1;
        applyAbove(el, nextAboveBottom, scale, 100 - idx);
        // No decrement
    });

    // 7. Calculate Total Visual Height
    // The height is the bottom of the focused page + the small bottom stack
    let totalHeight = nextBelowTop;
    if (below.length > 0) {
        totalHeight += 20; // Room for bottom stack
    }

    // Capture unscaled total height (divide by current zoom level if called from outside)
    // But since we are inside, we return the logical pixels (unscaled by zoomLevel, scaled by page setup)

    // 8. Compensation for Scroll Jumps
    const newRect = focusedEl.getBoundingClientRect();
    const diff = newRect.top - prevTopComp;
    if (Math.abs(diff) > 1) {
        container.scrollTop += diff;
    }

    return totalHeight;
};

const SCALE_STEP = 0.1;

/**
 * 🧠 simulateShrinkExpand: The "Decision Maker".
 * CALL LOCATION: Called by the mouse wheel or touch event handlers.
 * 
 * LOGIC: 
 * - If you scroll DOWN (with Shift): It shrinks the pages BELOW you.
 * - If you scroll UP (with Shift): It shrinks the pages ABOVE you.
 * - If you scroll the opposite way: It expands (restores) the shrunk pages.
 * 
 * @param {boolean} isDown - True if shrinking downwards, False if upwards.
 * @param {HTMLElement} container - The PDF scroll area.
 * @param {HTMLElement} contentContainer - The element containing the pages.
 * @param {Object} shrinkMapRef - Where we save the scale (size) of each page.
 * @param {Object} shrunkBelowRef - List of pages currently hidden at the bottom.
 * @param {Object} shrunkAboveRef - List of pages currently hidden at the top.
 */
export const simulateShrinkExpand = (
    isDown,
    container,
    contentContainer,
    shrinkMapRef,
    shrunkBelowRef,
    shrunkAboveRef,
    setShrinkStatus,
    setDynamicHeight // 📏 New callback
) => {
    const pagesParent = contentContainer || container;
    const pages = Array.from(pagesParent.children);
    if (!pages.length) return;
    const focused = getCurrentPageNum(container, pagesParent);
    const total = pages.length;

    const round = (val) => Math.round(val * 10) / 10;

    // A. Restore Logic (Opposite direction first)
    if (isDown && shrunkAboveRef.current.length > 0) {
        const lastIdx = shrunkAboveRef.current.length - 1;
        const pageNum = shrunkAboveRef.current[lastIdx];
        let currentScale = shrinkMapRef.current[pageNum] ?? MIN_SCALE;

        currentScale = round(currentScale + SCALE_STEP);
        if (currentScale >= 1) {
            currentScale = 1;
            shrunkAboveRef.current.pop();
        }
        shrinkMapRef.current[pageNum] = currentScale;
        const totalHeight = applyAllShrinks(focused, container, pagesParent, shrinkMapRef, shrunkBelowRef, shrunkAboveRef);
        if (setDynamicHeight) setDynamicHeight(totalHeight);
        return;
    }

    if (!isDown && shrunkBelowRef.current.length > 0) {
        const lastIdx = shrunkBelowRef.current.length - 1;
        const pageNum = shrunkBelowRef.current[lastIdx];
        let currentScale = shrinkMapRef.current[pageNum] ?? MIN_SCALE;

        currentScale = round(currentScale + SCALE_STEP);
        if (currentScale >= 1) {
            currentScale = 1;
            shrunkBelowRef.current.pop();
        }
        shrinkMapRef.current[pageNum] = currentScale;
        const totalHeight = applyAllShrinks(focused, container, pagesParent, shrinkMapRef, shrunkBelowRef, shrunkAboveRef);
        if (setDynamicHeight) setDynamicHeight(totalHeight);
        return;
    }

    // B. Shrink Logic
    if (isDown) {
        // Find the page currently being shrunk below, or the next potential one
        let targetPage = shrunkBelowRef.current[shrunkBelowRef.current.length - 1];
        if (!targetPage || (shrinkMapRef.current[targetPage] ?? 1) <= MIN_SCALE) {
            // Find next unshrunk page
            for (let i = focused + 1; i <= total; i++) {
                if ((shrinkMapRef.current[i] ?? 1) === 1) {
                    targetPage = i;
                    shrunkBelowRef.current.push(i);
                    break;
                }
            }
        }

        if (targetPage) {
            let currentScale = shrinkMapRef.current[targetPage] ?? 1;
            currentScale = round(currentScale - SCALE_STEP);
            if (currentScale <= MIN_SCALE) currentScale = MIN_SCALE;
            shrinkMapRef.current[targetPage] = currentScale;
            const totalHeight = applyAllShrinks(focused, container, pagesParent, shrinkMapRef, shrunkBelowRef, shrunkAboveRef);
            if (setDynamicHeight) setDynamicHeight(totalHeight);
        }
    } else {
        // find the page currently being shrunk above, or the next potential one
        let targetPage = shrunkAboveRef.current[shrunkAboveRef.current.length - 1];
        if (!targetPage || (shrinkMapRef.current[targetPage] ?? 1) <= MIN_SCALE) {
            for (let i = focused - 1; i >= 1; i--) {
                if ((shrinkMapRef.current[i] ?? 1) === 1) {
                    targetPage = i;
                    shrunkAboveRef.current.push(i);
                    break;
                }
            }
        }

        if (targetPage) {
            let currentScale = shrinkMapRef.current[targetPage] ?? 1;
            currentScale = round(currentScale - SCALE_STEP);
            if (currentScale <= MIN_SCALE) currentScale = MIN_SCALE;
            shrinkMapRef.current[targetPage] = currentScale;
            const totalHeight = applyAllShrinks(focused, container, pagesParent, shrinkMapRef, shrunkBelowRef, shrunkAboveRef);
            if (setDynamicHeight) setDynamicHeight(totalHeight);
        }
    }

    // Update state to trigger re-render in the Hook/Component
    if (setShrinkStatus) {
        if (shrunkAboveRef.current.length > 0) setShrinkStatus("top");
        else if (shrunkBelowRef.current.length > 0) setShrinkStatus("bottom");
        else setShrinkStatus(null);
    }
};

/**
 * 🎣 useShrinkExpand: The Event Listener Hook.
 * CALL LOCATION: Used in PDFViewer.js.
 * 
 * LOGIC:
 * - It listens for Shift + Mouse Wheel.
 * - It listens for 2-finger touch movements (like a pinch).
 * - It then tells simulateShrinkExpand to do its job.
 * 
 * @param {Object} containerRef - React ref to the PDF scroll area.
 * @param {Object} contentRef - Optional React ref to the element containing the pages.
 * @returns {Object} Functions like getCurrentPageNum and the shrinkMap data.
 */
export const useShrinkExpand = (containerRef, contentRef = null) => {
    const shrinkMapRef = useRef({});
    const shrunkBelowRef = useRef([]);
    const shrunkAboveRef = useRef([]);
    const [shrinkStatus, setShrinkStatus] = useState(null);
    const [dynamicHeight, setDynamicHeight] = useState(0); // 📏 New state

    useEffect(() => {
        const container = containerRef.current;
        const contentContainer = contentRef ? contentRef.current : container;
        if (!container || !contentContainer) return;

        let wheelCooldown = false;
        const cooldownMs = 60;
        let touchStartDist = null;
        let touchAccumulatedDelta = 0;
        const touchStepDistance = 20; // pixels per shrink step

        const handleSimulateShrinkExpand = (isDown) => {
            simulateShrinkExpand(
                isDown,
                container,
                contentContainer,
                shrinkMapRef,
                shrunkBelowRef,
                shrunkAboveRef,
                setShrinkStatus,
                setDynamicHeight
            );
        };

        const handleWheel = (e) => {
            if (!e.shiftKey) return;
            e.preventDefault();
            if (wheelCooldown) return;
            wheelCooldown = true;
            setTimeout(() => (wheelCooldown = false), cooldownMs);

            const isDown = e.deltaY > 0;
            handleSimulateShrinkExpand(isDown);
        };

        const handleTouchStart = (e) => {
            if (e.touches.length === 2) {
                const y1 = e.touches[0].clientY;
                const y2 = e.touches[1].clientY;
                touchStartDist = Math.abs(y1 - y2);
                touchAccumulatedDelta = 0;
            }
        };

        const handleTouchMove = (e) => {
            if (e.touches.length !== 2) return;
            e.preventDefault();

            const y1 = e.touches[0].clientY;
            const y2 = e.touches[1].clientY;
            const avgY = (y1 + y2) / 2;
            const currentDist = Math.abs(y1 - y2);

            if (touchStartDist !== null) {
                const distDiff = currentDist - touchStartDist;

                // Logic: 
                // 1. If avgY is in bottom half -> Pinch (dist decrease) = Shrink Below (isDown=true)
                // 2. If avgY is in bottom half -> Spread (dist increase) = Expand Below (isDown=false)
                // 3. If avgY is in top half -> Pinch (dist decrease) = Shrink Above (isDown=false)
                // 4. If avgY is in top half -> Spread (dist increase) = Expand Above (isDown=true)

                const containerHeight = container.clientHeight;
                const isTopHalf = (avgY - container.getBoundingClientRect().top) < (containerHeight / 2);

                touchAccumulatedDelta += distDiff;
                touchStartDist = currentDist; // Update base
                let steps = 0
                while (Math.abs(touchAccumulatedDelta) >= touchStepDistance && steps < 1) {
                    const isSpreading = touchAccumulatedDelta > 0;

                    if (isTopHalf) {
                        // Top Half: Spreading expands above (isDown=true in simulate), Pinching shrinks above (isDown=false)
                        handleSimulateShrinkExpand(isSpreading);
                    } else {
                        // Bottom Half: Spreading expands below (isDown=false in simulate), Pinching shrinks below (isDown=true)
                        handleSimulateShrinkExpand(!isSpreading);
                    }

                    if (isSpreading) touchAccumulatedDelta -= touchStepDistance;
                    else touchAccumulatedDelta += touchStepDistance;
                    steps++;
                }
            }
        };

        const handleTouchEnd = (e) => {
            if (e.touches.length < 2) {
                touchStartDist = null;
                touchAccumulatedDelta = 0;
            }
        };

        // 🔙 Expand All: Resets everything to scale 1.0
        const expandAll = () => {
            shrinkMapRef.current = {};
            shrunkBelowRef.current = [];
            shrunkAboveRef.current = [];
            setShrinkStatus(null);

            // Reset clipping and margins on all pages
            const pages = Array.from(contentContainer.children);
            pages.forEach(pageEl => {
                pageEl.style.clipPath = "";
                pageEl.style.marginTop = "";
                pageEl.style.marginBottom = "";
            });

            // We need to apply the reset visually
            const focused = getCurrentPageNum(container, contentContainer);
            const totalHeight = applyAllShrinks(focused, container, contentContainer, shrinkMapRef, shrunkBelowRef, shrunkAboveRef);
            if (setDynamicHeight) setDynamicHeight(totalHeight);
        };
        container._expandAll = expandAll; // Exposure for hook return

        container.addEventListener("wheel", handleWheel, { passive: false });
        container.addEventListener("touchstart", handleTouchStart, { passive: false });
        container.addEventListener("touchmove", handleTouchMove, { passive: false });
        container.addEventListener("touchend", handleTouchEnd);

        return () => {
            container.removeEventListener("wheel", handleWheel);
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchmove", handleTouchMove);
            container.removeEventListener("touchend", handleTouchEnd);
        };
    }, [containerRef, contentRef]);

    return {
        shrinkMapRef,
        shrunkBelowRef,
        shrunkAboveRef,
        shrinkState: shrinkStatus, // Use state-based status
        expandAll: () => {
            if (containerRef.current && containerRef.current._expandAll) {
                containerRef.current._expandAll();
            }
        },
        applyAllShrinks: (focusedPage, debug = false) =>
            applyAllShrinks(
                focusedPage,
                containerRef.current,
                contentRef ? contentRef.current : containerRef.current,
                shrinkMapRef,
                shrunkBelowRef,
                shrunkAboveRef,
                debug
            ),
        contractBetween: (startPageOrObj, endPageOrObj) => {
            // Support both simple page numbers and objects with highlight data
            const isStartObj = typeof startPageOrObj === 'object';
            const isEndObj = typeof endPageOrObj === 'object';

            const startPage = isStartObj ? startPageOrObj.pageNum : startPageOrObj;
            const endPage = isEndObj ? endPageOrObj.pageNum : endPageOrObj;

            const min = Math.min(startPage, endPage);
            const max = Math.max(startPage, endPage);

            shrinkMapRef.current = {};
            shrunkBelowRef.current = [];
            shrunkAboveRef.current = [];

            // Shrink intermediate pages
            for (let i = min + 1; i < max; i++) {
                shrunkBelowRef.current.push(i);
                shrinkMapRef.current[i] = MIN_SCALE;
            }

            // Apply clipping to anchor pages based on highlight positions
            const container = containerRef.current;
            const contentContainer = contentRef ? contentRef.current : container;
            if (contentContainer && (isStartObj || isEndObj)) {
                const pages = Array.from(contentContainer.children);

                // Clip first page (show bottom portion with highlight)
                if (isStartObj && startPage === min) {
                    const pageEl = pages[min - 1];
                    if (pageEl) {
                        const clipTopPct = Math.max(0, (startPageOrObj.yPct * 100) - 10); // 10% padding above
                        pageEl.style.clipPath = `inset(${clipTopPct}% 0 0 0)`;
                        pageEl.style.marginTop = `-${clipTopPct}%`;
                    }
                }

                // Clip last page (show top portion with highlight)
                if (isEndObj && endPage === max) {
                    const pageEl = pages[max - 1];
                    if (pageEl) {
                        const highlightBottom = (endPageOrObj.yPct + (endPageOrObj.heightPct || 0.05)) * 100;
                        const clipBottomPct = Math.max(0, 100 - highlightBottom - 10); // 10% padding below
                        pageEl.style.clipPath = `inset(0 0 ${clipBottomPct}% 0)`;
                        pageEl.style.marginBottom = `-${clipBottomPct}%`;
                    }
                }
            }

            const totalHeight = applyAllShrinks(min, containerRef.current, contentContainer, shrinkMapRef, shrunkBelowRef, shrunkAboveRef);
            if (setDynamicHeight) setDynamicHeight(totalHeight);
            if (shrunkBelowRef.current.length > 0) setShrinkStatus("bottom");
        },
        dynamicHeight, // 📏 Exposure for hook return
        getCurrentPageNum: () => getCurrentPageNum(containerRef.current, contentRef ? contentRef.current : containerRef.current),
    };
};