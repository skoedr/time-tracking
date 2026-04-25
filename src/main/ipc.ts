import { ipcMain, shell } from 'electron'
import { app } from 'electron'
import { dialog } from 'electron'
import { writeFileSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import log from 'electron-log/main'
import { randomUUID } from 'crypto'
import { getDb, getDbPath } from './db'
import { getBackupsDir } from './backup'
import { createBackup, listBackups, restoreBackup as restoreBackupFile } from './backup'
import { splitAtMidnight } from '../shared/midnightSplit'
import { buildJsonExportPayload } from './jsonExport'
import { buildPdfHtml, buildPdfPayload, type PdfRequest } from './pdf'
import { renderPdfBuffer } from './pdfWindow'
import { readLogoAsDataUrl, removeLogo, saveLogo } from './logo'
import { handleCsvExport, type CsvRequest } from './csvExport'
import type {
  Client,
  Entry,
  CreateClientInput,
  UpdateClientInput,
  CreateEntryInput,
  CreateManualEntryInput,
  UpdateEntryInput,
  MonthQuery,
  Settings,
  IpcResult,
  BackupInfo,
  DashboardSummary,
  LicenseEntry
} from '../shared/types'

const MAX_DESCRIPTION_LEN = 500
const MAX_DURATION_SECONDS = 24 * 3600

export interface IpcHooks {
  refreshTrayClients(): void
  setHotkey(accelerator: string): boolean
  setAutoStart(enabled: boolean): void
  setIdleThreshold(minutes: number): void
  setMiniEnabled(enabled: boolean): void
  setMiniHotkey(accelerator: string): boolean
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}
function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: String(error) }
}

/**
 * Coerce optional `rate_cent` from the renderer into a non-negative integer.
 * `undefined` (legacy callers) → 0; negative or NaN → throws so the IPC
 * surfaces the error instead of silently saving garbage.
 */
