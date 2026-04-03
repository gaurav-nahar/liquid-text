-- add separate diary/case columns for iframe-driven case context
-- depends: 20260323_01_add-cross-pdf-links

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS diary_no VARCHAR;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS diary_year VARCHAR;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS establishment VARCHAR;

ALTER TABLE snippets ADD COLUMN IF NOT EXISTS diary_no VARCHAR;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS diary_year VARCHAR;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS establishment VARCHAR;

ALTER TABLE boxes ADD COLUMN IF NOT EXISTS diary_no VARCHAR;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS diary_year VARCHAR;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS establishment VARCHAR;

ALTER TABLE lines ADD COLUMN IF NOT EXISTS diary_no VARCHAR;
ALTER TABLE lines ADD COLUMN IF NOT EXISTS diary_year VARCHAR;
ALTER TABLE lines ADD COLUMN IF NOT EXISTS establishment VARCHAR;

ALTER TABLE connections ADD COLUMN IF NOT EXISTS diary_no VARCHAR;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS diary_year VARCHAR;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS establishment VARCHAR;

ALTER TABLE highlights ADD COLUMN IF NOT EXISTS diary_no VARCHAR;
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS diary_year VARCHAR;
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS establishment VARCHAR;

ALTER TABLE pdf_texts ADD COLUMN IF NOT EXISTS diary_no VARCHAR;
ALTER TABLE pdf_texts ADD COLUMN IF NOT EXISTS diary_year VARCHAR;
ALTER TABLE pdf_texts ADD COLUMN IF NOT EXISTS establishment VARCHAR;

ALTER TABLE pdf_drawing_lines ADD COLUMN IF NOT EXISTS diary_no VARCHAR;
ALTER TABLE pdf_drawing_lines ADD COLUMN IF NOT EXISTS diary_year VARCHAR;
ALTER TABLE pdf_drawing_lines ADD COLUMN IF NOT EXISTS establishment VARCHAR;

ALTER TABLE pdf_brush_highlights ADD COLUMN IF NOT EXISTS diary_no VARCHAR;
ALTER TABLE pdf_brush_highlights ADD COLUMN IF NOT EXISTS diary_year VARCHAR;
ALTER TABLE pdf_brush_highlights ADD COLUMN IF NOT EXISTS establishment VARCHAR;

ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS diary_no VARCHAR;
ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS diary_year VARCHAR;
ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS establishment VARCHAR;

CREATE INDEX IF NOT EXISTS idx_workspaces_case_fields ON workspaces(diary_no, diary_year, establishment);
CREATE INDEX IF NOT EXISTS idx_snippets_case_fields ON snippets(diary_no, diary_year, establishment);
CREATE INDEX IF NOT EXISTS idx_boxes_case_fields ON boxes(diary_no, diary_year, establishment);
CREATE INDEX IF NOT EXISTS idx_lines_case_fields ON lines(diary_no, diary_year, establishment);
CREATE INDEX IF NOT EXISTS idx_connections_case_fields ON connections(diary_no, diary_year, establishment);
CREATE INDEX IF NOT EXISTS idx_highlights_case_fields ON highlights(diary_no, diary_year, establishment);
CREATE INDEX IF NOT EXISTS idx_pdf_texts_case_fields ON pdf_texts(diary_no, diary_year, establishment);
CREATE INDEX IF NOT EXISTS idx_pdf_drawing_lines_case_fields ON pdf_drawing_lines(diary_no, diary_year, establishment);
CREATE INDEX IF NOT EXISTS idx_pdf_brush_highlights_case_fields ON pdf_brush_highlights(diary_no, diary_year, establishment);
CREATE INDEX IF NOT EXISTS idx_bookmarks_case_fields ON bookmarks(diary_no, diary_year, establishment);
