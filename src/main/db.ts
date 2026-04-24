import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { runMigrations, MigrationError } from './migrations/runner'

let db: Database.Database

export function getDb(): Database.Database {
  if (db) return db

  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })
  const dbPath = join(userDataPath, 'timetrack.sqlite')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const result = runMigrations(db, dbPath)
  if (result.applied.length > 0) {
    console.log(
      `[db] Applied ${result.applied.length} migration(s): ${result.applied.join(', ')}`
    )
  }

  return db
}

export { MigrationError }

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
