-- create pdfbrushhhighlight
-- depends: 20260127_01_GIIcm-create-table-pdf-drawing-line

CREATE TABLE pdf_brush_highlights (
    id SERIAL PRIMARY KEY,
    pdf_id INTEGER NOT NULL,
    page_num INTEGER NOT NULL,
    path_data TEXT NOT NULL,           -- JSON array of {xPct, yPct} points
    color TEXT NOT NULL DEFAULT '#FFEB3B',
    brush_width DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_pdf_brush_highlights_pdf
        FOREIGN KEY (pdf_id)
        REFERENCES pdf_files (id)
        ON DELETE CASCADE
);

CREATE INDEX idx_pdf_brush_highlights_pdf_id ON pdf_brush_highlights(pdf_id);
CREATE INDEX idx_pdf_brush_highlights_page_num ON pdf_brush_highlights(page_num);