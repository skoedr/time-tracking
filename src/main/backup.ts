import type Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import {
  mkdirSync,
  existsSync,
  copyFileSync,
  readdirSync,
  statSync,
  unlinkSync
} from 'fs'

export type BackupReason = 'daily' | 'manual' | 'pre-migration'

export interface BackupInfo {
  filename: string
  fullPath: string
  reason: BackupReason
  /** ISO timestamp from filename (daily) or file mtime (others). */
  createdAt: string
  sizeBytes: number
}

const DAILY_RETENTION = 7

/**
 * Naming scheme:
 *   daily         -> backup-daily-YYYY-MM-DD.sqlite
 *   manual        -> backup-manual-YYYY-MM-DDTHH-mm-ss-sssZ.sqlite
 *   pre-migration -> backup-pre-migration-v{from}-YYYY-MM-DDTHH-mm-ss-sssZ.sqlite
 *
 * Rotation only deletes `daily` backups; manual + pre-migration are kept forever.
 */

export function getBackupsDir(): string {
  const dir = join(app.getPath('userData'), 'backups')
  mkdirSync(dir, { recursive: true })
  return dir
}

function isoTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

function buildFilename(reason: BackupReason, fromVersion?: number): string {
  switch (reason) {
    case 'daily':
      return `backup-daily-${todayDate()}.sqlite`
    case 'manual':
      return `backup-manual-${isoTimestamp()}.sqlite`
    case 'pre-migration':
      return `backup-pre-migration-v${fromVersion ?? 0}-${isoTimestamp()}.sqlite`
  }
}

function classify(filename: string): BackupReason | null {
  if (filename.startsWith('backup-daily-')) return 'daily'
  if (filename.startsWith('backup-manual-')) return 'manual'
  if (filename.startsWith('backup-pre-migration-')) return 'pre-migration'
  // Legacy v1.1.0 pre-migration filename.
  if (filename.startsWith('pre-migration-')) return 'pre-migration'
  return null
}

/**
 * Create a backup using better-sqlite3's atomic backup API.
 * Safe even with concurrent writers (uses SQLite's online backup).
 */
export async function createBackup(
  db: Database.Database,
  reason: BackupReason,
  fromVersion?: number
): Promise<string> {
  const dir = getBackupsDir()
  const targetPath = join(dir, buildFilename(reason, fromVersion))
  // db.backup() returns a Promise that resolves with progress info.
  await db.backup(targetPath)
  console.log(`[backup] Created (${reason}): ${targetPath}`)
  return targetPath
}

/**
 * Synchronous backup variant for the migration runner, which runs before the
 * better-sqlite3 backup API can be used safely (we want a hard file copy of
 * the on-disk state, not a live snapshot).
 */
export function createBackupSync(
  dbPath: string,
  reason: BackupReason,
  fromVersion?: number
): string | null {
  if (!existsSync(dbPath)) return null
  const dir = getBackupsDir()
  const targetPath = join(dir, buildFilename(reason, fromVersion))
  copyFileSync(dbPath, targetPath)
  console.log(`[backup] Created sync (${reason}): ${targetPath}`)
  return targetPath
}

export function listBackups(): BackupInfo[] {
  const dir = getBackupsDir()
  const entries = readdirSync(dir)
  const result: BackupInfo[] = []
  for (const filename of entries) {
    if (!filename.endsWith('.sqlite')) continue
    const reason = classify(filename)
    if (!reason) continue
    const fullPath = join(dir, filename)
    const stat = statSync(fullPath)
    let createdAt: string
    if (reason === 'daily') {
      const m = filename.match(/(\d{4}-\d{2}-\d{2})/)
      createdAt = m ? `${m[1]}T00:00:00.000Z` : stat.mtime.toISOString()
    } else {
      createdAt = stat.mtime.toISOString()
    }
    result.push({
      filename,
      fullPath,
      reason,
      createdAt,
      sizeBytes: stat.size
    })
  }
  return result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/**
 * Keep only the last N daily backups. Manual + pre-migration are never deleted.
 */
export function rotateDailyBackups(retain = DAILY_RETENTION): string[] {
  const dailies = listBackups().filter((b) => b.reason === 'daily')
  // listBackups returns newest first; entries beyond `retain` are old.
  const toDelete = dailies.slice(retain)
  for (const b of toDelete) {
    try {
      unlinkSync(b.fullPath)
      console.log(`[backup] Rotated out: ${b.filename}`)
    } catch (err) {
      console.warn(`[backup] Could not delete ${b.filename}:`, err)
    }
  }
  return toDelete.map((b) => b.filename)
}

/**
 * Create today's daily backup if it doesn't already exist.
 * Failures are logged but never thrown — backup must not block app start.
 */
export async function runDailyBackupIfNeeded(db: Database.Database): Promise<void> {
  try {
    const today = todayDate()
    const existing = listBackups().find(
      (b) => b.reason === 'daily' && b.filename.includes(today)
    )
    if (existing) return
    await createBackup(db, 'daily')
    rotateDailyBackups()
  } catch (err) {
    console.warn('[backup] Daily backup failed (non-fatal):', err)
  }
}

/**
 * Restore a backup file over the current DB. Caller is responsible for closing
 * the existing DB handle and prompting the user to restart the app.
 *
 * Before overwriting, a safety copy of the current DB is created so the user
 * can roll back if the chosen backup turns out to be worse than the current
 * state.
 */
export function restoreBackup(
  backupPath: string,
  currentDbPath: string
): { safetyBackupPath: string } {
  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`)
  }
  // Safety copy of the current DB before destruction.
  const dir = getBackupsDir()
  const safetyName = `backup-pre-restore-${isoTimestamp()}.sqlite`
  const safetyBackupPath = join(dir, safetyName)
  if (existsSync(currentDbPath)) {
    copyFileSync(currentDbPath, safetyBackupPath)
  }
  copyFileSync(backupPath, currentDbPath)
  console.log(`[backup] Restored ${backupPath} -> ${currentDbPath}`)
  return { safetyBackupPath }
}
