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
import { isSameLocalDay } from '../shared/date'

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
  if (!isSameLocalDay(start, stop)) {
    return 'Einträge können aktuell nicht über Mitternacht gehen (folgt in v1.3)'
  }
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

  it('rejects cross-midnight (different local day)', () => {
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
    expect(err).toMatch(/Mitternacht/)
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
