-- Add workspace_pdfs table for persistent multi-PDF case workspaces
-- Make workspace pdf_id nullable to support case-level (PDF-independent) workspaces
-- depends: 20260402_01_add-case-columns

ALTER TABLE workspaces ALTER COLUMN pdf_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS workspace_pdfs (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    pdf_id BIGINT NOT NULL REFERENCES pdf_files(id) ON DELETE CASCADE,
    pdf_name VARCHAR,
    pdf_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(workspace_id, pdf_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_pdfs_workspace ON workspace_pdfs(workspace_id);
