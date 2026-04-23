import { ipcMain } from 'electron'
import { getDb } from './db'
import type {
  Client,
  Entry,
  CreateClientInput,
  UpdateClientInput,
  CreateEntryInput,
  UpdateEntryInput,
  MonthQuery,
  Settings,
  IpcResult
} from '../shared/types'

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}
function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: String(error) }
}

export function registerIpcHandlers(): void {
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
      return ok(row)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('clients:delete', (_e, id: number): IpcResult<void> => {
    try {
      db.prepare(`DELETE FROM clients WHERE id = ?`).run(id)
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
          .prepare(`SELECT * FROM entries WHERE stopped_at IS NULL ORDER BY started_at DESC LIMIT 1`)
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
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })
}
