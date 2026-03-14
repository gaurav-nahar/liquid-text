import React, { useCallback, Suspense } from "react";
import InfiniteCanvas from "./InfiniteCanvas";
import DrawingCanvas from "./DrawingCanvas";
import ConnectionLines from "./ConnectionLines";
import EditableTextBoxes from "./EditableTextBoxes";
import DraggableNote from "./DraggableNote";

// Hooks
import useSnippetHandlers from "../../hooks/useSnippetHandlers";
import useBoxHandlers from "./useBoxHandlers";
import useConnections from "../../hooks/useConnections";
import { useApp } from "../../context/AppContext";
// Lazy Components
import { initGlobalTouchDrag } from "../pdf/pdfDragHandlers";
const WorkspaceSidebar = React.lazy(() => import("../layout/WorkspaceSidebar"));



/**
 * 🎨 Workspace Component
 * Encapsulates the infinite canvas and all its workspace-specific tools
 * like snippets, editable boxes, drawing canvas, and connection lines.
 */
const Workspace = () => {
    const {
        tool,
        TOOL_MODES,
        pdfId,
        activeWorkspace,
        showWorkspaceSidebar, setShowWorkspaceSidebar,
        snippets, setSnippets,
        editableBoxes, setEditableBoxes,
        connections, setConnections,
        selectedItem, setSelectedItem,
        lineStartId, setLineStartId,
        lines, setLines,
        pdfDrawingColor,
        handleDeleteSnippet,
        handleDeleteBox,
        canvasRef,
        pdfRef,
        viewStateRef,
        setIsDirty,
        recordHistory, getSnapshot,
    } = useApp();

    // 🔄 Dirty-aware setters
    const setSnippetsWithDirty = useCallback((val) => {
        setSnippets(val);
        setIsDirty(true);
    }, [setSnippets, setIsDirty]);

    const setEditableBoxesWithDirty = useCallback((val) => {
        setEditableBoxes(val);
        setIsDirty(true);
    }, [setEditableBoxes, setIsDirty]);

    const setConnectionsWithDirty = useCallback((val) => {
        setConnections(val);
        setIsDirty(true);
    }, [setConnections, setIsDirty]);

    const setLinesWithDirty = useCallback((val) => {
        setLines(val);
        setIsDirty(true);
    }, [setLines, setIsDirty]);


    //  Coordinate Helper Functions (Delegates to InfiniteCanvas)//infiniteCanvas.js
    const screenToWorld = useCallback((x, y) => {
        if (canvasRef.current) {
            return canvasRef.current.screenToWorld(x, y);
        }
        return { x, y }; // Fallback
    }, [canvasRef]);

    const getScale = useCallback(() => {
        if (canvasRef.current) {
            return canvasRef.current.getScale();
        }
        return 1; // Fallback
    }, [canvasRef]);


    // Hooks
    // Handles mouse/touch interactions in workspace (like drawing boxes). Calls UseBoxHandlers.js
    const { workspaceRef, handleMouseDown, handleMouseMove, handleMouseUp } =
        useBoxHandlers({ tool, TOOL_MODES, setEditableBoxes: setEditableBoxesWithDirty, screenToWorld, recordHistory, getSnapshot }); // useBoxHandlers.js

    //  Handles dragging items from PDF to workspace. Calls UseSnippetHandlers.js
    const { handleSnippetDrop, addSnippet } = useSnippetHandlers({ // useSnippetHandlers.js
        tool,
        TOOL_MODES,
        pdfRef,
        workspaceRef,
        setSnippets: setSnippetsWithDirty,
        setConnections: setConnectionsWithDirty, // Pass setter for link creation
        screenToWorld,
        getScale,
        recordHistory,
        getSnapshot,
    });

    //  Handles creating lines between notes. Calls UseConnections.js
    const { handleNoteClick } = useConnections({ // useConnections.js
        tool,
        TOOL_MODES,
        lineStartId,
        setLineStartId,
        connections,
        setConnections: setConnectionsWithDirty,
        pdfRef,
        snippets, // Added snippets
        setSelectedItem, // Pass setter to centralized selection
    });

    //  Links a note to highlighted text in the PDF. Calls PDFViewer.js -> getLatestSelection()
    // it is used for select multiple text from pdf and create anchor and connection
    const handleLinkBoxToSelection = useCallback((boxId) => {
        if (!pdfRef.current) return;
        const rawSelection = pdfRef.current.getLatestSelection();
        if (!rawSelection) {
            alert("first please select text from pdf!");
            return;
        }

        const selections = Array.isArray(rawSelection) ? rawSelection : [rawSelection];
        const newSnippets = [];
        const newConnections = [];

        selections.forEach(sel => {
            const anchorId = `anchor-${Date.now()}-${Math.random()}`;
            const newAnchor = {
                ...sel,
                id: anchorId,
                type: 'anchor', // CRITICAL: Identify as anchor for Bezier logic
                x: -1000, // Hide from workspace
                y: -1000,
            };
            newSnippets.push(newAnchor);
            newConnections.push({ from: String(boxId), to: String(anchorId) });
        });

        setSnippetsWithDirty((prev) => [...prev, ...newSnippets]);
        setConnectionsWithDirty((prev) => [...prev, ...newConnections]);

        // Clear selection after linking
        if (pdfRef.current.clearSelection) {
            pdfRef.current.clearSelection();
        }

        alert(`Linked ${selections.length} text snippet(s)!`);
    }, [pdfRef, setSnippetsWithDirty, setConnectionsWithDirty]);

    // 🖱️ Helper to get clean coordinates from Mouse or Touch events
    const getTouchEvent = (e) => {
        if (e && e.touches && e.touches.length > 0) {
            const t = e.touches[0];
            return { clientX: t.clientX, clientY: t.clientY };
        }
        return e;
    };

    // 📱 Global Touch Drag Listener for Images from PDF
    // Delegated to pdfDragHandlers.js to keep logic centralized as requested.
    React.useEffect(() => {
        // initGlobalTouchDrag returns a cleanup function
        return initGlobalTouchDrag(addSnippet, screenToWorld, workspaceRef);
    }, [addSnippet, screenToWorld, workspaceRef]);

    // 🖐️ Workspace gesture handlers (unified for mouse & touch)
    const handleUnifiedDown = (e) => {
        // Clear selection when clicking workspace background in SELECT mode
        if (tool === TOOL_MODES.SELECT) {
            setSelectedItem(null);
        }
        handleMouseDown(getTouchEvent(e));
    };
    const handleUnifiedMove = (e) => handleMouseMove(getTouchEvent(e));
    const handleUnifiedUp = (e) => handleMouseUp(getTouchEvent(e));

    return (
        <div
            ref={workspaceRef}
            onDrop={handleSnippetDrop} //useSnippetHandlers.js
            onDragOver={(e) => e.preventDefault()}
            onMouseDown={handleUnifiedDown} //useBoxHandlers.js
            onMouseMove={handleUnifiedMove} //useBoxHandlers.js
            onMouseUp={handleUnifiedUp} //useBoxHandlers.js
            onTouchStart={handleUnifiedDown} //useBoxHandlers.js
            onTouchMove={(e) => handleUnifiedMove(e)} //useBoxHandlers.js
            onTouchEnd={handleUnifiedUp} //useBoxHandlers.js
            className="workspace-view-container"
        >
            <button
                onClick={() => setShowWorkspaceSidebar(!showWorkspaceSidebar)}
                title="Manage Workspaces"
                style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    zIndex: 100,
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1d1d1f',
                    transition: 'all 0.2s ease'
                }}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
            </button>

            <InfiniteCanvas
                ref={canvasRef}
                className="infinite-canvas"
                style={{ width: "100%", height: "100%" }}
                key={activeWorkspace ? activeWorkspace.id : "default-canvas"}
                initialScale={(() => {
                    const s = localStorage.getItem(`view-${pdfId}-${activeWorkspace?.id}`);
                    return s ? JSON.parse(s).scale : 1;
                })()}
                initialPan={(() => {
                    const s = localStorage.getItem(`view-${pdfId}-${activeWorkspace?.id}`);
                    return s ? JSON.parse(s).pan : { x: 0, y: 0 };
                })()}
                onViewChange={(v) => { viewStateRef.current = v; }}
                panningEnabled={tool === TOOL_MODES.SELECT}
            >
                {/* Tool status hint */}
                <div style={{ position: "absolute", bottom: 20, left: 20, zIndex: 10, background: "rgb(221, 240, 212)", padding: "4px 10px", borderRadius: 6, fontSize: 12, color: "#666", pointerEvents: "none" }}>
                    {tool === TOOL_MODES.DRAW_LINE && (lineStartId ? "Pick second note" : "Pick first note")}
                    {tool === TOOL_MODES.ADD_BOX && "Drag to create text box"}
                    {tool === TOOL_MODES.PEN && "Draw freehand"}
                    {tool === TOOL_MODES.ERASER && "Erase drawings"}
                </div>

                <DrawingCanvas
                    tool={tool}
                    lines={lines}
                    setLines={setLinesWithDirty}
                    selectedColor={pdfDrawingColor}
                />

                <ConnectionLines snippets={snippets} editableBoxes={editableBoxes} connections={connections} />

                <EditableTextBoxes
                    editableBoxes={editableBoxes}
                    setEditableBoxes={setEditableBoxesWithDirty}
                    onDeleteBox={handleDeleteBox}
                    onBoxClick={handleNoteClick}
                    activeConnectionId={lineStartId}
                    selectedBoxId={selectedItem?.type === 'box' ? selectedItem.id : null}
                    onLinkToSelection={handleLinkBoxToSelection}
                    connections={connections}
                />

                <div style={{ position: "relative", flexGrow: 1, zIndex: 3 }}>
                    {snippets.filter(s => s.type !== 'anchor').map((s) => (
                        <DraggableNote
                            key={s.id ?? `${s.x}-${s.y}-${Math.random()}`}
                            snippet={s}
                            onClick={() => handleNoteClick(s)}
                            onDrag={(dx, dy, action, idOrItem) => {
                                if (action === "cut" || action === "delete") {
                                    handleDeleteSnippet(idOrItem);
                                } else if (action === "paste") {
                                    setSnippetsWithDirty((prev) => [...prev, idOrItem]);
                                } else if (action === "resize") {
                                    setSnippetsWithDirty((prev) =>
                                        prev.map((note) =>
                                            note.id === idOrItem.id ? { ...note, width: idOrItem.width, height: idOrItem.height } : note
                                        )
                                    );
                                } else if (action === "edit") {
                                    setSnippetsWithDirty((prev) =>
                                        prev.map((note) =>
                                            note.id === idOrItem.id ? { ...note, text: idOrItem.text } : note
                                        )
                                    );
                                } else if (dx !== null && dy !== null) {
                                    const sScale = canvasRef.current ? canvasRef.current.getScale() : 1;
                                    const scaledDx = dx / sScale;
                                    const scaledDy = dy / sScale;

                                    setSnippetsWithDirty((prev) =>
                                        prev.map((note) =>
                                            note.id === s.id ? { ...note, x: note.x + scaledDx, y: note.y + scaledDy } : note
                                        )
                                    );
                                }
                            }}
                            disableDrag={tool !== TOOL_MODES.SELECT}
                            selected={lineStartId === s.id || (selectedItem?.type === 'snippet' && String(selectedItem?.id) === String(s.id))}
                        />
                    ))}
                </div>
            </InfiniteCanvas>

            {
                showWorkspaceSidebar && (
                    <Suspense fallback={null}>
                        <WorkspaceSidebar />
                    </Suspense>
                )
            }
        </div>
    );
};

export default Workspace;
