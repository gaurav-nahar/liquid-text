import React, { useEffect, useRef, useState } from "react";
import ShareDocModal from "./ShareDocModal";

const SAVE_STATUS_CONFIG = {
    pending: { text: "Auto saving...", color: "#f59e0b" },
    saving:  { text: "Saving...",      color: "#3b82f6" },
    saved:   { text: "Saved ✓",        color: "#10b981" },
};

export default function DocumentTabsFooter({
    documents,
    activeDocumentId,
    saveStatus = "idle",
    onSelect,
    onCreate,
    onRename,
    onDelete,
}) {
    const statusCfg = SAVE_STATUS_CONFIG[saveStatus];
    const [editingId, setEditingId] = useState(null);
    const [draftTitle, setDraftTitle] = useState("");
    const [sharingDoc, setSharingDoc] = useState(null);
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

    return (
        <>
            <div className="document-tabs-footer">
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

                <div className="document-tabs-scroll">
                    {documents.map((documentItem) => {
                        const isActive = documentItem.id === activeDocumentId;
                        const isEditing = documentItem.id === editingId;
                        const isOwner = documentItem.isOwner !== false;

                        return (
                            <div
                                key={documentItem.id}
                                className={`document-tab-item ${isActive ? "active" : ""}`}
                            >
                                {/* Shared-to-me indicator */}
                                {!isOwner && (
                                    <i
                                        className="bi bi-people-fill"
                                        title={`Shared by ${documentItem.sharedBy || "someone"}`}
                                        style={{ fontSize: 10, color: "#3b82f6", marginRight: 3, flexShrink: 0 }}
                                    />
                                )}

                                {isEditing ? (
                                    <input
                                        ref={inputRef}
                                        value={draftTitle}
                                        onChange={(e) => setDraftTitle(e.target.value)}
                                        onBlur={commitRename}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                                            if (e.key === "Escape") { setEditingId(null); setDraftTitle(documentItem.title); }
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

                                {/* Share button — owner only */}
                                {isOwner && (
                                    <button
                                        type="button"
                                        className="document-tab-close"
                                        onClick={() => setSharingDoc(documentItem)}
                                        title="Share this document"
                                        style={{ color: "#6b7280" }}
                                        onMouseEnter={(e) => { e.currentTarget.style.color = "#3b82f6"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.color = "#6b7280"; }}
                                    >
                                        <i className="bi bi-share" aria-hidden="true" />
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
            </div>

            {sharingDoc && (
                <ShareDocModal
                    doc={sharingDoc}
                    onClose={() => setSharingDoc(null)}
                />
            )}
        </>
    );
}
