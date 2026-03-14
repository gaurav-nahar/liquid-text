-- create_connections_table
-- depends: 20251121_01_rJl7l-pdf_files_table

CREATE TABLE IF NOT EXISTS connections (
    id SERIAL PRIMARY KEY,
    pdf_id INTEGER NOT NULL REFERENCES pdf_files(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    meta TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);