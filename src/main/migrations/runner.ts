import type Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, copyFileSync, existsSync } from 'fs'
import { migrations, type Migration } from './index'

const SCHEMA_VERSION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`

export interface MigrationResult {
  applied: number[]
  backupPath: string | null
}

/**
 * Apply all pending migrations in a single atomic flow.
 *
 * - Creates `schema_version` if missing.
 * - Determines current version (MAX(version) or 0).
 * - If pending migrations exist: writes a pre-migration backup.
 * - Each migration runs in its own transaction. On failure: rollback,
 *   restore backup, rethrow. The app must NOT continue with a partially
 *   migrated database.
 */
export function runMigrations(db: Database.Database, dbPath: string): MigrationResult {
  db.exec(SCHEMA_VERSION_TABLE)

  const currentVersion = getCurrentVersion(db)
  const pending = migrations.filter((m) => m.version > currentVersion)

  if (pending.length === 0) {
    return { applied: [], backupPath: null }
  }

  const backupPath = createPreMigrationBackup(dbPath, currentVersion)
  const applied: number[] = []

  for (const migration of pending) {
    try {
      applyMigration(db, migration)
      applied.push(migration.version)
      console.log(`[migrations] Applied #${migration.version} (${migration.name})`)
    } catch (err) {
      console.error(
        `[migrations] FAILED #${migration.version} (${migration.name}):`,
        err
      )
      restoreBackup(backupPath, dbPath)
      throw new MigrationError(migration, err as Error, backupPath)
    }
  }

  return { applied, backupPath }
}

function getCurrentVersion(db: Database.Database): number {
  const row = db
    .prepare('SELECT MAX(version) as v FROM schema_version')
    .get() as { v: number | null }
  return row.v ?? 0
}

function applyMigration(db: Database.Database, m: Migration): void {
  const tx = db.transaction(() => {
    db.exec(m.up)
    db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(
      m.version,
      m.name
    )
  })
  tx()
}

function createPreMigrationBackup(dbPath: string, fromVersion: number): string {
  if (!existsSync(dbPath)) {
    // Fresh install — nothing to back up. Return placeholder path.
    return ''
  }
  const backupsDir = join(app.getPath('userData'), 'backups')
  mkdirSync(backupsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(
    backupsDir,
    `pre-migration-v${fromVersion}-${ts}.sqlite`
  )
  copyFileSync(dbPath, backupPath)
  console.log(`[migrations] Pre-migration backup: ${backupPath}`)
  return backupPath
}

function restoreBackup(backupPath: string, dbPath: string): void {
  if (!backupPath || !existsSync(backupPath)) {
    console.warn('[migrations] No backup to restore (likely fresh install).')
    return
  }
  try {
    copyFileSync(backupPath, dbPath)
    console.log(`[migrations] Restored DB from backup: ${backupPath}`)
  } catch (err) {
    console.error('[migrations] Backup restore FAILED:', err)
  }
}

export class MigrationError extends Error {
  constructor(
    public readonly migration: Migration,
    public readonly cause: Error,
    public readonly backupPath: string
  ) {
    super(
      `Migration #${migration.version} (${migration.name}) failed: ${cause.message}`
    )
    this.name = 'MigrationError'
  }
}
