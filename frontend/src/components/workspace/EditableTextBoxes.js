import { useCanvas } from "./InfiniteCanvas"; // Ensure useCanvas is exported
import React, { useState, useCallback, memo, useRef, useEffect } from "react";
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
  hasConnection,
  isMultiSelected = false,
  onMultiSelect,
  onDelete
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [textAlign, setTextAlign] = useState("left");   // stored in React state → applied via JSX, survives re-renders
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const boxRef = useRef();
  const textareaRef = useRef();
  const isEditingRef = useRef(false);

  // Font size: called from custom dropdown buttons using onMouseDown+preventDefault
  // Focus stays in contentEditable so execCommand works immediately
  const applyFontSize = (sizePx) => {
    document.execCommand('fontSize', false, '7');
    textareaRef.current?.querySelectorAll('[size="7"]').forEach(el => {
      el.removeAttribute('size');
      el.style.fontSize = sizePx + 'px';
    });
    setShowSizeMenu(false);
  };

  // Keep ref in sync for use in effects that shouldn't re-run on isEditing change
  useEffect(() => { isEditingRef.current = isEditing; }, [isEditing]);

  // Sync box.text → innerHTML when content changes externally (load/undo) but not while user is typing
  useEffect(() => {
    if (textareaRef.current && !isEditingRef.current) {
      textareaRef.current.innerHTML = box.text || '';
    }
  }, [box.text]);

  // Block wheel events from reaching InfiniteCanvas's native listener
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const stop = (e) => e.stopPropagation();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);
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
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
        e.stopPropagation();
        onMultiSelect?.(box.id);
        return;
    }
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
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          e.stopPropagation();
          onMultiSelect?.(box.id);
        }
      }}
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
        border: isMultiSelected
          ? "2px solid #fd7e14"
          : (isSelectedForConn
              ? "3px solid #007bff"
              : isSelected
                  ? "2px solid #007bff"
                  : "1px solid #ccc"),
        borderRadius: 8,
        background: isMultiSelected ? "#fff3cd" : (isSelectedForConn ? "#f0f7ff" : "white"),
        boxShadow: (isSelectedForConn || isSelected)
          ? "0 4px 12px rgba(0,0,0,0.2)"
          : "0 2px 6px rgba(0,0,0,0.15)",
        cursor: isEditing ? "default" : "move",
        userSelect: "none",
        touchAction: "none",
        overflow: "visible",
      }}
      onWheel={(e) => e.stopPropagation()}

    >
      {/* ❌ Delete Button — corner badge outside the box */}
      {(isSelected || isMultiSelected) && !isEditing && (
        <div
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete?.(box.id); }}
          title="Delete"
          style={{
            position: "absolute", top: -9, right: -9,
            width: 20, height: 20, borderRadius: "50%",
            background: "#ff4d4f", color: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
            zIndex: 60, boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            lineHeight: 1, userSelect: "none",
          }}
        >
          ×
        </div>
      )}

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

      {/* Formatting toolbar — visible when editing */}
      {isEditing && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: -46, left: 0,
            display: "flex", alignItems: "center", gap: 1, padding: "5px 10px",
            background: "rgba(22,22,26,0.95)", borderRadius: 10,
            zIndex: 100, whiteSpace: "nowrap",
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            minWidth: "max-content",
          }}
        >
          {/* Font size — custom button dropdown (keeps focus in contentEditable) */}
          <div style={{ position: "relative" }}>
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowSizeMenu(v => !v); }}
              title="Font size"
              style={{
                background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 5, color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: 600,
                padding: "3px 7px", cursor: "pointer", lineHeight: 1.4, minWidth: 36,
              }}
            >px</button>
            {showSizeMenu && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: "absolute", top: "calc(100% + 5px)", left: 0,
                  background: "rgba(22,22,26,0.98)", borderRadius: 8,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                  display: "grid", gridTemplateColumns: "1fr 1fr",
                  gap: 2, padding: 6, zIndex: 200, minWidth: 80,
                }}
              >
                {[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36].map(s => (
                  <button
                    key={s}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); applyFontSize(s); }}
                    style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      color: "rgba(255,255,255,0.85)", padding: "4px 6px",
                      borderRadius: 4, fontSize: 11, fontWeight: 500, textAlign: "center",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Separator */}
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />

          {/* Text style buttons — B I U */}
          {[
            { cmd: "bold",      label: "B", style: { fontWeight: 800, fontSize: 14 } },
            { cmd: "italic",    label: "I", style: { fontStyle: "italic", fontSize: 14 } },
            { cmd: "underline", label: "U", style: { textDecoration: "underline", fontSize: 14 } },
          ].map(({ cmd, label, style }) => (
            <button
              key={cmd}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); document.execCommand(cmd); }}
              title={cmd.charAt(0).toUpperCase() + cmd.slice(1)}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.9)", padding: "4px 9px",
                borderRadius: 5, lineHeight: 1.4, ...style,
              }}
            >{label}</button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />

          {/* List buttons */}
          {[
            { cmd: "insertOrderedList",
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10H6"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1.5"/></svg>,
              title: "Numbered list" },
            { cmd: "insertUnorderedList",
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>,
              title: "Bullet list" },
          ].map(({ cmd, icon, title }) => (
            <button
              key={cmd}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); document.execCommand(cmd); }}
              title={title}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.9)", padding: "4px 8px",
                borderRadius: 5, display: "flex", alignItems: "center",
              }}
            >{icon}</button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />

          {/* Alignment — stored in React state, applied via JSX style on the contentEditable div */}
          {[
            { align: "left",
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>,
              title: "Align left" },
            { align: "center",
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>,
              title: "Align center" },
            { align: "right",
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>,
              title: "Align right" },
          ].map(({ align, icon, title }) => (
            <button
              key={align}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setTextAlign(align); }}
              title={title}
              style={{
                background: textAlign === align ? "rgba(255,255,255,0.15)" : "transparent",
                border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.9)", padding: "4px 8px",
                borderRadius: 5, display: "flex", alignItems: "center",
              }}
            >{icon}</button>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />

          {/* Text color */}
          <label
            title="Text color"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            style={{ display: "flex", alignItems: "center", cursor: "pointer", padding: "4px 6px", gap: 3 }}
          >
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>A</span>
            <input
              type="color"
              defaultValue="#000000"
              onChange={(e) => { document.execCommand("foreColor", false, e.target.value); textareaRef.current?.focus(); }}
              style={{ width: 16, height: 16, border: "none", padding: 0, cursor: "pointer", borderRadius: 3 }}
            />
          </label>
        </div>
      )}

      {/* Inner clip wrapper — clips content to box bounds */}
      <div style={{
        position: "absolute", inset: 0,
        borderRadius: 8, overflow: "hidden",
        pointerEvents: "none",
      }}>
        <div
          ref={textareaRef}
          id={`text-box-input-${box.id}`}
          contentEditable={isEditing}
          suppressContentEditableWarning
          onFocus={() => setIsEditing(true)}
          onBlur={() => { setIsEditing(false); setShowSizeMenu(false); }}
          onInput={(e) => onChange(box.id, e.currentTarget.innerHTML)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.currentTarget.blur();
            }
            e.stopPropagation();
          }}
          onMouseDown={(e) => isEditing && e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            outline: "none",
            fontSize: "14px",
            background: "transparent",
            padding: 6,
            overflowY: "auto",
            overflowX: "hidden",
            cursor: isEditing ? "text" : "move",
            pointerEvents: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: "#ccc transparent",
            boxSizing: "border-box",
            wordBreak: "break-word",
            textAlign,
          }}
        />
      </div>

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
  setEditableBoxes, // state update in App.js
  multiSelectedIds = [],
  onMultiSelect,
  onBoxDrag
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
    if (onBoxDrag) {
      onBoxDrag(id, dx, dy);
    } else {
      setEditableBoxes((prev) =>
        prev.map((b) => (b.id === id ? { ...b, x: b.x + dx, y: b.y + dy } : b))
      );
    }
  }, [setEditableBoxes, onBoxDrag]);

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
          isMultiSelected={multiSelectedIds.includes(String(b.id))}
          onMultiSelect={onMultiSelect}
          onDelete={onDeleteBox}
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