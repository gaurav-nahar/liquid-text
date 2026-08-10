-- Persist the PDF view layout (zoom + panel widths) per case workspace,
-- so reopening the same diary_no/diary_year for the same user restores it.
-- depends: 20260604_01_add-document-shares

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS view_settings_json TEXT;
