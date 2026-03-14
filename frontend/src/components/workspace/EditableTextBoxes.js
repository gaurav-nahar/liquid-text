import { useCanvas } from "./InfiniteCanvas"; // Ensure useCanvas is exported
import React, { useState, useCallback, memo, useRef } from "react";
import ItemContextMenu from "./ItemContextMenu";
const SingleBox = memo(({
  box,
  onDrag,
  onResize,
  onChange,
  onContextMenu,
  onBoxClick, // handleNoteClick in useConnections.js
  isSelected,
  isSelectedForConn,
  hasConnection
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const boxRef = useRef();
  const textareaRef = useRef();
  const pos = useRef({ x: 0, y: 0 });
  const pressTimer = useRef(null); // Timer for long press
  const isMoved = useRef(false); // Track if user is dragging
  const startPos = useRef({ x: 0, y: 0 }); // Track starting position for movement threshold
  const { getScale } = useCanvas();


   const handleDoubleClick = (e) => {
    e.stopPropagation();
    if (!isEditing) {
      setIsEditing(true);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };
  // 🖱️ Interaction Handlers
  const handlePressStart = (e) => {
    // ✋ Prevent canvas from panning when interacting with this box
    e.stopPropagation();

    // Only prevent default for left clicks/touches to allow context menu to work normally
    if (e.button === 0 || e.touches) {
      // e.preventDefault(); // Don't do this yet, might block context menu
    }

    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;

    pos.current = { x: clientX, y: clientY };
    startPos.current = { x: clientX, y: clientY };
    isMoved.current = false;

    // Start long press timer
    if (!isEditing) {
      pressTimer.current = setTimeout(() => {
        if (!isMoved.current) {
          // Long press triggered
          onContextMenu(e, box.id);
          // setIsEditing(true);
          // setTimeout(() => textareaRef.current?.focus(), 50);
          pressTimer.current = null;
        }
      }, 500);
    }

    const handleMove = (moveEvent) => {
      // ✋ Stop canvas pan during movement
      moveEvent.stopPropagation();
      moveEvent.preventDefault();

      const curX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      const curY = moveEvent.clientY ?? moveEvent.touches?.[0]?.clientY;

      // Calculate distance from start to see if it's a "move"
      const dist = Math.sqrt(Math.pow(curX - startPos.current.x, 2) + Math.pow(curY - startPos.current.y, 2));
      if (dist > 5) {
        isMoved.current = true;
        if (pressTimer.current) {
          clearTimeout(pressTimer.current);
          pressTimer.current = null;
        }
      }

      const scale = getScale();
      const dx = (curX - pos.current.x) / scale;
      const dy = (curY - pos.current.y) / scale;
      pos.current = { x: curX, y: curY };

      if (isMoved.current && !isEditing) {
        onDrag(box.id, dx, dy);
      }
    };

    const stopInteraction = (endEvent) => {
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;

        // If not moved and released within 500ms, it's a one-tap
        if (!isMoved.current && !isEditing) {
          onBoxClick?.(box);
        }
      }

      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", stopInteraction);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", stopInteraction);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", stopInteraction);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", stopInteraction);
  };

  // 📐 Resize Handlers
  const startResize = (e) => {
    e.stopPropagation();
    const startX = e.clientX ?? e.touches?.[0]?.clientX;
    const startY = e.clientY ?? e.touches?.[0]?.clientY;
    const startWidth = box.width || 160;
    const startHeight = box.height || 80;
    const scale = getScale();

    const doResize = (moveEvent) => {
      const curX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      const curY = moveEvent.clientY ?? moveEvent.touches?.[0]?.clientY;
      const deltaX = (curX - startX) / scale;
      const deltaY = (curY - startY) / scale;

      const newWidth = Math.max(50, startWidth + deltaX);
      const newHeight = Math.max(50, startHeight + deltaY);
      onResize(box.id, newWidth, newHeight);
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

  return (
    <div
      ref={boxRef}
      id={`workspace-item-${box.id}`}
      onMouseDown={handlePressStart}
      onTouchStart={handlePressStart}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, box.id);
      }}
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width || 160,
        height: box.height || 80,
        zIndex: (isSelected || isSelectedForConn) ? 20 : 10,
        border: isSelectedForConn
          ? "3px solid #007bff"
          : isSelected
            ? "2px solid #007bff"
            : "1px solid #ccc",
        borderRadius: 8,
        background: isSelectedForConn ? "#f0f7ff" : "white",
        boxShadow: (isSelectedForConn || isSelected)
          ? "0 4px 12px rgba(0,0,0,0.2)"
          : "0 2px 6px rgba(0,0,0,0.15)",
        cursor: isEditing ? "default" : "move",
        userSelect: "none",
        touchAction: "none",
      }}

    >
      <div style={{
        position: "absolute",
        top: -10,
        right: -10,
        display: hasConnection ? "flex" : "none",
        background: "#007bff",
        color: "white",
        borderRadius: "50%",
        width: 20,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        zIndex: 30,
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        cursor: "pointer",
        pointerEvents: "auto"
      }} onClick={(e) => { e.stopPropagation(); onBoxClick?.(box); }}>
        🔗
      </div>

      <textarea
        ref={textareaRef}
        id={`text-box-input-${box.id}`}
        name="text-box-content"
        value={box.text}
        onChange={(e) => onChange(box.id, e.target.value)}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.target.blur();
          }
        }}
        onMouseDown={(e) => isEditing && e.stopPropagation()}
        style={{
          width: "100%",
          height: "100%",
          resize: "none",
          border: "none",
          outline: "none",
          fontSize: "14px",
          background: "transparent",
          padding: 6,
          cursor: isEditing ? "text" : "move",
          pointerEvents: isEditing ? "auto" : "none", // Prevent textarea from blocking div clicks when not editing
        }}
      />

      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        onTouchStart={startResize}
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: 15,
          height: 15,
          cursor: "nwse-resize",
          background: "rgba(0,0,0,0.1)",
          borderBottomRightRadius: 8,
          clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
          touchAction: "none",
        }}
      />
    </div>
  );
});

