
export function handleTextDragStart(e, containerRef, mode, zoomLevel = 1) {
  if (mode !== "select") return;

  const selection = window.getSelection();
  if (!selection || !selection.toString().trim()) return;

  const text = selection.toString();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  let pageNum = null;
  const zoomWrapper = containerRef.current.querySelector(".pdf-zoom-content") || containerRef.current;
  const wrappers = Array.from(zoomWrapper.children);
  wrappers.forEach((wrapper) => {
    // Filter: Only consider elements that are actual pages
    if (!wrapper.dataset.pageNumber) return;

    const wRect = wrapper.getBoundingClientRect();

    // Check if selection rect overlaps with wrapper vertically
    const overlapH = Math.min(rect.bottom, wRect.bottom) - Math.max(rect.top, wRect.top);

    if (overlapH > 0) {
      // Pick the page with the most vertical overlap
      if (!pageNum || overlapH > (range.getBoundingClientRect().height / 2)) {
        // CRITICAL: Read the ID from the DOM, don't guess from the index (which might include selection box)
        pageNum = parseInt(wrapper.dataset.pageNumber, 10);
      }
    }
  });

  if (!pageNum) return;

  // 📸 TEXT SNIPPET CREATION (No Image Magic)
  // 1. Get the canvas for this page to calculate relative coordinates
  // Use robust find instead of index assumption
  const pageWrapper = Array.from(zoomWrapper.children).find(
    (el) => parseInt(el.dataset.pageNumber, 10) === pageNum
  );
  if (!pageWrapper) {
    console.warn(`Page wrapper not found for page ${pageNum}`);
    return;
  }

  const canvas = pageWrapper.querySelector("canvas");

  if (canvas) {
    const canvasRect = canvas.getBoundingClientRect();
    const zoomScale = zoomLevel; // Use passed zoomLevel

    // 2. Create Text Snippet
    const snippet = {
      id: Date.now(),
      type: "text", // Crucial: 'text' type
      text: text,
      // Store coordinates relative to the PAGE CANVAS in logical pixels
      x: (rect.left - canvasRect.left) / zoomScale,
      y: (rect.top - canvasRect.top) / zoomScale,
      width: rect.width / zoomScale,
      height: rect.height / zoomScale,
      // Store normalized coordinates
      xPct: (rect.left - canvasRect.left) / canvasRect.width,
      yPct: (rect.top - canvasRect.top) / canvasRect.height,
      widthPct: rect.width / canvasRect.width,
      heightPct: rect.height / canvasRect.height,
      pageNum,
      fromPDF: true,
    };


    // For mouse drag
    if (e.dataTransfer) {
      e.dataTransfer.setData("application/json", JSON.stringify(snippet));
      e.dataTransfer.effectAllowed = "copy";
      // We don't set a drag image for text, browser default is fine, or we could set a transparent one
    }

    // For touch devices
    e.target._dragSnippet = snippet;
  } else {
    console.warn("Canvas not found for text drag coordinate calculation");
  }
}


// --------------------- Image Drag ---------------------
// ✂️ attachImageDragHandler: Handles dragging for a "cropped" image snippet.
// Called from: pdfImageSelection.js -> handleImageSelection
export function attachImageDragHandler(imgEl, snippet, mode) {
  imgEl.addEventListener("dragstart", (e) => {
    if (mode !== "select") {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/json", JSON.stringify(snippet));
    const dragImg = new Image();
    dragImg.src = snippet.src;
    e.dataTransfer.setDragImage(dragImg, snippet.width / 2, snippet.height / 2);
  });

  // Touch drag
  let touchDragElement = null;

  imgEl.addEventListener("touchstart", (e) => {
    if (mode !== "select" || (e.touches && e.touches.length !== 1)) return;
    e.stopPropagation(); // 🛑 Stop pdfSelection from seeing this
    touchDragElement = imgEl;
    imgEl._touchStartX = e.touches[0].clientX;
    imgEl._touchStartY = e.touches[0].clientY;
  }, { passive: false });

  imgEl.addEventListener("touchmove", (e) => {
    if (!touchDragElement || (e.touches && e.touches.length !== 1)) return;
    const dx = e.touches[0].clientX - imgEl._touchStartX;
    const dy = e.touches[0].clientY - imgEl._touchStartY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      // Dispatch globally so App.js or a global handler can pick it up
      window.dispatchEvent(
        new CustomEvent("pdf-touch-drag-start", {
          detail: {
            snippet,
            startX: e.touches[0].clientX,
            startY: e.touches[0].clientY
          }
        })
      );
      touchDragElement = null;
      e.preventDefault();
    }
  });

  imgEl.addEventListener("touchend", () => {
    touchDragElement = null;
  });
}

/**
 * Initializes global touch drag listeners for PDF images.
 * This handles the "ghost" drag element and drop logic on the Workspace.
 * 
 * @param {Function} addSnippet - Function to add the dropped snippet to workspace
 * @param {Function} screenToWorld - Helper to convert screen coords to world coords
 * @param {Object} workspaceRef - Ref to the workspace container to check drop bounds
 * @returns {Function} cleanup - Function to remove the global listener
 */
export function initGlobalTouchDrag(addSnippet, screenToWorld, workspaceRef) {
  const handleTouchDragStart = (e) => {
    const { snippet, startX, startY } = e.detail;
    if (!snippet) return;

    // Create Ghost Element
    const ghost = document.createElement('img');
    ghost.src = snippet.src || ''; // Ensure src exists if image
    ghost.style.position = 'fixed';
    ghost.style.left = `${startX}px`;
    ghost.style.top = `${startY}px`;
    ghost.style.width = `${snippet.width}px`;
    ghost.style.maxWidth = '200px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.opacity = '0.8';
    ghost.style.border = '2px dashed #007bff';
    ghost.style.transform = 'translate(-50%, -50%)';

    document.body.appendChild(ghost);

    const handleTouchMove = (tm) => {
      const t = tm.touches[0];
      ghost.style.left = `${t.clientX}px`;
      ghost.style.top = `${t.clientY}px`;
    };

    const handleTouchEnd = (te) => {
      const t = te.changedTouches[0];
      const dropX = t.clientX;
      const dropY = t.clientY;

      // Check if dropped inside Workspace
      const workspaceRect = workspaceRef.current?.getBoundingClientRect();
      if (workspaceRect &&
        dropX >= workspaceRect.left &&
        dropX <= workspaceRect.right &&
        dropY >= workspaceRect.top &&
        dropY <= workspaceRect.bottom) {

        // Valid Drop!
        const dropPos = screenToWorld(dropX, dropY);

        // Add Snippet using passed function
        if (addSnippet) {
          addSnippet(snippet, dropPos);
          // Haptic feedback
          if (navigator.vibrate) navigator.vibrate(50);
        }
      }

      // Cleanup
      ghost.remove();
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
  };

  window.addEventListener('pdf-touch-drag-start', handleTouchDragStart);

  // Return cleanup function
  return () => {
    window.removeEventListener('pdf-touch-drag-start', handleTouchDragStart);
  };
}
