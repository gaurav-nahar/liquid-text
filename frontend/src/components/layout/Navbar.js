import React from "react";
import { useApp } from "../../context/AppContext";

// Professional SVG icons
const icons = {
    select: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="13" height="13" strokeDasharray="2 2" />
            <path d="M12 12l6 6-2 1-1 2-3-9z" fill="currentColor" fillOpacity="0.1" />
        </svg>
    ),
    connection: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a3 3 0 0 0 4.54.54l3-3a3 3 0 0 0-4.24-4.24l-1.72 1.71" />
            <path d="M14 11a3 3 0 0 0-4.54-.54l-3 3a3 3 0 0 0 4.24 4.24l1.71-1.71" />
        </svg>
    ),
    textBox: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" />
            <text x="12" y="16" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="100" style={{ pointerEvents: 'none' }}>A</text>
        </svg>
    ),
    pen: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.17 3.06a2.39 2.39 0 0 0-3.39 0L5.12 15.73l-1.05 4.3 4.3-1.05L21.17 6.45a2.39 2.39 0 0 0 0-3.39z" />
            <line x1="15" y1="5" x2="19" y2="9" />
            <line x1="4" y1="20" x2="8" y2="20" />
        </svg>
    ),
    eraser: (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-eraser"
        >
            <path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" />
            <path d="m5.082 11.09 8.828 8.828" />
        </svg>

    ),
    search: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    ),
    chevronUp: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
    ),
    chevronDown: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    ),
    highlight: (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-notepad-text"
        >
            <path d="M8 2v4" />
            <path d="M12 2v4" />
            <path d="M16 2v4" />
            <rect width="16" height="18" x="4" y="4" rx="2" />
            <path d="M8 10h6" />
            <path d="M8 14h8" />
            <path d="M8 18h5" />
        </svg>
    ),
    save: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
        </svg>
    ),
    thumbnails: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
        </svg>
    ),
    textAdd: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7V4h16v3M12 4v16M9 20h6" />
        </svg>
    ),
    highlightBrush: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2v2" />
            <path d="M14 2v4" />
            <path d="M17 2a1 1 0 0 1 1 1v9H6V3a1 1 0 0 1 1-1z" />
            <path d="M6 12a1 1 0 0 0-1 1v1a2 2 0 0 0 2 2h2a1 1 0 0 1 1 1v2.9a2 2 0 1 0 4 0V17a1 1 0 0 1 1-1h2a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1" />
        </svg>
    ),
    undo: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M3 13C5.5 7.5 12 5 18 8" />
        </svg>
    ),
    redo: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M21 13C18.5 7.5 12 5 6 8" />
        </svg>
    ),
};