const EditableTextBoxes = memo(({
  editableBoxes,
  onDeleteBox, // handleDeleteBox in App.js
  onBoxClick, // handleNoteClick in useConnections.js
  activeConnectionId,
  selectedBoxId: propSelectedBoxId, // From App.js
  onLinkToSelection, // handleLinkBoxToSelection in App.js
  connections = [],
  setEditableBoxes // state update in App.js
}) => {
  const [contextMenu, setContextMenu] = useState(null);
  const [localSelectedBoxId, setLocalSelectedBoxId] = useState(null);

  const selectedBoxId = propSelectedBoxId || localSelectedBoxId;

  const handleContextMenu = useCallback((e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setLocalSelectedBoxId(id);
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCopy = useCallback(() => {
    const box = editableBoxes.find((b) => b.id === selectedBoxId);
    if (box) localStorage.setItem("globalClipboard", JSON.stringify({ ...box, itemType: 'box' }));
    setContextMenu(null);
  }, [editableBoxes, selectedBoxId]);

  const handleCut = useCallback(() => {
    const box = editableBoxes.find((b) => b.id === selectedBoxId);
    if (box) {
      localStorage.setItem("globalClipboard", JSON.stringify({ ...box, itemType: 'box' }));
      onDeleteBox(selectedBoxId); // call handleDeleteBox in App.js
    }
    setContextMenu(null);
  }, [selectedBoxId, editableBoxes, onDeleteBox]);

  const handleDelete = useCallback(() => {
    if (selectedBoxId) {
      onDeleteBox(selectedBoxId); // call handleDeleteBox in App.js
    }
    setContextMenu(null);
  }, [selectedBoxId, onDeleteBox]);

  const handlePaste = useCallback(() => {
    const data = localStorage.getItem("globalClipboard");
    if (data) {
      const item = JSON.parse(data);
      const id = `pasted-${Date.now()}`;
      const newItem = {
        ...item,
        id,
        x: (item.x || 100) + 30,
        y: (item.y || 100) + 30,
      };
      setEditableBoxes((prev) => [...prev, newItem]); // updates state in App.js
    }
    setContextMenu(null);
  }, [setEditableBoxes]);

  const handleChange = useCallback((id, text) => {
    setEditableBoxes((prev) => // updates state in App.js
      prev.map((b) => (b.id === id ? { ...b, text } : b))
    );
  }, [setEditableBoxes]);

  const handleDrag = useCallback((id, dx, dy) => {
    setEditableBoxes((prev) => // updates state in App.js
      prev.map((b) => (b.id === id ? { ...b, x: b.x + dx, y: b.y + dy } : b))
    );
  }, [setEditableBoxes]);

  const handleResize = useCallback((id, width, height) => {
    setEditableBoxes((prev) => // updates state in App.js
      prev.map((b) => (b.id === id ? { ...b, width, height } : b))
    );
  }, [setEditableBoxes]);

  const contextActions = [
    { label: 'Copy', icon: '📋', onClick: handleCopy },
    { label: 'Cut', icon: '✂️', onClick: handleCut },
    { label: 'Paste', icon: '📥', onClick: handlePaste },
    {
      label: 'Link to PDF Selection',
      icon: '🔗',
      onClick: () => onLinkToSelection(selectedBoxId)
    },
    { label: 'Delete', icon: '🗑', onClick: handleDelete, danger: true },
  ];


  return (
    <>
      {editableBoxes.map((b) => (
        <SingleBox
          key={b.id}
          box={b}
          onDrag={handleDrag}
          onResize={handleResize}
          onChange={handleChange}
          onContextMenu={handleContextMenu}
          onBoxClick={onBoxClick}
          isSelected={selectedBoxId === b.id}
          isSelectedForConn={String(activeConnectionId) === String(b.id)}
          hasConnection={connections.some(c => String(c.from) === String(b.id) || String(c.to) === String(b.id))}
        />
      ))}

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

export default EditableTextBoxes;