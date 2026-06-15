import React from "react";
import LexicalEditor from "./LexicalEditor";
import DocumentTabsFooter from "./DocumentTabsFooter";

const SAVE_STATUS_CONFIG = {
    pending: { text: "Auto saving...", color: "#f59e0b" },
    saving:  { text: "Saving...",      color: "#3b82f6" },
    saved:   { text: "Saved ✓",        color: "#10b981" },
};

export default function DocumentationPanel({
    documents,
    activeDocumentId,
    onSelectDocument,
    onCreateDocument,
    onRenameDocument,
    onDeleteDocument,
    onUpdateDocumentContent,
    saveStatus = "idle",
}) {
    const activeDocument =
        documents.find((documentItem) => documentItem.id === activeDocumentId) ||
        documents[0] ||
        null;

    const statusCfg = SAVE_STATUS_CONFIG[saveStatus];

    return (
        <div className="documentation-panel">
            <DocumentTabsFooter
                documents={documents}
                activeDocumentId={activeDocumentId}
                onSelect={onSelectDocument}
                onCreate={onCreateDocument}
                onRename={onRenameDocument}
                onDelete={onDeleteDocument}
                saveStatus={saveStatus}
            />

            <div className="documentation-body">
                {activeDocument && (
                    <LexicalEditor
                        key={activeDocument.id}
                        documentId={activeDocument.id}
                        initialState={activeDocument.content}
                        onChange={(nextState) =>
                            onUpdateDocumentContent(activeDocument.id, nextState)
                        }
                    />
                )}
            </div>
        </div>
    );
}
