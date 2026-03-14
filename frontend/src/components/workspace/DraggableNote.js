import React, { useRef, useState, useEffect, memo } from "react";
import { useCanvas } from "./InfiniteCanvas";
import ItemContextMenu from "./ItemContextMenu";

/**
 * 🗒️ DraggableNote (Workspace Snippets)
 * ...
 */
const DraggableNote = memo(({
  snippet,
  onClick,
  onDrag,
  selected,
  onDoubleClick,
  disableDrag = false,
}) => {
  const noteRef = useRef();
  const pos = useRef({ x: 0, y: 0 });
  const { getScale } = useCanvas(); // 🆕 Scale awareness

  const [contextMenu, setContextMenu] = useState(null);

  // 🎯 DRAG LOGIC
  const startDrag = (x, y) => {
    pos.current = { x, y };
  };

  const moveDrag = (x, y) => {
    const scale = getScale ? getScale() : 1; // 🆕 Get current scale
    const dx = (x - pos.current.x) / scale; // 🆕 Adjust delta by scale
    const dy = (y - pos.current.y) / scale;
    pos.current = { x, y };

    onDrag?.(dx, dy);
  };

  const endDrag = () => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    window.removeEventListener("touchmove", handleTouchMove);
    window.removeEventListener("touchend", handleTouchEnd);
  };

  // 🖱️ Mouse Handlers
  const handleMouseDown = (e) => {
    if (disableDrag) {
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    startDrag(e.clientX, e.clientY);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e) => {
    moveDrag(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    endDrag();
  };

  // 🤳 Touch Handlers
  const handleTouchStart = (e) => {
    if (disableDrag) {
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
  };

  const handleTouchMove = (e) => {
    const touch = e.touches[0];
    moveDrag(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    endDrag();
  };

  // ✅ Handle right-click (open context menu)
  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // ✅ Handle copy / cut / delete actions
  const handleCopy = () => {
    localStorage.setItem("globalClipboard", JSON.stringify({ ...snippet, itemType: 'snippet' }));
    setContextMenu(null);
  };

  const handleCut = () => {
    localStorage.setItem("globalClipboard", JSON.stringify({ ...snippet, itemType: 'snippet' }));
    onDrag?.(null, null, "cut", snippet.id); // invokes handleDeleteSnippet in App.js
    setContextMenu(null);
  };

  const handleDelete = () => {
    onDrag?.(null, null, "delete", snippet.id);
    setContextMenu(null);
  };

  const handlePaste = () => {
    const data = localStorage.getItem("globalClipboard");
    if (data) {
      const item = JSON.parse(data);
      const id = `pasted-${Date.now()}`;
      const newItem = {
        ...item,
        id,
        x: snippet.x + 30,
        y: snippet.y + 30,
      };
      onDrag?.(null, null, "paste", newItem);
    }
    setContextMenu(null);
  };

  const contextActions = [
    { label: 'Copy', icon: '📋', onClick: handleCopy },
    { label: 'Cut', icon: '✂️', onClick: handleCut },
    { label: 'Paste', icon: '📥', onClick: handlePaste },
    { label: 'Delete', icon: '🗑', onClick: handleDelete, danger: true },
  ];



  // ✅ Determine image src: Handles both normal URLs and base64 text from the database.
  const imgSrc =
    snippet.src ||
    (snippet.file_data ? `data:image/png;base64,${snippet.file_data}` : null);

  // 📐 RESIZE LOGIC: Handles the small handle at the bottom-right corner.
  const handleResizeMouseDown = (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Support both mouse and touch start coords
    const startX = e.clientX ?? e.touches?.[0]?.clientX;
    const startY = e.clientY ?? e.touches?.[0]?.clientY;

    // Use getBoundingClientRect for accurate start dimensions (handles 'auto' height correctly)
    const rect = noteRef.current.getBoundingClientRect();
    const startWidth = rect.width;
    const startHeight = rect.height;

    const doResize = (moveEvent) => {
      moveEvent.preventDefault();
      // Handle both mouse and touch events
      const clientX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      const clientY = moveEvent.clientY ?? moveEvent.touches?.[0]?.clientY;

      if (clientX === undefined || clientY === undefined) return;

      const scale = getScale() || 1;
      const newWidth = Math.max(50, startWidth + (clientX - startX)) / scale;
      const newHeight = Math.max(50, startHeight + (clientY - startY)) / scale;

      // Mode: "resize" - Tells App.js to update the width/height of the snippet.
      onDrag?.(null, null, "resize", { id: snippet.id, width: newWidth, height: newHeight }); // updates App.js state
    };

    const stopResize = () => {
      window.removeEventListener("mousemove", doResize);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("touchmove", doResize);
      window.removeEventListener("touchend", stopResize);
    };

    window.addEventListener("mousemove", doResize);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("touchmove", doResize, { passive: false });
    window.addEventListener("touchend", stopResize);
  };

  // ✅ Hover state for better UX
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [tempText, setTempText] = useState(snippet.text || "");

  // Update tempText if snippet text changes from outside
  useEffect(() => {
    setTempText(snippet.text || "");
  }, [snippet.text]);

  const handleSave = () => {
    setIsEditing(false);
    if (tempText !== snippet.text) {
      onDrag?.(null, null, "edit", { id: snippet.id, text: tempText });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      setTempText(snippet.text || "");
      setIsEditing(false);
    }
  };

  return (
    <>
      <div
        ref={noteRef}
        id={`workspace-item-${snippet.id}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(); // ⭐ CRITICAL: When clicked, it calls handleNoteClick() in useConnections.js (passed via App.js)
        }}
        onContextMenu={handleContextMenu}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (snippet.type === "text" || !snippet.type) {
            setIsEditing(true);
          }
        }}
        style={{
          position: "absolute",
          left: snippet.x,
          top: snippet.y,
          background: selected ? "#d0e7ff" : (isHovered ? "#f0f8ff" : "white"),
          borderRadius: "10px",
          padding: "0.8rem",
          width: snippet.width || 180,
          height: snippet.height || "auto",
          boxShadow: selected || isHovered ? "0 4px 12px rgba(0,0,0,0.2)" : "0 2px 6px rgba(0,0,0,0.15)",
          borderLeft:
            snippet.type === "text" || !snippet.type
              ? "4px solid #007bff"
              : "4px solid #28a745",
          cursor: disableDrag ? "default" : (isEditing ? "text" : "move"),
          zIndex: selected || isHovered ? 20 : 10, // Bring to front on hover/select
          userSelect: isEditing ? "text" : "none",
          touchAction: "none",
          paddingBottom: "20px", // Extra space for handle
          paddingRight: "15px",  // Extra space for handle
          transition: "box-shadow 0.2s, background 0.2s",
          minHeight: "40px",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {isEditing ? (
          <textarea
            autoFocus
            value={tempText}
            onChange={(e) => setTempText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              resize: "none",
              fontFamily: "inherit",
              fontSize: "inherit",
              color: "inherit",
              padding: 0,
              margin: 0,
              flexGrow: 1,
              boxSizing: "border-box"
            }}
          />
        ) : snippet.type === "text" || snippet.text || !snippet.type ? (
          <p style={{ margin: 0 }}>{snippet.text || tempText}</p>
        ) : snippet.type === "image" && imgSrc ? (
          <img
            src={imgSrc}
            alt="snippet"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              pointerEvents: "none",
            }}
          />
        ) : (
          <p style={{ margin: 0, color: "#888" }}>Empty</p>
        )}

        {/* 📐 Resize Handle */}
        {!disableDrag && (selected || isHovered) && (
          <div
            onMouseDown={handleResizeMouseDown}
            onTouchStart={handleResizeMouseDown}
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: "20px",
              height: "20px",
              cursor: "nwse-resize",
              background: "#666", // Darker for visibility
              borderTopLeftRadius: "50%",
              borderBottomRightRadius: "10px",
              zIndex: 30,
            }}
            title="Resize"
          />
        )}
      </div>

      {/* ✅ Context Menu */}
      {contextMenu && (
        <ItemContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextActions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
});

export default DraggableNote;

