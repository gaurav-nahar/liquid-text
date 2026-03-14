-- add_lines_table
-- depends: 20251121_02_S4WiY-create-connections-table

CREATE TABLE IF NOT EXISTS lines (
    id SERIAL PRIMARY KEY,
    pdf_id INTEGER NOT NULL REFERENCES pdf_files(id) ON DELETE CASCADE,
    points TEXT NOT NULL,
    color TEXT,
    stroke_width REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
