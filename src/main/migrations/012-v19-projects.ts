import type { Migration } from './index'

/**
 * v1.9 #75 — Projekte pro Kunde.
 *
 * Adds a `projects` table (scoped to clients via FK) and a nullable
 * `project_id` column on `entries`. Existing entries keep project_id = NULL
 * which is treated as "no project / general" by the renderer.
 *
 * Performance note (FG-3): building idx_entries_project_started scans all
 * existing entries. On large databases (50K+ entries) this may take 2-5
 * seconds during first launch after upgrade. Documented in CHANGELOG.md.
 */
export const migration012: Migration = {
  version: 12,
  name: 'v1.9-projects',
  up: `
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id   INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      color       TEXT    NOT NULL DEFAULT '',
      rate_cent   INTEGER,
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_client_active
      ON projects(client_id, active);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_unique_active_name
      ON projects(client_id, name) WHERE active = 1;

    ALTER TABLE entries ADD COLUMN project_id INTEGER
      REFERENCES projects(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_entries_project_started
      ON entries(project_id, started_at);
  `
}
