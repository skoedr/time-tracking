import { ipcMain, shell } from 'electron'
import { app } from 'electron'
import { getDb, getDbPath } from './db'
import { getBackupsDir } from './backup'
import { createBackup, listBackups, restoreBackup as restoreBackupFile } from './backup'
import type {
  Client,
  Entry,
  CreateClientInput,
  UpdateClientInput,
  CreateEntryInput,
  UpdateEntryInput,
  MonthQuery,
  Settings,
  IpcResult,
  BackupInfo
} from '../shared/types'

export interface IpcHooks {
  refreshTrayClients(): void
  setHotkey(accelerator: string): boolean
  setAutoStart(enabled: boolean): void
  setIdleThreshold(minutes: number): void
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}
function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: String(error) }
}

export function registerIpcHandlers(hooks: IpcHooks): void {
  const db = getDb()

  // ── Clients ──────────────────────────────────────────────────
  ipcMain.handle('clients:getAll', (): IpcResult<Client[]> => {
    try {
      const rows = db.prepare(`SELECT * FROM clients ORDER BY name ASC`).all() as Client[]
      return ok(rows)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('clients:create', (_e, input: CreateClientInput): IpcResult<Client> => {
    try {
      const info = db
        .prepare(`INSERT INTO clients (name, color) VALUES (?, ?)`)
        .run(input.name.trim(), input.color)
      const row = db
        .prepare(`SELECT * FROM clients WHERE id = ?`)
        .get(info.lastInsertRowid) as Client
      hooks.refreshTrayClients()
      return ok(row)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('clients:update', (_e, input: UpdateClientInput): IpcResult<Client> => {
    try {
      db.prepare(`UPDATE clients SET name = ?, color = ?, active = ? WHERE id = ?`).run(
        input.name.trim(),
        input.color,
        input.active,
        input.id
      )
      const row = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(input.id) as Client
      hooks.refreshTrayClients()
      return ok(row)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('clients:delete', (_e, id: number): IpcResult<void> => {
    try {
      db.prepare(`DELETE FROM clients WHERE id = ?`).run(id)
      hooks.refreshTrayClients()
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  // ── Entries ───────────────────────────────────────────────────
  ipcMain.handle('entries:start', (_e, input: CreateEntryInput): IpcResult<Entry> => {
    try {
      // Stop any currently running entry first
      db.prepare(`UPDATE entries SET stopped_at = ? WHERE stopped_at IS NULL`).run(
        new Date().toISOString()
      )
      const info = db
        .prepare(
          `INSERT INTO entries (client_id, description, started_at, heartbeat_at)
           VALUES (?, ?, ?, ?)`
        )
        .run(input.client_id, input.description, input.started_at, input.started_at)
      const row = db
        .prepare(`SELECT * FROM entries WHERE id = ?`)
        .get(info.lastInsertRowid) as Entry
      return ok(row)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('entries:stop', (_e, id: number): IpcResult<Entry> => {
    try {
      const now = new Date().toISOString()
      db.prepare(`UPDATE entries SET stopped_at = ?, heartbeat_at = ? WHERE id = ?`).run(
        now,
        now,
        id
      )
      const row = db.prepare(`SELECT * FROM entries WHERE id = ?`).get(id) as Entry
      return ok(row)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('entries:heartbeat', (_e, id: number): IpcResult<void> => {
    try {
      db.prepare(`UPDATE entries SET heartbeat_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        id
      )
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('entries:getRunning', (): IpcResult<Entry | null> => {
    try {
      const row =
        (db
          .prepare(
            `SELECT * FROM entries WHERE stopped_at IS NULL ORDER BY started_at DESC LIMIT 1`
          )
          .get() as Entry) ?? null
      return ok(row)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('entries:getByMonth', (_e, query: MonthQuery): IpcResult<Entry[]> => {
    try {
      const start = `${query.year}-${String(query.month).padStart(2, '0')}-01T00:00:00.000Z`
      const nextMonth = query.month === 12 ? 1 : query.month + 1
      const nextYear = query.month === 12 ? query.year + 1 : query.year
      const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000Z`
      const rows = db
        .prepare(
          `SELECT * FROM entries WHERE started_at >= ? AND started_at < ? ORDER BY started_at ASC`
        )
        .all(start, end) as Entry[]
      return ok(rows)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('entries:update', (_e, input: UpdateEntryInput): IpcResult<Entry> => {
    try {
      db.prepare(
        `UPDATE entries SET client_id = ?, description = ?, started_at = ?, stopped_at = ? WHERE id = ?`
      ).run(input.client_id, input.description, input.started_at, input.stopped_at, input.id)
      const row = db.prepare(`SELECT * FROM entries WHERE id = ?`).get(input.id) as Entry
      return ok(row)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('entries:delete', (_e, id: number): IpcResult<void> => {
    try {
      db.prepare(`DELETE FROM entries WHERE id = ?`).run(id)
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  // ── Dashboard ─────────────────────────────────────────────────
  // Sum of today's tracked seconds, including the running entry up to now.
  // Cross-midnight: a running entry started yesterday is counted via the
  // `stopped_at IS NULL` branch (E7 in v1.2 plan) so the tray total never
  // shows 0h while a 6h timer is visibly running.
  ipcMain.handle('dashboard:todayTotal', (): IpcResult<number> => {
    try {
      const row = db
        .prepare(
          `SELECT COALESCE(SUM(
             CASE
               WHEN stopped_at IS NULL
                 THEN (julianday('now') - julianday(started_at)) * 86400
               ELSE (julianday(stopped_at) - julianday(started_at)) * 86400
             END
           ), 0) AS seconds
           FROM entries
           WHERE DATE(started_at, 'localtime') = DATE('now', 'localtime')
              OR stopped_at IS NULL`
        )
        .get() as { seconds: number }
      const seconds = Math.max(0, Math.floor(row.seconds ?? 0))
      return ok(seconds)
    } catch (e) {
      return fail(e)
    }
  })

  // ── Settings ──────────────────────────────────────────────────
  ipcMain.handle('settings:getAll', (): IpcResult<Settings> => {
    try {
      const rows = db.prepare(`SELECT key, value FROM settings`).all() as {
        key: string
        value: string
      }[]
      const settings = Object.fromEntries(rows.map((r) => [r.key, r.value])) as unknown as Settings
      return ok(settings)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('settings:set', (_e, key: string, value: string): IpcResult<void> => {
    try {
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, value)
      // Apply side-effects for known keys.
      if (key === 'idle_threshold_minutes') {
        const n = parseInt(value, 10)
        if (Number.isFinite(n)) hooks.setIdleThreshold(n)
      } else if (key === 'auto_start') {
        hooks.setAutoStart(value === '1')
      } else if (key === 'hotkey_toggle') {
        const okHotkey = hooks.setHotkey(value)
        if (!okHotkey) return fail(`Hotkey "${value}" konnte nicht registriert werden`)
      }
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  // ── Backups ───────────────────────────────────
  ipcMain.handle('backup:list', (): IpcResult<BackupInfo[]> => {
    try {
      return ok(listBackups())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('backup:create', async (): Promise<IpcResult<string>> => {
    try {
      const path = await createBackup(db, 'manual')
      return ok(path)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(
    'backup:restore',
    (_e, filePath: string): IpcResult<{ safetyBackupPath: string }> => {
      try {
        // Close the live DB so the file can be replaced. App must restart
        // afterwards; the renderer is expected to call app.relaunch via a
        // separate IPC or a manual user action.
        const dbPath = getDbPath()
        db.close()
        const result = restoreBackupFile(filePath, dbPath)
        return ok(result)
      } catch (e) {
        return fail(e)
      }
    }
  )

  ipcMain.handle('app:relaunch', (): IpcResult<void> => {
    app.relaunch()
    app.exit(0)
    return ok(undefined)
  })

  // ── Shell helpers ────────────────────────────────
  ipcMain.handle('shell:openPath', async (_e, path: string): Promise<IpcResult<void>> => {
    const err = await shell.openPath(path)
    if (err) return fail(err)
    return ok(undefined)
  })

  ipcMain.handle('shell:showItemInFolder', (_e, path: string): IpcResult<void> => {
    shell.showItemInFolder(path)
    return ok(undefined)
  })

  // ── Paths (for Settings-View) ──────────────────────────
  ipcMain.handle('paths:get', (): IpcResult<{ db: string; backups: string }> => {
    return ok({ db: getDbPath(), backups: getBackupsDir() })
  })

  ipcMain.handle('app:getVersion', (): IpcResult<string> => {
    return ok(app.getVersion())
  })
}
