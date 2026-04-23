import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

let db: Database.Database

export function getDb(): Database.Database {
  if (db) return db

  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })
  const dbPath = join(userDataPath, 'timetrack.sqlite')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  initSchema(db)
  return db
}

function initSchema(db: Database.Database): void {
  db.exec(`
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
  `)

  // Default-Settings
  const insertSetting = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
  )
  insertSetting.run('rounding_mode', 'none')
  insertSetting.run('rounding_minutes', '15')
  insertSetting.run('company_name', '')
  insertSetting.run('backup_path', '')
}

export function recoverZombieEntries(): void {
  const db = getDb()
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  db.prepare(`
    UPDATE entries
    SET stopped_at = heartbeat_at
    WHERE stopped_at IS NULL
      AND heartbeat_at IS NOT NULL
      AND heartbeat_at < ?
  `).run(fiveMinutesAgo)
  // Stop entries without any heartbeat (crashed before first heartbeat)
  db.prepare(`
    UPDATE entries
    SET stopped_at = started_at
    WHERE stopped_at IS NULL
      AND heartbeat_at IS NULL
      AND started_at < ?
  `).run(fiveMinutesAgo)
}
