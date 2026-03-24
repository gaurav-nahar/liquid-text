import React, { useRef, useState, useEffect, memo } from "react";
import { useCanvas } from "./InfiniteCanvas";
import ItemContextMenu from "./ItemContextMenu";

/**
 * 🗒️ DraggableNote (Workspace Snippets)
 * ...
 */
const NOTE_COLORS = ['#ffffff', '#FFF9C4', '#DCEDC8', '#B3E5FC', '#F8BBD9', '#E1BEE7', '#FFE0B2'];

const DraggableNote = memo(({
  snippet,
  onClick,
  onDrag,
  selected,
  onDoubleClick,
  disableDrag = false,
  multiSelected = false,
  onColorChange,
  sourcePdfColor = null,   // color of the source PDF tab (e.g. "#3b82f6")
  sourcePdfName = null,    // name of the source PDF for badge
  onStartWire = null,      // (snippetId, clientX, clientY) => void — starts a drag wire
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
    // Ctrl/Shift+click = multi-select, don't start drag
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    onDrag?.(null, null, "drag-start");
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
    onDrag?.(null, null, "drag-start");
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
          onClick?.(e);
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
          background: multiSelected ? "#fff3cd" : (snippet.bg_color || (selected ? "#d0e7ff" : (isHovered ? "#f0f8ff" : "white"))),
          borderRadius: "10px",
          padding: "0.8rem",
          width: snippet.width || 180,
          height: snippet.height || "auto",
          boxShadow: selected || isHovered ? "0 4px 12px rgba(0,0,0,0.2)" : "0 2px 6px rgba(0,0,0,0.15)",
          borderLeft: multiSelected
            ? "4px solid #fd7e14"
            : sourcePdfColor
              ? `4px solid ${sourcePdfColor}`
              : (snippet.type === "text" || !snippet.type
                  ? "4px solid #007bff"
                  : "4px solid #28a745"),
          cursor: disableDrag ? "default" : (isEditing ? "text" : "move"),
          zIndex: selected || isHovered ? 20 : 10, // Bring to front on hover/select
          userSelect: isEditing ? "text" : "none",
          touchAction: "none",
          paddingBottom: "20px", // Extra space for handle
          paddingRight: "15px",  // Extra space for handle
          transition: "box-shadow 0.2s, background 0.2s",
          outline: multiSelected ? "2px solid #fd7e14" : "none",
          outlineOffset: "1px",
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
          <p style={{ margin: 0, color: (snippet.text || tempText) ? "inherit" : "#aaa", fontStyle: (snippet.text || tempText) ? "normal" : "italic" }}>
            {snippet.text || tempText || "Double-click to edit..."}
          </p>
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

        {/* 📄 Source PDF badge — shown on hover when snippet came from a specific PDF */}
        {sourcePdfColor && sourcePdfName && isHovered && (
          <div
            style={{
              position: "absolute", bottom: 22, right: 4,
              background: sourcePdfColor, color: "white",
              fontSize: 9, fontWeight: 700, padding: "2px 6px",
              borderRadius: 8, opacity: 0.9, pointerEvents: "none",
              maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >{sourcePdfName}</div>
        )}

        {/* ❌ Delete Button */}
        {(selected || isHovered) && (
          <div
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDrag?.(null, null, "delete", snippet.id); }}
            title="Delete"
            style={{
              position: "absolute",
              top: -8,
              right: -8,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#ff4d4f",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              zIndex: 40,
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            ×
          </div>
        )}

        {/* 🎨 Color Picker — shows when selected */}
        {selected && onColorChange && (
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: -32,
              left: 0,
              display: "flex",
              gap: 5,
              background: "white",
              padding: "4px 6px",
              borderRadius: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              zIndex: 50,
              border: "1px solid #eee",
            }}
          >
            {NOTE_COLORS.map(c => (
              <div
                key={c}
                title={c === '#ffffff' ? 'White' : c}
                onClick={e => { e.stopPropagation(); onColorChange(c); }}
                style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: c,
                  border: snippet.bg_color === c ? "2px solid #333" : "1px solid #ccc",
                  cursor: "pointer",
                  transition: "transform 0.15s",
                  transform: snippet.bg_color === c ? "scale(1.25)" : "scale(1)",
                }}
              />
            ))}
          </div>
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
              background: "#666",
              borderTopLeftRadius: "50%",
              borderBottomRightRadius: "10px",
              zIndex: 30,
            }}
            title="Resize"
          />
        )}

        {/* Wire drag handle — drag from here to connect to another note or PDF */}
        {onStartWire && isHovered && (
          <div
            title="Drag to connect"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const rect = noteRef.current?.getBoundingClientRect();
              const cx = rect ? rect.left + rect.width / 2 : e.clientX;
              const cy = rect ? rect.top + rect.height / 2 : e.clientY;
              onStartWire(snippet.id, cx, cy, e.clientX, e.clientY);
            }}
            style={{
              position: "absolute",
              top: "50%",
              right: -14,
              transform: "translateY(-50%)",
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: sourcePdfColor || "#6366f1",
              border: "2px solid white",
              boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
              cursor: "crosshair",
              zIndex: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "white",
              fontWeight: 700,
              userSelect: "none",
            }}
          >
            +
          </div>
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

