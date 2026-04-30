/**
 * Unit tests for analytics:summary — SQL aggregation logic.
 *
 * We bypass the Electron IPC layer entirely and call `buildAnalyticsSummary`
 * directly against an in-memory SQLite DB with all migrations applied.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { migrations } from './migrations'
import { buildAnalyticsSummary } from './analyticsHandlers'

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

// ── DB setup helpers ───────────────────────────────────────────────────────

function makeDb(Ctor: DatabaseCtor, dir: string): Database.Database {
  const db = new Ctor(join(dir, 'test.sqlite'))
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
      db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(m.version, m.name)
    })
    tx()
  }
  return db
}

/** Insert a completed entry. started/stopped are ISO strings. */
function addEntry(
  db: Database.Database,
  opts: {
    client_id: number
    started_at: string
    stopped_at: string
    billable?: number
    project_id?: number | null
  }
): void {
  db.prepare(
    `INSERT INTO entries (client_id, started_at, stopped_at, billable, project_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    opts.client_id,
    opts.started_at,
    opts.stopped_at,
    opts.billable ?? 1,
    opts.project_id ?? null
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('buildAnalyticsSummary', () => {
  let tmpDir: string
  let db: Database.Database

  beforeEach((ctx) => {
    if (!DatabaseImpl) {
      ctx.skip()
      return
    }
    tmpDir = mkdtempSync(join(tmpdir(), 'tt-analytics-'))
    db = makeDb(DatabaseImpl, tmpDir)

    // Seed two clients
    db.prepare(`INSERT INTO clients (id, name, color, rate_cent) VALUES (1, 'Acme', '#8b7cf8', 8500)`).run()
    db.prepare(`INSERT INTO clients (id, name, color, rate_cent) VALUES (2, 'Beta', '#4ade80', 0)`).run()
  })

  afterEach(() => {
    if (!db) return
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // ── 1. Month stats happy path ────────────────────────────────────────────

  it('returns correct hours and revenue for selected month', () => {
    // 2 hours for Acme (rate 85 €/h) in April 2025
    addEntry(db, {
      client_id: 1,
      started_at: '2025-04-10T08:00:00.000Z',
      stopped_at: '2025-04-10T10:00:00.000Z', // 7200 sec
    })

    const res = buildAnalyticsSummary(db, { year: 2025, month: 4 })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.data.month.hours).toBe(7200)
    // 85 €/h * 2 h = 170 € = 17000 cents
    expect(res.data.month.revenue).toBe(17000)
    expect(res.data.month.hasData).toBe(true)
    expect(res.data.month.hasRateConfigured).toBe(true)
    expect(res.data.month.daysInMonth).toBe(30)
  })

  // ── 2. hasData = false for empty month ───────────────────────────────────

  it('returns hasData=false and zero values for a month with no entries', () => {
    const res = buildAnalyticsSummary(db, { year: 2024, month: 1 })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.data.month.hasData).toBe(false)
    expect(res.data.month.hours).toBe(0)
    expect(res.data.month.revenue).toBe(0)
  })

  // ── 3. COALESCE: project rate overrides client rate ──────────────────────

  it('uses project rate_cent when it overrides client rate', () => {
    // Project with 120 €/h = 12000 cents
    db.prepare(`INSERT INTO projects (id, client_id, name, color, rate_cent) VALUES (10, 1, 'BigDeal', '#fff', 12000)`).run()

    // 1 hour on that project → 120 € = 12000 cents
    addEntry(db, {
      client_id: 1,
      started_at: '2025-06-01T09:00:00.000Z',
      stopped_at: '2025-06-01T10:00:00.000Z', // 3600 sec
      project_id: 10,
    })

    const res = buildAnalyticsSummary(db, { year: 2025, month: 6 })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.data.month.revenue).toBe(12000)
  })

  // ── 4. project_id = NULL uses client rate ────────────────────────────────

  it('falls back to client rate when project_id is null', () => {
    // 3 hours for Acme (client rate 85 €/h), no project
    addEntry(db, {
      client_id: 1,
      started_at: '2025-07-05T08:00:00.000Z',
      stopped_at: '2025-07-05T11:00:00.000Z', // 10800 sec
      project_id: null,
    })

    const res = buildAnalyticsSummary(db, { year: 2025, month: 7 })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    // 85 €/h * 3 h = 255 € = 25500 cents
    expect(res.data.month.revenue).toBe(25500)
  })

  // ── 5. billable ratio ────────────────────────────────────────────────────

  it('computes billable ratio correctly', () => {
    // 2 hours billable, 1 hour non-billable
    addEntry(db, {
      client_id: 1,
      started_at: '2025-08-01T08:00:00.000Z',
      stopped_at: '2025-08-01T10:00:00.000Z', // 7200 sec, billable=1
      billable: 1,
    })
    addEntry(db, {
      client_id: 1,
      started_at: '2025-08-01T11:00:00.000Z',
      stopped_at: '2025-08-01T12:00:00.000Z', // 3600 sec, billable=0
      billable: 0,
    })

    const res = buildAnalyticsSummary(db, { year: 2025, month: 8 })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.data.month.hours).toBe(10800) // 2h + 1h
    // billable = 7200 / 10800 ≈ 0.666...
    expect(res.data.month.billable).toBeCloseTo(2 / 3, 5)
  })

  // ── 6. January — year boundary (prev month = December of prior year) ─────

  it('handles January correctly (prev month = December prior year)', () => {
    // December 2024 entry
    addEntry(db, {
      client_id: 1,
      started_at: '2024-12-15T09:00:00.000Z',
      stopped_at: '2024-12-15T10:00:00.000Z',
    })
    // January 2025 entry
    addEntry(db, {
      client_id: 1,
      started_at: '2025-01-10T09:00:00.000Z',
      stopped_at: '2025-01-10T11:00:00.000Z',
    })

    const res = buildAnalyticsSummary(db, { year: 2025, month: 1 })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.data.month.hours).toBe(7200) // only January
    expect(res.data.month.hoursPrev).toBe(3600) // December
    expect(res.data.month.daysInMonth).toBe(31)
  })

  // ── 7. February — correct days-in-month (2024 = leap year) ──────────────

  it('reports correct days for February 2024 (leap year)', () => {
    addEntry(db, {
      client_id: 2,
      started_at: '2024-02-14T10:00:00.000Z',
      stopped_at: '2024-02-14T11:00:00.000Z',
    })

    const res = buildAnalyticsSummary(db, { year: 2024, month: 2 })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.data.month.daysInMonth).toBe(29)
  })

  // ── 8. 12-week trailing: returns exactly 12 week buckets ────────────────

  it('returns exactly 12 week buckets in weeks array', () => {
    addEntry(db, {
      client_id: 1,
      started_at: '2025-04-10T08:00:00.000Z',
      stopped_at: '2025-04-10T10:00:00.000Z',
    })

    const res = buildAnalyticsSummary(db, { year: 2025, month: 4 })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.data.weeks).toHaveLength(12)
    // Each entry has lbl, b, n
    for (const w of res.data.weeks) {
      expect(w).toHaveProperty('lbl')
      expect(w).toHaveProperty('b')
      expect(w).toHaveProperty('n')
    }
  })

  // ── 9. 12-month trailing: returns exactly 12 month buckets ──────────────

  it('returns exactly 12 month buckets in months array', () => {
    addEntry(db, {
      client_id: 1,
      started_at: '2025-04-10T08:00:00.000Z',
      stopped_at: '2025-04-10T10:00:00.000Z',
    })

    const res = buildAnalyticsSummary(db, { year: 2025, month: 4 })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.data.months).toHaveLength(12)
    // The last bucket should be April (the selected month)
    expect(res.data.months[11].lbl).toBe('Apr')
    // The first bucket should be May of prior year
    expect(res.data.months[0].lbl).toBe('Mai')
  })

  // ── 10. Invalid query returns error ─────────────────────────────────────

  it('returns error for invalid month query', () => {
    const res = buildAnalyticsSummary(db, { year: 2025, month: 13 })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toMatch(/Monatsangabe/)
  })

  // ── 11. Deleted entries are excluded ────────────────────────────────────

  it('excludes deleted entries from totals', () => {
    // Insert entry + mark deleted
    const info = db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at) VALUES (1, '2025-09-01T08:00:00.000Z', '2025-09-01T10:00:00.000Z')`
    ).run()
    db.prepare(`UPDATE entries SET deleted_at = datetime('now') WHERE id = ?`).run(info.lastInsertRowid)

    const res = buildAnalyticsSummary(db, { year: 2025, month: 9 })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.data.month.hasData).toBe(false)
    expect(res.data.month.hours).toBe(0)
  })

  // ── 12. weekday array contains 7 entries (Mo–So) ─────────────────────────

  it('returns 7 weekday entries labeled Mo–So', () => {
    addEntry(db, {
      client_id: 1,
      started_at: '2025-04-07T08:00:00.000Z', // Monday
      stopped_at: '2025-04-07T10:00:00.000Z',
    })

    const res = buildAnalyticsSummary(db, { year: 2025, month: 4 })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.data.weekday).toHaveLength(7)
    expect(res.data.weekday.map((d) => d.d)).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'])
  })
})
