import React from "react";
import LexicalEditor from "./LexicalEditor";
import DocumentTabsFooter from "./DocumentTabsFooter";

export default function DocumentationPanel({
    documents,
    activeDocument,
    activeDocumentId,
    onSelectDocument,
    onCreateDocument,
    onRenameDocument,
    onDeleteDocument,
    onUpdateDocumentContent,
}) {
    return (
        <div className="documentation-panel">
            <div className="documentation-header">
                <div>
                    <div className="documentation-eyebrow">Text editor</div>
                    <h2>{activeDocument?.title || "Untitled Document"}</h2>
                </div>
            </div>

            <DocumentTabsFooter
                documents={documents}
                activeDocumentId={activeDocumentId}
                onSelect={onSelectDocument}
                onCreate={onCreateDocument}
                onRename={onRenameDocument}
                onDelete={onDeleteDocument}
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