export default function Navbar() {
    const {
        pdfId,
        searchText, setSearchText,
        searchMatches,
        currentMatchIndex, setCurrentMatchIndex,
        tool, setTool,
        TOOL_MODES,
        savingWorkspace, savingPdf,
        allAnnotations,
        showHighlightsList, setShowHighlightsList,
        autosaveInterval, setAutosaveInterval,
        handleGlobalSave,
        pdfRef,
        handleDeleteHighlight: onDeleteHighlight,
        handleDeletePdfText: onDeletePdfText,
        handleDeletePdfDrawing: onDeletePdfDrawing,
        handleDeleteBrushHighlight: onDeleteBrushHighlight,
        pdfDrawingColor, setPdfDrawingColor,
        handleUndo, handleRedo, canUndo, canRedo,
    } = useApp();

    const onSave = handleGlobalSave;
    const selectedColor = pdfDrawingColor;
    const onColorChange = setPdfDrawingColor;

    const onJumpToHighlight = (item) => {

        // If the item has PDF coordinates, use scrollToSnippet for proper highlight rendering
        if (item.data && item.data.pageNum && item.data.xPct !== undefined) {
            pdfRef.current?.scrollToSnippet(item.data);
        } else {
            // Fallback to just scrolling to the page
            pdfRef.current?.scrollToPage(item.pageNum);
        }
        setShowHighlightsList(false);
    };

    const saving = savingWorkspace || savingPdf;
    const onToggleHighlightsLocal = () => setShowHighlightsList(!showHighlightsList);
    const onNextMatch = () => setCurrentMatchIndex(prev => (searchMatches.length ? (prev + 1) % searchMatches.length : -1));
    const onPrevMatch = () => setCurrentMatchIndex(prev => (searchMatches.length ? (prev - 1 + searchMatches.length) % searchMatches.length : -1));

    return (
        <div className="main-navbar">
            {/* LEFT SECTION (PDF TOOLS) */}
            <div className="navbar-left">
                <div className="search-container">
                    <div className="search-icon">{icons.search}</div>
                    <input
                        type="text"
                        placeholder="Search in PDF..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                    {searchText && (
                        <div className="search-controls">
                            <span className="match-count">
                                {searchMatches.length > 0 ? `${currentMatchIndex + 1} / ${searchMatches.length}` : "0/0"}
                            </span>
                            <button
                                onClick={onPrevMatch}
                                disabled={searchMatches.length === 0}
                                className="match-nav-btn"
                            >
                                {icons.chevronUp}
                            </button>
                            <button
                                onClick={onNextMatch}
                                disabled={searchMatches.length === 0}
                                className="match-nav-btn"
                            >
                                {icons.chevronDown}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* CENTER SECTION (WORKSPACE TOOLS) */}
            <div className="navbar-center">
                {/* Undo / Redo */}
                <div className="tool-group" style={{ marginRight: '8px', paddingRight: '8px', borderRight: '1px solid #eee' }}>
                    <button
                        className="tool-btn"
                        onClick={handleUndo}
                        disabled={!canUndo}
                        title="Undo (Ctrl+Z)"
                        style={{ opacity: canUndo ? 1 : 0.35 }}
                    >
                        {icons.undo}
                    </button>
                    <button
                        className="tool-btn"
                        onClick={handleRedo}
                        disabled={!canRedo}
                        title="Redo (Ctrl+Y)"
                        style={{ opacity: canRedo ? 1 : 0.35 }}
                    >
                        {icons.redo}
                    </button>
                </div>
                <div className="tool-group">
                    <button
                        className={`tool-btn ${tool === TOOL_MODES.SELECT ? "active" : ""}`}
                        onClick={() => setTool(TOOL_MODES.SELECT)}
                        title="Select Tool"
                    >
                        {icons.select}
                    </button>
                    <button
                        className={`tool-btn ${tool === TOOL_MODES.DRAW_LINE ? "active" : ""}`}
                        onClick={() => setTool(TOOL_MODES.DRAW_LINE)}
                        title="Connection Tool"
                    >
                        {icons.connection}
                    </button>
                    <button
                        className={`tool-btn ${tool === TOOL_MODES.ADD_BOX ? "active" : ""}`}
                        onClick={() => setTool(TOOL_MODES.ADD_BOX)}
                        title="Add Text Box"
                    >
                        {icons.textBox}
                    </button>
                    <button
                        className={`tool-btn ${tool === TOOL_MODES.PEN ? "active" : ""}`}
                        onClick={() => setTool(TOOL_MODES.PEN)}
                        title="Pen Tool"
                    >
                        {icons.pen}
                    </button>
                    <button
                        className={`tool-btn ${tool === TOOL_MODES.ERASER ? "active" : ""}`}
                        onClick={() => setTool(TOOL_MODES.ERASER)}
                        title="Eraser Tool"
                    >
                        {icons.eraser}
                    </button>
                    {/* Color selection dots */}
                    {(tool === TOOL_MODES.PEN) && (
                        <div className="color-picker" style={{ display: 'flex', gap: '6px', marginLeft: '10px', paddingLeft: '10px', borderLeft: '1px solid #eee' }}>
                            {['black', '#ff3b30', '#007aff', '#34c759', '#ffcc00'].map(color => (
                                <div
                                    key={color}
                                    onClick={() => onColorChange(color)}
                                    style={{
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        backgroundColor: color,
                                        cursor: 'pointer',
                                        border: selectedColor === color ? '2px solid #555' : '1px solid #ddd',
                                        transform: selectedColor === color ? 'scale(1.2)' : 'none'
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT SECTION (ACTIONS) */}
            <div className="navbar-right">
                <div style={{ position: 'relative' }}>
                    <button
                        className="tool-btn"
                        onClick={onToggleHighlightsLocal} // Fixed to use local toggle
                        title="View All Highlights"
                        style={{ marginRight: '8px' }}
                    >
                        {icons.highlight}
                    </button>

                    {/* Highlights Dropdown List */}
                    {showHighlightsList && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            width: '280px',
                            maxHeight: '400px',
                            background: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            zIndex: 1000,
                            overflowY: 'auto',
                            marginTop: '8px'
                        }}>
                            <div style={{ padding: '10px', fontWeight: '600', borderBottom: '1px solid #eee' }}>
                                All Annotations
                            </div>
                            {allAnnotations.length === 0 ? (
                                <div style={{ padding: '15px', color: '#888', textAlign: 'center' }}>No annotations yet</div>
                            ) : (
                                allAnnotations.map((item, index) => {
                                    // Determine label based on type
                                    let typeLabel = '';
                                    let deleteHandler = null;

                                    if (item.type === 'highlight') {
                                        typeLabel = 'Highlight';
                                        deleteHandler = () => onDeleteHighlight(item.id);
                                    } else if (item.type === 'text') {
                                        typeLabel = 'Text Note';
                                        deleteHandler = () => onDeletePdfText(item.id);
                                    } else if (item.type === 'drawing') {
                                        typeLabel = 'Drawing';
                                        deleteHandler = () => onDeletePdfDrawing(item.id);
                                    } else if (item.type === 'brush-highlight') {
                                        typeLabel = 'Brush Highlight';
                                        deleteHandler = () => onDeleteBrushHighlight(item.id);
                                    }

                                    return (
                                        <div
                                            key={item.id || index}
                                            onClick={() => onJumpToHighlight(item)}
                                            style={{
                                                padding: '10px 15px',
                                                borderBottom: '1px solid #f5f5f5',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '10px'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f9f9f9'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
                                                <div style={{ fontSize: '11px', color: '#007aff', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    Page {item.pageNum}
                                                    <span style={{
                                                        background: item.type === 'highlight' ? '#fff9c4' : (item.type === 'text' ? '#e3f2fd' : '#f5f5f5'),
                                                        padding: '1px 5px',
                                                        borderRadius: '3px',
                                                        fontSize: '9px',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {typeLabel}
                                                    </span>
                                                </div>
                                                <div style={{
                                                    fontSize: '13px',
                                                    color: '#333',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    marginTop: '4px',
                                                    position: 'relative'
                                                }}>
                                                    {item.type === 'highlight' || item.type === 'text' ? (() => {
                                                        const words = (item.content || "").split(/\s+/);
                                                        const isLong = words.length > 4;
                                                        const displayContent = isLong ? words.slice(0, 4).join(" ") + "..." : item.content;
                                                        return (
                                                            <div>
                                                                {displayContent}
                                                            </div>
                                                        );
                                                    })() : (
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                            <span>✏️</span> {item.content}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {/* 🗑️ Delete Button */}
                                            {deleteHandler && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteHandler(); }}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: '#ff3b30',
                                                        cursor: 'pointer',
                                                        padding: '4px',
                                                        fontSize: '16px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        opacity: 0.6,
                                                        transition: 'opacity 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                                                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0.6}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f5f5f5', padding: '2px', borderRadius: '6px', border: '1px solid #ddd' }}>
                    <select
                        id="autosave-interval-select"
                        name="autosave-interval"
                        value={autosaveInterval}
                        onChange={(e) => setAutosaveInterval(parseInt(e.target.value))}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            fontSize: '12px',
                            color: '#555',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            outline: 'none',
                            fontWeight: '500'
                        }}
                        title="Autosave Interval"
                    >
                        <option value={0}>Autosave: Off</option>
                        <option value={30000}>30s</option>
                        <option value={60000}>1m</option>
                        <option value={300000}>5m</option>
                        <option value={600000}>10m</option>
                    </select>
                    <button
                        className={`save-btn ${saving ? "saving" : ""}`}
                        onClick={onSave}
                        disabled={saving || !pdfId}
                        style={{
                            margin: 0,
                            border: 'none',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            fontSize: '13px',
                            height: 'auto'
                        }}
                    >
                        {icons.save}
                        <span>{saving ? "Saving..." : "Save"}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}