import type { Migration } from './index'

/**
 * v1.0.0 baseline schema. Idempotent (CREATE IF NOT EXISTS, INSERT OR IGNORE)
 * so it runs safely on existing v1.0 installs as well as fresh ones.
 */
export const migration001: Migration = {
  version: 1,
  name: 'initial',
  up: `
    CREATE TABLE IF NOT EXISTS clients (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      color     TEXT NOT NULL DEFAULT '#6366f1',
      active    INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entries (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      description  TEXT NOT NULL DEFAULT '',
      started_at   TEXT NOT NULL,
      stopped_at   TEXT,
      heartbeat_at TEXT,
      rounded_min  INTEGER,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_entries_client_started
      ON entries(client_id, started_at);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('rounding_mode', 'none');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('rounding_minutes', '15');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('company_name', '');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('backup_path', '');
  `
}
