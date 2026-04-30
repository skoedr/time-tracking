import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync } from 'fs'
import { migrations } from './migrations/index'
import { buildBudgetStatus } from './budgetHandlers'

// Skip if the native module isn't available (CI without electron rebuild)
let available = true
try {
  new Database(':memory:').close()
} catch {
  available = false
}

function applyAll(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`
  )
  for (const m of migrations) {
    const tx = db.transaction(() => {
      db.exec(m.up)
      db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(m.version, m.name)
    })
    tx()
  }
}

describe.skipIf(!available)('buildBudgetStatus', () => {
  let tmpDir: string
  let db: Database.Database

  beforeEach(() => {
    tmpDir = join(tmpdir(), `budget-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
    db = new Database(join(tmpDir, 'test.db'))
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    applyAll(db)
    // Seed a client so foreign-key constraints are satisfied
    db.prepare(`INSERT INTO clients (id, name) VALUES (1, 'Test Client')`).run()
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns budgetMinutes=null when project has no budget set', () => {
    db.prepare(`INSERT INTO projects (id, client_id, name, budget_minutes) VALUES (1, 1, 'App', NULL)`).run()
    const result = buildBudgetStatus(db, 1)
    expect(result).toEqual({ ok: true, data: { budgetMinutes: null, usedMinutes: 0 } })
  })

  it('returns usedMinutes=0 when project has no entries', () => {
    db.prepare(`INSERT INTO projects (id, client_id, name, budget_minutes) VALUES (1, 1, 'App', 600)`).run()
    const result = buildBudgetStatus(db, 1)
    expect(result).toEqual({ ok: true, data: { budgetMinutes: 600, usedMinutes: 0 } })
  })

  it('sums rounded_min of completed entries only', () => {
    db.prepare(`INSERT INTO projects (id, client_id, name, budget_minutes) VALUES (1, 1, 'App', 600)`).run()
    // completed entries
    db.prepare(
      `INSERT INTO entries (client_id, project_id, started_at, stopped_at, rounded_min)
       VALUES (1, 1, '2026-05-01T08:00:00Z', '2026-05-01T09:00:00Z', 60)`
    ).run()
    db.prepare(
      `INSERT INTO entries (client_id, project_id, started_at, stopped_at, rounded_min)
       VALUES (1, 1, '2026-05-02T08:00:00Z', '2026-05-02T09:30:00Z', 90)`
    ).run()
    const result = buildBudgetStatus(db, 1)
    expect(result).toEqual({ ok: true, data: { budgetMinutes: 600, usedMinutes: 150 } })
  })

  it('excludes the currently running entry (stopped_at IS NULL)', () => {
    db.prepare(`INSERT INTO projects (id, client_id, name, budget_minutes) VALUES (1, 1, 'App', 600)`).run()
    // completed entry
    db.prepare(
      `INSERT INTO entries (client_id, project_id, started_at, stopped_at, rounded_min)
       VALUES (1, 1, '2026-05-01T08:00:00Z', '2026-05-01T09:00:00Z', 60)`
    ).run()
    // running entry — no stopped_at, no rounded_min
    db.prepare(
      `INSERT INTO entries (client_id, project_id, started_at)
       VALUES (1, 1, '2026-05-02T08:00:00Z')`
    ).run()
    const result = buildBudgetStatus(db, 1)
    expect(result).toEqual({ ok: true, data: { budgetMinutes: 600, usedMinutes: 60 } })
  })

  it('returns silent fallback when project does not exist', () => {
    const result = buildBudgetStatus(db, 9999)
    expect(result).toEqual({ ok: true, data: { budgetMinutes: null, usedMinutes: 0 } })
  })
})
