-- create_snippets_table
-- depends: 20251204_02_Zh6oZ-create-boxes-table

CREATE TABLE IF NOT EXISTS snippets (
    id SERIAL PRIMARY KEY,
    pdf_id INTEGER NOT NULL REFERENCES pdf_files(id) ON DELETE CASCADE,
    content TEXT,
    file_data BYTEA,        -- <--- added column
    type TEXT NOT NULL,     -- 'text' or 'image'
    x REAL NOT NULL DEFAULT 0.0,
    y REAL NOT NULL DEFAULT 0.0,
    page INTEGER,
    width REAL,
    height REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