function normaliseRateCent(value: unknown): number {
  if (value === undefined || value === null) return 0
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Stundensatz darf nicht negativ sein')
  }
  return Math.round(n)
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
      const rate = normaliseRateCent(input.rate_cent)
      const info = db
        .prepare(`INSERT INTO clients (name, color, rate_cent) VALUES (?, ?, ?)`)
        .run(input.name.trim(), input.color, rate)
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
      const rate = normaliseRateCent(input.rate_cent)
      db.prepare(
        `UPDATE clients SET name = ?, color = ?, active = ?, rate_cent = ? WHERE id = ?`
      ).run(input.name.trim(), input.color, input.active, rate, input.id)
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
            `SELECT * FROM entries
             WHERE stopped_at IS NULL AND deleted_at IS NULL
             ORDER BY started_at DESC LIMIT 1`
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
          `SELECT * FROM entries
             WHERE started_at >= ? AND started_at < ? AND deleted_at IS NULL
             ORDER BY started_at ASC`
        )
        .all(start, end) as Entry[]
      return ok(rows)
    } catch (e) {
      return fail(e)
    }
  })

  /**
   * Manual-entry creation (Today "+ Eintrag nachtragen", Calendar Drawer
   * "+ Eintrag hinzufügen"). Server-side validation per v1.2 plan E3 — UI
   * may also pre-validate but must not be the only line of defence.
   *
   * v1.3 PR B: Cross-midnight entries are auto-split at local midnight
   * into linked halves sharing a `link_id` (UUID). The first half's row
   * is returned for UI selection; the renderer's `getByMonth` query will
   * surface the second half on its own day.
   */
  ipcMain.handle('entries:create', (_e, input: CreateManualEntryInput): IpcResult<Entry> => {
    try {
      const err = validateManualEntry(db, input)
      if (err) return fail(err)
      const segments = splitAtMidnight(new Date(input.started_at), new Date(input.stopped_at))
      const insertedRow = insertEntrySegments(db, input, segments, input.tags ?? '')
      return ok(insertedRow)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('entries:update', (_e, input: UpdateEntryInput): IpcResult<Entry> => {
    try {
      // Reuse the same validation contract as create. We exclude both the
      // current row (`input.id`) and any sibling sharing its link_id so the
      // overlap check doesn't fire against the about-to-be-deleted halves.
      const existing = db.prepare(`SELECT link_id FROM entries WHERE id = ?`).get(input.id) as
        | { link_id: string | null }
        | undefined
      const existingLinkId = existing?.link_id ?? undefined
      const err = validateManualEntry(db, input, input.id, existingLinkId ?? undefined)
      if (err) return fail(err)
      const segments = splitAtMidnight(new Date(input.started_at), new Date(input.stopped_at))
      const tx = db.transaction((): Entry => {
        // Drop the original row + any linked sibling, then re-insert. This
        // keeps the cross-midnight bookkeeping in one place rather than
        // distinguishing "edit one half" vs "edit a single-day row".
        if (existingLinkId) {
          db.prepare(`DELETE FROM entries WHERE link_id = ?`).run(existingLinkId)
        } else {
          db.prepare(`DELETE FROM entries WHERE id = ?`).run(input.id)
        }
        return insertEntrySegments(db, input, segments, input.tags ?? '')
      })
      const row = tx()
      return ok(row)
    } catch (e) {
      return fail(e)
    }
  })

  /**
   * Soft-delete: flip deleted_at instead of removing the row, so the Toast
   * "Rückgängig" path can restore the SAME id (preserves future PDF FKs — E10).
   *
   * v1.3 PR B: when `cascadeLinked` is true and the row has a `link_id`,
   * all rows sharing that id are soft-deleted in one transaction (used by
   * the Drawer's "auch zweite Hälfte löschen" confirm).
   */
  ipcMain.handle('entries:delete', (_e, id: number, cascadeLinked = false): IpcResult<void> => {
    try {
      const now = new Date().toISOString()
      if (cascadeLinked) {
        const row = db.prepare(`SELECT link_id FROM entries WHERE id = ?`).get(id) as
          | { link_id: string | null }
          | undefined
        if (row?.link_id) {
          db.prepare(`UPDATE entries SET deleted_at = ? WHERE link_id = ?`).run(now, row.link_id)
          return ok(undefined)
        }
      }
      db.prepare(`UPDATE entries SET deleted_at = ? WHERE id = ?`).run(now, id)
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('entries:undelete', (_e, id: number): IpcResult<Entry> => {
    try {
      db.prepare(`UPDATE entries SET deleted_at = NULL WHERE id = ?`).run(id)
      const row = db.prepare(`SELECT * FROM entries WHERE id = ?`).get(id) as Entry
      return ok(row)
    } catch (e) {
      return fail(e)
    }
  })

  /**
   * Return distinct tag names used in entries from the last 90 days,
   * sorted by frequency descending. Used for TagInput autocomplete.
   * Only non-empty tags columns are considered.
   */
  ipcMain.handle('tags:recent', (): IpcResult<string[]> => {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
      const rows = db
        .prepare(
          `SELECT tags FROM entries
           WHERE deleted_at IS NULL
             AND tags != ''
             AND started_at >= ?`
        )
        .all(cutoff) as Array<{ tags: string }>

      const freq = new Map<string, number>()
      for (const { tags } of rows) {
        for (const tag of tags.split(',').filter((t: string) => t.length > 0)) {
          freq.set(tag, (freq.get(tag) ?? 0) + 1)
        }
      }
      const sorted = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag)
      return ok(sorted)
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
           WHERE deleted_at IS NULL
             AND (DATE(started_at, 'localtime') = DATE('now', 'localtime')
                  OR stopped_at IS NULL)`
        )
        .get() as { seconds: number }
      const seconds = Math.max(0, Math.floor(row.seconds ?? 0))
      return ok(seconds)
    } catch (e) {
      return fail(e)
    }
  })

  /**
   * One-shot dashboard payload for the Today view. All four queries run in
   * a single read transaction so the snapshot is consistent. Cross-midnight
   * running entry counted via `stopped_at IS NULL` (matches todayTotal).
   */
  ipcMain.handle('dashboard:summary', (): IpcResult<DashboardSummary> => {
    try {
      const tx = db.transaction((): DashboardSummary => {
        const today = db
          .prepare(
            `SELECT COALESCE(SUM(
               CASE
                 WHEN stopped_at IS NULL
                   THEN (julianday('now') - julianday(started_at)) * 86400
                 ELSE (julianday(stopped_at) - julianday(started_at)) * 86400
               END
             ), 0) AS seconds
             FROM entries
             WHERE deleted_at IS NULL
               AND (DATE(started_at, 'localtime') = DATE('now', 'localtime')
                    OR stopped_at IS NULL)`
          )
          .get() as { seconds: number }

        // ISO week — Monday as first day. SQLite's strftime('%w') returns
        // 0=Sunday, so we shift to start the window from the most recent
        // Monday at local midnight.
        const week = db
          .prepare(
            `SELECT COALESCE(SUM(
               CASE
                 WHEN stopped_at IS NULL
                   THEN (julianday('now') - julianday(started_at)) * 86400
                 ELSE (julianday(stopped_at) - julianday(started_at)) * 86400
               END
             ), 0) AS seconds
             FROM entries
             WHERE deleted_at IS NULL
               AND (
                 DATE(started_at, 'localtime')
                   >= DATE('now', 'localtime', 'weekday 0', '-7 days')
                 OR stopped_at IS NULL
               )`
          )
          .get() as { seconds: number }

        const recentEntries = db
          .prepare(
            `SELECT * FROM entries
               WHERE deleted_at IS NULL
               ORDER BY started_at DESC LIMIT 5`
          )
          .all() as Entry[]

        const topClients30d = db
          .prepare(
            `SELECT c.id AS client_id, c.name, c.color,
                    COALESCE(SUM(
                      CASE
                        WHEN e.stopped_at IS NULL
                          THEN (julianday('now') - julianday(e.started_at)) * 86400
                        ELSE (julianday(e.stopped_at) - julianday(e.started_at)) * 86400
                      END
                    ), 0) AS seconds
               FROM clients c
               LEFT JOIN entries e ON e.client_id = c.id
                 AND e.deleted_at IS NULL
                 AND DATE(e.started_at, 'localtime')
                       >= DATE('now', 'localtime', '-30 days')
              GROUP BY c.id
              HAVING seconds > 0
              ORDER BY seconds DESC
              LIMIT 3`
          )
          .all() as Array<{
          client_id: number
          name: string
          color: string
          seconds: number
        }>

        return {
          todaySeconds: Math.max(0, Math.floor(today.seconds ?? 0)),
          weekSeconds: Math.max(0, Math.floor(week.seconds ?? 0)),
          recentEntries,
          topClients30d: topClients30d.map((r) => ({
            ...r,
            seconds: Math.max(0, Math.floor(r.seconds ?? 0))
          }))
        }
      })
      return ok(tx())
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
      } else if (key === 'mini_enabled') {
        hooks.setMiniEnabled(value === '1')
      } else if (key === 'mini_hotkey') {
        const okHotkey = hooks.setMiniHotkey(value)
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
  ipcMain.handle(
    'paths:get',
    (): IpcResult<{ db: string; backups: string; logs: string; logFile: string }> => {
      // electron-log returns a File transport whose `getFile()` resolves
      // the on-disk log path lazily; the directory is its parent.
      const logFile = log.transports.file.getFile().path
      return ok({
        db: getDbPath(),
        backups: getBackupsDir(),
        logs: dirname(logFile),
        logFile
      })
    }
  )

  ipcMain.handle('app:getVersion', (): IpcResult<string> => {
    return ok(app.getVersion())
  })

  /**
   * Full JSON export (#17, v1.3 PR B). Bundles every client + entry
   * (including soft-deleted + linked halves) + every settings row, plus a
   * meta header (`schemaVersion`, `exportedAt`, `appVersion`). Output is
   * intentionally human-readable (2-space indent) so the file is also a
   * trust-building artefact: open it in any text editor, see your data,
   * confidence in the app goes up.
   *
   * Pure data dump — no transforms, no PII filtering, no field renaming.
   * Future v1.3.x or v1.4 CSV/PDF exports build on top of this snapshot.
   */
  ipcMain.handle('export:json', async (): Promise<IpcResult<{ path: string; bytes: number }>> => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const result = await dialog.showSaveDialog({
        title: 'Datenexport speichern',
        defaultPath: `timetrack-export-${today}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (result.canceled || !result.filePath) {
        return fail('Export abgebrochen')
      }
      const payload = buildJsonExportPayload(db, app.getVersion())
      const json = JSON.stringify(payload, null, 2)
      writeFileSync(result.filePath, json, 'utf8')
      return ok({ path: result.filePath, bytes: Buffer.byteLength(json, 'utf8') })
    } catch (e) {
      return fail(e)
    }
  })

  // === PDF export (v1.3 PR C, issues #16 + #19) ===========================
  // The hero feature: client + date range → printable A4 PDF.
  // Pipeline: gather payload from DB → render template HTML → hidden
  // BrowserWindow + printToPDF → write to user-chosen path.

  ipcMain.handle(
    'pdf:export',
    async (_e, req: PdfRequest): Promise<IpcResult<{ path: string }>> => {
      try {
        if (!req || typeof req.clientId !== 'number' || !req.fromIso || !req.toIso) {
          return fail('Ungültige PDF-Anfrage')
        }
        const client = db.prepare(`SELECT id, name FROM clients WHERE id = ?`).get(req.clientId) as
          | { id: number; name: string }
          | undefined
        if (!client) return fail(`Kunde ${req.clientId} nicht gefunden`)

        const monthHint = req.fromIso.slice(0, 7) // YYYY-MM
        // Strip filesystem-hostile chars from the client name for the suggested filename.
        const safeName = client.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Kunde'
        const result = await dialog.showSaveDialog({
          title: 'Stundennachweis speichern',
          defaultPath: `Stundennachweis-${safeName}-${monthHint}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (result.canceled || !result.filePath) {
          return fail('Export abgebrochen')
        }

        const settingsRows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{
          key: string
          value: string
        }>
        const settings = Object.fromEntries(
          settingsRows.map((r) => [r.key, r.value])
        ) as unknown as Settings
        const logoDataUrl = readLogoAsDataUrl(settings.pdf_logo_path ?? '')

        const payload = buildPdfPayload(db, req, logoDataUrl)
        const html = buildPdfHtml(payload)
        const buf = await renderPdfBuffer({ html })
        writeFileSync(result.filePath, buf)
        return ok({ path: result.filePath })
      } catch (e) {
        return fail(e)
      }
    }
  )

  // Logo picker — copies user-chosen image into userData/pdf-logo.<ext>
  // and persists the path into settings.pdf_logo_path.
  ipcMain.handle('logo:set', async (): Promise<IpcResult<{ path: string }>> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Logo auswählen',
        properties: ['openFile'],
        filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return fail('Auswahl abgebrochen')
      }
      const userDataDir = app.getPath('userData')
      const target = saveLogo(result.filePaths[0], userDataDir)
      db.prepare(
        `INSERT INTO settings (key, value) VALUES ('pdf_logo_path', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(target)
      return ok({ path: target })
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('logo:clear', async (): Promise<IpcResult<void>> => {
    try {
      const userDataDir = app.getPath('userData')
      removeLogo(userDataDir)
      db.prepare(
        `INSERT INTO settings (key, value) VALUES ('pdf_logo_path', '')
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run()
      return ok(undefined)
    } catch (e) {
      return fail(e)
    }
  })

  // === CSV export (v1.5 PR C, issue #18) ===================================
  ipcMain.handle(
    'csv:export',
    async (_e, req: CsvRequest): Promise<IpcResult<{ path: string }>> => {
      return handleCsvExport(db, req)
    }
  )

  // === Licenses (v1.5 PR F, issue #35) =====================================
  // Reads resources/licenses.json generated by scripts/generate-licenses.mjs.
  // In dev: app.getAppPath() → project root. In production: asar root.
  ipcMain.handle('app:getLicenses', (): IpcResult<LicenseEntry[]> => {
    try {
      const licensesPath = join(app.getAppPath(), 'resources', 'licenses.json')
      const raw = readFileSync(licensesPath, 'utf8')
      return ok(JSON.parse(raw) as LicenseEntry[])
    } catch (e) {
      return fail(e)
    }
  })
}

/**
 * Server-side validation contract for manual entry create/update (E3).
 * Returns an error string if invalid, `null` if valid. Single point of
 * truth: UI may pre-validate but must not be the only line of defence
 * (e.g. against malicious renderer code or future scripted clients).
 *
 * Rules:
 *  - started_at <= now (no future entries)
 *  - stopped_at > started_at
 *  - client_id exists
 *  - description.length <= 500
 *  - duration <= 24h
 *  - no overlap with existing non-deleted entry of the same client
 *    (excluding the entry itself when updating; for cross-midnight splits
 *    the caller passes `excludeLinkId` so the second half doesn't claim
 *    its sibling overlaps)
 *
 * Cross-midnight is allowed since v1.3 PR B — entries that cross local
 * midnight are auto-split into linked halves by the create/update IPC
 * before insertion (see `splitAtMidnight`).
 */
function validateManualEntry(
  db: ReturnType<typeof getDb>,
  input: {
    client_id: number
    description: string
    started_at: string
    stopped_at: string
  },
  excludeId?: number,
  excludeLinkId?: string
): string | null {
  const start = new Date(input.started_at)
  const stop = new Date(input.stopped_at)
  if (Number.isNaN(start.getTime())) return 'Startzeit ist ungültig'
  if (Number.isNaN(stop.getTime())) return 'Endzeit ist ungültig'
  const now = Date.now()
  if (start.getTime() > now) return 'Startzeit darf nicht in der Zukunft liegen'
  if (stop.getTime() <= start.getTime()) return 'Endzeit muss nach der Startzeit liegen'
  const durationSec = (stop.getTime() - start.getTime()) / 1000
  if (durationSec > MAX_DURATION_SECONDS) return 'Dauer überschreitet 24 Stunden'
  if ((input.description ?? '').length > MAX_DESCRIPTION_LEN) {
    return `Beschreibung überschreitet ${MAX_DESCRIPTION_LEN} Zeichen`
  }
  const clientRow = db.prepare(`SELECT id FROM clients WHERE id = ?`).get(input.client_id) as
    | { id: number }
    | undefined
  if (!clientRow) return 'Kunde existiert nicht'
  // Overlap: any non-deleted entry of the same client whose time range
  // intersects [start, stop). Two intervals overlap iff
  //   existing.started_at < stop AND COALESCE(existing.stopped_at, now) > start
  const params: Array<string | number> = [input.client_id, input.stopped_at, input.started_at]
  let overlapSql = `SELECT id FROM entries
                     WHERE client_id = ? AND deleted_at IS NULL
                       AND started_at < ?
                       AND COALESCE(stopped_at, datetime('now')) > ?`
  if (excludeId !== undefined) {
    overlapSql += ` AND id != ?`
    params.push(excludeId)
  }
  if (excludeLinkId !== undefined) {
    overlapSql += ` AND (link_id IS NULL OR link_id != ?)`
    params.push(excludeLinkId)
  }
  const overlap = db.prepare(overlapSql).get(...params) as { id: number } | undefined
  if (overlap) return 'Eintrag überlappt mit einem bestehenden Eintrag desselben Kunden'
  return null
}

/**
 * Insert one or more time segments produced by `splitAtMidnight`. Single
 * segment → plain insert (link_id stays NULL). Multiple segments → all
 * rows share a fresh UUID `link_id` so the UI / delete flow can find
 * siblings later. Returns the FIRST inserted row (the one whose start
 * matches the user's input.started_at), so the renderer can reveal the
 * correct day in the calendar.
 *
 * Caller must have already run `validateManualEntry` against the full
 * (un-split) range. Runs inside a single transaction so a failed insert
 * leaves no half-state behind.
 */
function insertEntrySegments(
  db: ReturnType<typeof getDb>,
  input: { client_id: number; description: string },
  segments: Array<{ start: Date; stop: Date }>,
  tags = ''
): Entry {
  const linkId = segments.length > 1 ? randomUUID() : null
  const description = input.description.trim()
  const insertStmt = db.prepare(
    `INSERT INTO entries (client_id, description, started_at, stopped_at, heartbeat_at, rounded_min, link_id, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const tx = db.transaction((): Entry => {
    let firstId = 0
    for (const seg of segments) {
      const startedAt = seg.start.toISOString()
      const stoppedAt = seg.stop.toISOString()
      const info = insertStmt.run(
        input.client_id,
        description,
        startedAt,
        stoppedAt,
        stoppedAt,
        Math.round((seg.stop.getTime() - seg.start.getTime()) / 60000),
        linkId,
        tags
      )
      if (firstId === 0) firstId = Number(info.lastInsertRowid)
    }
    return db.prepare(`SELECT * FROM entries WHERE id = ?`).get(firstId) as Entry
  })
  return tx()
}
