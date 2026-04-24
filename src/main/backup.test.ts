import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Mock electron's `app.getPath('userData')` so backup.ts works in node tests.
let userDataDir: string

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => {
      if (key === 'userData') return userDataDir
      throw new Error(`Unexpected getPath key: ${key}`)
    }
  }
}))

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'tt-backup-'))
})

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  vi.resetModules()
})

async function loadBackup(): Promise<typeof import('./backup')> {
  // Re-import per test so the mocked electron is fresh.
  return await import('./backup')
}

function makeFile(path: string, content = 'x'): void {
  writeFileSync(path, content)
}

describe('createBackupSync', () => {
  it('returns null when source DB does not exist', async () => {
    const { createBackupSync } = await loadBackup()
    const missing = join(userDataDir, 'nope.sqlite')
    expect(createBackupSync(missing, 'pre-migration', 0)).toBeNull()
  })

  it('copies file to backups dir with pre-migration naming', async () => {
    const { createBackupSync, getBackupsDir } = await loadBackup()
    const src = join(userDataDir, 'src.sqlite')
    makeFile(src, 'data')
    const target = createBackupSync(src, 'pre-migration', 3)
    expect(target).not.toBeNull()
    expect(existsSync(target!)).toBe(true)
    expect(target!).toContain('backup-pre-migration-v3-')
    expect(target!.startsWith(getBackupsDir())).toBe(true)
  })
})

describe('listBackups', () => {
  it('classifies daily / manual / pre-migration / legacy', async () => {
    const { listBackups, getBackupsDir } = await loadBackup()
    const dir = getBackupsDir()
    makeFile(join(dir, 'backup-daily-2026-04-20.sqlite'))
    makeFile(join(dir, 'backup-daily-2026-04-21.sqlite'))
    makeFile(join(dir, 'backup-manual-2026-04-22T10-00-00-000Z.sqlite'))
    makeFile(join(dir, 'backup-pre-migration-v0-2026-04-23T00-00-00-000Z.sqlite'))
    makeFile(join(dir, 'pre-migration-v0-old-format.sqlite')) // legacy
    makeFile(join(dir, 'unrelated.txt'))

    const list = listBackups()
    const reasons = list.map((b) => b.reason).sort()
    expect(reasons).toEqual([
      'daily',
      'daily',
      'manual',
      'pre-migration',
      'pre-migration'
    ])
    // Newest first
    const dailies = list.filter((b) => b.reason === 'daily')
    expect(dailies[0].filename).toContain('2026-04-21')
  })

  it('returns empty array for empty backups dir', async () => {
    const { listBackups } = await loadBackup()
    expect(listBackups()).toEqual([])
  })
})

describe('rotateDailyBackups', () => {
  it('keeps last N daily backups, deletes older', async () => {
    const { rotateDailyBackups, listBackups, getBackupsDir } = await loadBackup()
    const dir = getBackupsDir()
    // 10 daily backups
    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, '0')
      makeFile(join(dir, `backup-daily-2026-04-${day}.sqlite`))
    }
    const deleted = rotateDailyBackups(7)
    expect(deleted).toHaveLength(3)
    const remaining = listBackups().filter((b) => b.reason === 'daily')
    expect(remaining).toHaveLength(7)
    // The 7 newest (04 to 10) should remain — the oldest 3 (01-03) deleted.
    expect(remaining.map((b) => b.filename).sort()).toEqual([
      'backup-daily-2026-04-04.sqlite',
      'backup-daily-2026-04-05.sqlite',
      'backup-daily-2026-04-06.sqlite',
      'backup-daily-2026-04-07.sqlite',
      'backup-daily-2026-04-08.sqlite',
      'backup-daily-2026-04-09.sqlite',
      'backup-daily-2026-04-10.sqlite'
    ])
  })

  it('never deletes manual or pre-migration backups', async () => {
    const { rotateDailyBackups, listBackups, getBackupsDir } = await loadBackup()
    const dir = getBackupsDir()
    makeFile(join(dir, 'backup-manual-2026-01-01T00-00-00-000Z.sqlite'))
    makeFile(join(dir, 'backup-pre-migration-v0-2026-01-01T00-00-00-000Z.sqlite'))
    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, '0')
      makeFile(join(dir, `backup-daily-2026-04-${day}.sqlite`))
    }
    rotateDailyBackups(2)
    const list = listBackups()
    expect(list.filter((b) => b.reason === 'manual')).toHaveLength(1)
    expect(list.filter((b) => b.reason === 'pre-migration')).toHaveLength(1)
    expect(list.filter((b) => b.reason === 'daily')).toHaveLength(2)
  })
})

describe('restoreBackup', () => {
  it('throws when backup file does not exist', async () => {
    const { restoreBackup } = await loadBackup()
    expect(() =>
      restoreBackup(join(userDataDir, 'missing.sqlite'), join(userDataDir, 'db.sqlite'))
    ).toThrow(/not found/i)
  })

  it('overwrites current DB and creates a safety copy', async () => {
    const { restoreBackup, listBackups } = await loadBackup()
    const currentDb = join(userDataDir, 'current.sqlite')
    const backup = join(userDataDir, 'backup.sqlite')
    makeFile(currentDb, 'CURRENT')
    makeFile(backup, 'BACKUP')

    const { safetyBackupPath } = restoreBackup(backup, currentDb)

    expect(existsSync(safetyBackupPath)).toBe(true)
    expect(safetyBackupPath).toContain('backup-pre-restore-')
    // Current DB now holds backup contents
    const current = require('fs').readFileSync(currentDb, 'utf-8')
    expect(current).toBe('BACKUP')
    // Safety copy holds the prior contents
    const safety = require('fs').readFileSync(safetyBackupPath, 'utf-8')
    expect(safety).toBe('CURRENT')
    // Safety is listed (mtime-based, not classified as daily)
    const list = listBackups()
    expect(list.some((b) => b.filename.startsWith('backup-pre-restore-'))).toBe(false)
    // Note: 'pre-restore' isn't classified by our listBackups schema, that's
    // intentional — pre-restore safety copies are diagnostic, not user-facing.
    // We just sanity-check the file size > 0.
    expect(statSync(safetyBackupPath).size).toBeGreaterThan(0)
  })
})
