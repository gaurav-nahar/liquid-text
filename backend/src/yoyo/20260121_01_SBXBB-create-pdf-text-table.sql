-- create pdf_text_table
-- depends: 20260116_02_aKK1X-create-workspace-table

CREATE TABLE pdf_texts (
    id SERIAL PRIMARY KEY,
    pdf_id INTEGER NOT NULL,
    page_num INTEGER NOT NULL,
    text TEXT NOT NULL,
    x_pct DOUBLE PRECISION NOT NULL,
    y_pct DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),

    CONSTRAINT fk_pdf_texts_pdf
        FOREIGN KEY (pdf_id)
        REFERENCES pdf_files(id)
        ON DELETE CASCADE
);
