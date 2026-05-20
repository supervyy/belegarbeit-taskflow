-- =============================================================================
-- TaskFlow Database Initialization
-- =============================================================================
-- This script is executed once when the PostgreSQL container starts for the
-- first time (mounted via /docker-entrypoint-initdb.d/).
-- =============================================================================

-- Create the main task table
CREATE TABLE IF NOT EXISTS task (
    id         BIGSERIAL    PRIMARY KEY,
    title      VARCHAR(255) NOT NULL,
    status     VARCHAR(50)  NOT NULL DEFAULT 'todo',
    created_at TIMESTAMP    DEFAULT NOW()
);

-- Seed data: initial tasks for the TaskFlow demo
INSERT INTO task (title, status) VALUES
    ('Projektstruktur anlegen',  'done'),
    ('Backend implementieren',   'in_progress'),
    ('Monitoring konfigurieren', 'in_progress'),
    ('Lasttests durchführen',    'todo'),
    ('Dokumentation erstellen',  'todo')
ON CONFLICT DO NOTHING;
