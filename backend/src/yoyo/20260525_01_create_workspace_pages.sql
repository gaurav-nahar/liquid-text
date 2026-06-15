-- Create workspace_pages table
CREATE TABLE workspace_pages (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    client_id VARCHAR NOT NULL,
    x FLOAT NOT NULL DEFAULT 0.0,
    y FLOAT NOT NULL DEFAULT 0.0,
    width FLOAT NOT NULL DEFAULT 1100.0,
    height FLOAT NOT NULL DEFAULT 1500.0,
    color VARCHAR NOT NULL DEFAULT '#e8f3ff',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_workspace_pages_workspace_id ON workspace_pages(workspace_id);
CREATE INDEX idx_workspace_pages_client_id ON workspace_pages(client_id);
