-- document sharing: allow a doc owner to share with other users (async edit, last-write-wins)
-- depends: 20260405_01_create-documentation-pages-table

CREATE TABLE IF NOT EXISTS document_shares (
    id          SERIAL PRIMARY KEY,
    doc_id      VARCHAR NOT NULL REFERENCES documentation_pages(id) ON DELETE CASCADE,
    shared_by   VARCHAR NOT NULL,
    shared_with VARCHAR NOT NULL,
    permission  VARCHAR NOT NULL DEFAULT 'edit',
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(doc_id, shared_with)
);

CREATE INDEX IF NOT EXISTS idx_document_shares_doc    ON document_shares(doc_id);
CREATE INDEX IF NOT EXISTS idx_document_shares_with   ON document_shares(shared_with);

-- track who last saved a doc (needed for last-write-wins UX display)
ALTER TABLE documentation_pages
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR;
