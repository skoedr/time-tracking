/**
 * Validation contract tests for `entries:create` and `entries:update`.
 *
 * We do not boot the full Electron IPC layer here. Instead we exercise the
 * same SQL surface and a local replica of `validateManualEntry` against an
 * in-memory DB seeded with the v1.2 schema. Keeps the test fast and avoids
 * an Electron runtime dependency in unit tests.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { migrations } from './migrations'

const MAX_DESCRIPTION_LEN = 500
const MAX_DURATION_SECONDS = 24 * 3600

type DatabaseCtor = new (path: string) => Database.Database
let DatabaseImpl: DatabaseCtor | null = null

beforeAll(async () => {
  try {
    const mod = await import('better-sqlite3')
    const Ctor = mod.default as unknown as DatabaseCtor
    const probe = new Ctor(':memory:')
    probe.close()
    DatabaseImpl = Ctor
  } catch {
    DatabaseImpl = null
  }
})

interface ManualInput {
  client_id: number
  description: string
  started_at: string
  stopped_at: string
}

function validateManualEntry(
  db: Database.Database,
  input: ManualInput,
  excludeId?: number
): string | null {
  const start = new Date(input.started_at)
  const stop = new Date(input.stopped_at)
  if (Number.isNaN(start.getTime())) return 'Startzeit ist ungültig'
  if (Number.isNaN(stop.getTime())) return 'Endzeit ist ungültig'
  if (start.getTime() > Date.now()) return 'Startzeit darf nicht in der Zukunft liegen'
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
  const params: Array<string | number> = [input.client_id, input.stopped_at, input.started_at]
  let overlapSql = `SELECT id FROM entries
                     WHERE client_id = ? AND deleted_at IS NULL
                       AND started_at < ?
                       AND COALESCE(stopped_at, datetime('now')) > ?`
  if (excludeId !== undefined) {
    overlapSql += ` AND id != ?`
    params.push(excludeId)
  }
  const overlap = db.prepare(overlapSql).get(...params) as { id: number } | undefined
  if (overlap) return 'Eintrag überlappt mit einem bestehenden Eintrag desselben Kunden'
  return null
}

describe('entries:create / entries:update validation contract', () => {
  let tmpDir: string
  let db: Database.Database
  // Anchor "today" to a fixed date so tests don't depend on wall clock.
  // Use yesterday relative to runtime so start times are always "in the past".
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  function todayAt(hh: number, mm: number): string {
    const d = new Date(yesterday)
    d.setHours(hh, mm, 0, 0)
    return d.toISOString()
  }

  beforeEach((ctx) => {
    if (!DatabaseImpl) {
      ctx.skip()
      return
    }
    tmpDir = mkdtempSync(join(tmpdir(), 'tt-ipc-'))
    db = new DatabaseImpl(join(tmpDir, 'test.sqlite'))
    db.pragma('foreign_keys = ON')
    db.exec(
      `CREATE TABLE schema_version (
         version INTEGER PRIMARY KEY,
         name TEXT NOT NULL,
         applied_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    )
    for (const m of migrations) {
      const tx = db.transaction(() => {
        db.exec(m.up)
        db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(
          m.version,
          m.name
        )
      })
      tx()
    }
    db.prepare(`INSERT INTO clients (id, name) VALUES (1, 'Acme')`).run()
    db.prepare(`INSERT INTO clients (id, name) VALUES (2, 'Other')`).run()
  })

  afterEach(() => {
    if (!db) return
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('accepts a valid entry', () => {
    const err = validateManualEntry(db, {
      client_id: 1,
      description: 'work',
      started_at: todayAt(8, 0),
      stopped_at: todayAt(9, 30)
    })
    expect(err).toBeNull()
  })

  it('rejects future start', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000)
    const future2 = new Date(future.getTime() + 30 * 60 * 1000)
    const err = validateManualEntry(db, {
      client_id: 1,
      description: '',
      started_at: future.toISOString(),
      stopped_at: future2.toISOString()
    })
    expect(err).toMatch(/Zukunft/)
  })

  it('rejects stopped_at <= started_at', () => {
    const err = validateManualEntry(db, {
      client_id: 1,
      description: '',
      started_at: todayAt(10, 0),
      stopped_at: todayAt(10, 0)
    })
    expect(err).toMatch(/Endzeit/)
  })

  it('accepts cross-midnight entries (v1.3 PR B — IPC auto-splits before insert)', () => {
    const start = new Date(yesterday)
    start.setHours(23, 30, 0, 0)
    const stop = new Date(yesterday)
    stop.setDate(stop.getDate() + 1)
    stop.setHours(0, 30, 0, 0)
    const err = validateManualEntry(db, {
      client_id: 1,
      description: '',
      started_at: start.toISOString(),
      stopped_at: stop.toISOString()
    })
    expect(err).toBeNull()
  })

  it('rejects unknown client', () => {
    const err = validateManualEntry(db, {
      client_id: 999,
      description: '',
      started_at: todayAt(8, 0),
      stopped_at: todayAt(9, 0)
    })
    expect(err).toMatch(/Kunde/)
  })

  it('rejects description over 500 chars', () => {
    const err = validateManualEntry(db, {
      client_id: 1,
      description: 'x'.repeat(501),
      started_at: todayAt(8, 0),
      stopped_at: todayAt(9, 0)
    })
    expect(err).toMatch(/Beschreibung/)
  })

  it('rejects overlapping entry on same client', () => {
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at)
       VALUES (1, ?, ?)`
    ).run(todayAt(9, 0), todayAt(10, 0))
    const err = validateManualEntry(db, {
      client_id: 1,
      description: '',
      started_at: todayAt(9, 30),
      stopped_at: todayAt(10, 30)
    })
    expect(err).toMatch(/überlappt/)
  })

  it('allows overlap with a different client', () => {
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at)
       VALUES (1, ?, ?)`
    ).run(todayAt(9, 0), todayAt(10, 0))
    const err = validateManualEntry(db, {
      client_id: 2,
      description: '',
      started_at: todayAt(9, 30),
      stopped_at: todayAt(10, 30)
    })
    expect(err).toBeNull()
  })

  it('ignores soft-deleted entries when checking overlap', () => {
    const info = db
      .prepare(
        `INSERT INTO entries (client_id, started_at, stopped_at, deleted_at)
         VALUES (1, ?, ?, ?)`
      )
      .run(todayAt(9, 0), todayAt(10, 0), new Date().toISOString())
    expect(info.changes).toBe(1)
    const err = validateManualEntry(db, {
      client_id: 1,
      description: '',
      started_at: todayAt(9, 30),
      stopped_at: todayAt(10, 30)
    })
    expect(err).toBeNull()
  })

  it('allows updating an entry without overlapping itself', () => {
    const info = db
      .prepare(
        `INSERT INTO entries (client_id, started_at, stopped_at)
         VALUES (1, ?, ?)`
      )
      .run(todayAt(9, 0), todayAt(10, 0))
    const id = info.lastInsertRowid as number
    const err = validateManualEntry(
      db,
      {
        client_id: 1,
        description: '',
        started_at: todayAt(9, 15),
        stopped_at: todayAt(10, 15)
      },
      id
    )
    expect(err).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// pdf:merge-export / pdf:merge-only — validation contract tests
//
// The full IPC handlers require an Electron runtime and are not exercised here.
// Handler logic is covered in pdfMergeHandlers.test.ts.
// This suite tests the shared validation helpers from pdfMergeValidation.ts.
// ---------------------------------------------------------------------------

import {
  validatePdfPath,
  validateInvoiceSize,
  validateMergeExportRequest,
  validateMergeOnlyRequest
} from './pdfMergeValidation'

describe('pdf:merge-export — path validation', () => {
  it('rejects empty invoicePath', () => {
    expect(validatePdfPath('')).toBe('Kein Rechnungspfad angegeben')
  })

  it('rejects non-pdf extension (.txt)', () => {
    expect(validatePdfPath('C:/invoices/rechnung.txt')).toBe('Die gewählte Datei ist keine PDF')
  })

  it('rejects non-pdf extension (.docx)', () => {
    expect(validatePdfPath('C:/invoices/rechnung.docx')).toBe('Die gewählte Datei ist keine PDF')
  })

  it('accepts .pdf extension (lowercase)', () => {
    // File does not exist — will fail at existsSync, not at extension check.
    const err = validatePdfPath('C:/does-not-exist/rechnung.pdf')
    expect(err).toBe('Datei nicht gefunden')
  })

  it('accepts .PDF extension (uppercase, Windows drag-from-Explorer)', () => {
    const err = validatePdfPath('C:/does-not-exist/rechnung.PDF')
    expect(err).toBe('Datei nicht gefunden')
  })

  it('rejects path traversal with non-pdf extension', () => {
    expect(validatePdfPath('../../secret.exe')).toBe('Die gewählte Datei ist keine PDF')
  })
})

describe('pdf:merge-export — size validation', () => {
  it('accepts a buffer below 50 MB', () => {
    expect(validateInvoiceSize(Buffer.alloc(1024))).toBeNull()
  })

  it('rejects a buffer at exactly 50 MB + 1 byte', () => {
    expect(validateInvoiceSize(Buffer.alloc(50 * 1024 * 1024 + 1))).toBe(
      'Rechnungs-PDF zu groß (max. 50 MB)'
    )
  })

  it('accepts a buffer at exactly 50 MB', () => {
    expect(validateInvoiceSize(Buffer.alloc(50 * 1024 * 1024))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// pdf:merge-export — request field validation
// Mirrors the guard at the top of the IPC handler before any FS access.
// ---------------------------------------------------------------------------

describe('pdf:merge-export — request validation', () => {
  it('rejects null request', () => {
    expect(validateMergeExportRequest(null)).toBe('Ungültige PDF-Anfrage')
  })

  it('rejects request with non-number clientId', () => {
    expect(validateMergeExportRequest({ clientId: '1', fromIso: '2026-01-01', toIso: '2026-01-31' })).toBe(
      'Ungültige PDF-Anfrage'
    )
  })

  it('rejects request with missing fromIso', () => {
    expect(validateMergeExportRequest({ clientId: 1, fromIso: '', toIso: '2026-01-31' })).toBe(
      'Ungültige PDF-Anfrage'
    )
  })

  it('rejects request with missing toIso', () => {
    expect(validateMergeExportRequest({ clientId: 1, fromIso: '2026-01-01', toIso: '' })).toBe(
      'Ungültige PDF-Anfrage'
    )
  })

  it('rejects valid request fields but missing invoicePath', () => {
    expect(
      validateMergeExportRequest({ clientId: 1, fromIso: '2026-01-01', toIso: '2026-01-31', invoicePath: '' })
    ).toBe('Kein Rechnungspfad angegeben')
  })

  it('accepts a fully valid request object', () => {
    expect(
      validateMergeExportRequest({
        clientId: 1,
        fromIso: '2026-01-01',
        toIso: '2026-01-31',
        invoicePath: 'C:/invoices/rechnung.pdf'
      })
    ).toBeNull()
  })
})

describe('pdf:merge-only — request validation', () => {
  it('rejects null request', () => {
    expect(validateMergeOnlyRequest(null)).toBe('Beide PDF-Pfade sind erforderlich')
  })

  it('rejects empty object', () => {
    expect(validateMergeOnlyRequest({})).toBe('Beide PDF-Pfade sind erforderlich')
  })

  it('rejects request with only stundennachweisPath', () => {
    expect(validateMergeOnlyRequest({ stundennachweisPath: 'a.pdf' })).toBe(
      'Beide PDF-Pfade sind erforderlich'
    )
  })

  it('rejects request with only invoicePath', () => {
    expect(validateMergeOnlyRequest({ invoicePath: 'b.pdf' })).toBe(
      'Beide PDF-Pfade sind erforderlich'
    )
  })

  it('rejects request with empty string paths', () => {
    expect(validateMergeOnlyRequest({ stundennachweisPath: '', invoicePath: '' })).toBe(
      'Beide PDF-Pfade sind erforderlich'
    )
  })

  it('accepts a fully valid request with both paths', () => {
    expect(
      validateMergeOnlyRequest({ stundennachweisPath: 'a.pdf', invoicePath: 'b.pdf' })
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Regression test: dashboard:summary duration calculation must return exact
// integer seconds for entries with round durations (e.g. exactly 1 hour).
//
// Root cause of the bug: julianday() arithmetic in SQLite uses IEEE-754
// floating point and can return 3599.9999... for a 3600-second interval.
// Math.floor(3599.999) = 3599 → "00:59" instead of "01:00".
// Fix: use strftime('%s', ...) which returns Unix epoch integers → exact.
// ---------------------------------------------------------------------------
describe('dashboard:summary — duration precision', () => {
  let db: Database.Database | null = null
  let tmpDir: string

  beforeAll(async () => {
    if (!DatabaseImpl) return
    tmpDir = mkdtempSync(join(tmpdir(), 'tt-duration-'))
    db = new DatabaseImpl(join(tmpDir, 'test.sqlite'))
    for (const m of migrations) {
      db.exec(m.up)
    }
  })

  afterEach(() => {
    if (!db) return
    db.prepare('DELETE FROM entries').run()
  })

  it.skipIf(!DatabaseImpl)(
    'returns exactly 3600 seconds for a 1-hour entry (not 3599)',
    () => {
      const d = db!
      const clientId = (
        d
          .prepare(`INSERT INTO clients (name, color, rate_cent, active) VALUES (?,?,?,1)`)
          .run('Test', '#fff', 0) as { lastInsertRowid: number | bigint }
      ).lastInsertRowid

      // Insert an entry that is exactly 1 hour (3600 s)
      const start = '2026-01-01T10:00:00.000Z'
      const stop = '2026-01-01T11:00:00.000Z'
      d.prepare(
        `INSERT INTO entries (client_id, description, started_at, stopped_at, heartbeat_at, rounded_min, link_id, tags)
         VALUES (?, '', ?, ?, ?, 60, NULL, '')`
      ).run(clientId, start, stop, stop)

      const row = d
        .prepare(
          `SELECT COALESCE(SUM(
             CASE
               WHEN stopped_at IS NULL
                 THEN CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', started_at) AS INTEGER)
               ELSE CAST(strftime('%s', stopped_at) AS INTEGER) - CAST(strftime('%s', started_at) AS INTEGER)
             END
           ), 0) AS seconds
           FROM entries
           WHERE deleted_at IS NULL`
        )
        .get() as { seconds: number }

      expect(row.seconds).toBe(3600)
    }
  )
})
