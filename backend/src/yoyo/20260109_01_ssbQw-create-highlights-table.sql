-- create highlights table
-- depends: 20251218_01_EzXM1-add-column-in-snippet

CREATE TABLE highlights (
    id SERIAL PRIMARY KEY,
    pdf_id INTEGER NOT NULL REFERENCES pdf_files(id) ON DELETE CASCADE,
    page_num INTEGER NOT NULL,
    color TEXT NOT NULL,
    x_pct FLOAT NOT NULL,
    y_pct FLOAT NOT NULL,
    width_pct FLOAT NOT NULL,
    height_pct FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX ix_highlights_id ON highlights (id);
CREATE INDEX ix_highlights_pdf_id ON highlights (pdf_id);