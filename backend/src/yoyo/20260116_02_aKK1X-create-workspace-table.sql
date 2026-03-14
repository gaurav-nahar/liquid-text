-- create workspace table
-- depends: 20260116_01_N6T0p-alter-all-table


CREATE TABLE IF NOT EXISTS workspaces (
    id SERIAL PRIMARY KEY,
    pdf_id INTEGER NOT NULL REFERENCES pdf_files(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL DEFAULT 'Default Workspace',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);