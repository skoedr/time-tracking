/**
 * CSV export IPC handler (v1.5 PR C, issue #18).
 *
 * Wires the shared `formatCsv` formatter to the main-process IPC layer:
 * - queries DB for entries in the given date range + client
 * - opens a Save dialog
 * - writes the UTF-8+BOM CSV to the user-chosen path
 *
 * Kept separate from ipc.ts to mirror the pattern used by pdf.ts /
 * jsonExport.ts — easier to unit-test in isolation.
 */
import { dialog } from 'electron'
import { writeFileSync } from 'fs'
import type Database from 'better-sqlite3'
import { formatCsv, type CsvOptions } from '../shared/csv'
import type { Client, Entry, IpcResult } from '../shared/types'

export interface CsvRequest {
  clientId: number
  /** ISO-date strings, inclusive: '2026-04-01' to '2026-04-30'. */
  fromIso: string
  toIso: string
  /** DE = ';' / ',' (default), US = ',' / '.' */
  format?: 'de' | 'us'
  /** When true, entries are grouped by their first tag with subtotal rows. Default: false. */
  groupByTag?: boolean
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}
function fail(e: unknown): IpcResult<never> {
  return { ok: false, error: e instanceof Error ? e.message : String(e) }
}

export async function handleCsvExport(
  db: Database.Database,
  req: CsvRequest
): Promise<IpcResult<{ path: string }>> {
  try {
    if (!req || typeof req.clientId !== 'number' || !req.fromIso || !req.toIso) {
      return fail('Ungültige CSV-Anfrage')
    }

    const client = db
      .prepare(`SELECT id, name, color, active, rate_cent, created_at FROM clients WHERE id = ?`)
      .get(req.clientId) as Client | undefined
    if (!client) return fail(`Kunde ${req.clientId} nicht gefunden`)

    const entries = db
      .prepare(
        `SELECT * FROM entries
         WHERE client_id = ?
           AND date(started_at) >= date(?)
           AND date(started_at) <= date(?)
           AND deleted_at IS NULL
           AND stopped_at IS NOT NULL
         ORDER BY started_at ASC`
      )
      .all(req.clientId, req.fromIso, req.toIso) as Entry[]

    const rangeHint = `${req.fromIso.slice(0, 7)}`
    const safeName = client.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Kunde'

    const result = await dialog.showSaveDialog({
      title: 'CSV speichern',
      defaultPath: `Zeiterfassung-${safeName}-${rangeHint}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) {
      return fail('Export abgebrochen')
    }

    const opts: CsvOptions =
      req.format === 'us'
        ? { fieldSeparator: ',', decimalSeparator: '.', groupByTag: req.groupByTag }
        : { fieldSeparator: ';', decimalSeparator: ',', groupByTag: req.groupByTag }

    const clientMap = new Map([[client.id, client]])
    const csv = formatCsv(entries, clientMap, opts)

    writeFileSync(result.filePath, csv, 'utf8')
    return ok({ path: result.filePath })
  } catch (e) {
    return fail(e)
  }
}
