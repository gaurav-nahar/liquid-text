import React, { useEffect, useRef, useState } from "react";

const SAVE_STATUS_CONFIG = {
    pending: { text: "Auto saving...", color: "#f59e0b" },
    saving:  { text: "Saving...",      color: "#3b82f6" },
    saved:   { text: "Saved ✓",        color: "#10b981" },
};

export default function DocumentTabsFooter({
    documents,
    activeDocumentId,
    onSelect,
    onCreate,
    onRename,
    onDelete,
    saveStatus = "idle",
}) {
    const [editingId, setEditingId] = useState(null);
    const [draftTitle, setDraftTitle] = useState("");
    const inputRef = useRef(null);

    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingId]);

    const startRename = (documentItem) => {
        setEditingId(documentItem.id);
        setDraftTitle(documentItem.title);
    };

    const commitRename = () => {
        if (!editingId) return;
        onRename(editingId, draftTitle);
        setEditingId(null);
    };

    const statusCfg = SAVE_STATUS_CONFIG[saveStatus];

    return (
        <div className="document-tabs-footer">
            <div className="document-tabs-scroll">
                {documents.map((documentItem) => {
                    const isActive = documentItem.id === activeDocumentId;
                    const isEditing = documentItem.id === editingId;

                    return (
                        <div
                            key={documentItem.id}
                            className={`document-tab-item ${isActive ? "active" : ""}`}
                        >
                            {isEditing ? (
                                <input
                                    ref={inputRef}
                                    value={draftTitle}
                                    onChange={(event) => setDraftTitle(event.target.value)}
                                    onBlur={commitRename}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            commitRename();
                                        }
                                        if (event.key === "Escape") {
                                            setEditingId(null);
                                            setDraftTitle(documentItem.title);
                                        }
                                    }}
                                    className="document-tab-input"
                                />
                            ) : (
                                <button
                                    type="button"
                                    className="document-tab-button"
                                    onClick={() => onSelect(documentItem.id)}
                                    onDoubleClick={() => startRename(documentItem)}
                                    title={documentItem.title}
                                >
                                    {documentItem.title}
                                </button>
                            )}

                            <button
                                type="button"
                                className="document-tab-close"
                                onClick={() => onDelete(documentItem.id)}
                                title={`Delete editor page ${documentItem.title}`}
                            >
                                <i className="bi bi-x-lg" aria-hidden="true" />
                            </button>
                        </div>
                    );
                })}
            </div>

            <button
                type="button"
                className="document-tab-add"
                onClick={onCreate}
                title="Create a new editor page"
            >
                <i className="bi bi-plus-lg" aria-hidden="true" />
            </button>

            {statusCfg && (
                <div style={{
                    flexShrink: 0, fontSize: 11, fontWeight: 600, color: statusCfg.color,
                    display: "flex", alignItems: "center", gap: 4, paddingRight: 6,
                    whiteSpace: "nowrap",
                }}>
                    {(saveStatus === "saving" || saveStatus === "pending") && (
                        <span style={{
                            width: 7, height: 7, borderRadius: "50%",
                            border: `2px solid ${statusCfg.color}`,
                            borderTopColor: "transparent",
                            display: "inline-block",
                            animation: "spin 0.8s linear infinite",
                        }} />
                    )}
                    {statusCfg.text}
                </div>
            )}
        </div>
    );
}
