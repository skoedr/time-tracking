import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { migrations } from './index'

import type Database from 'better-sqlite3'

// CI rebuilds better-sqlite3 for Node before running tests; locally the DB
// suite is skipped when the binary cannot load.
type DatabaseCtor = new (path: string) => Database.Database
let DatabaseImpl: DatabaseCtor | null = null

beforeAll(async () => {
  try {
    const mod = await import('better-sqlite3')
    const Ctor = mod.default as unknown as DatabaseCtor
    // The native binding only fails on actual instantiation, not on import.
    const probe = new Ctor(':memory:')
    probe.close()
    DatabaseImpl = Ctor
  } catch {
    DatabaseImpl = null
  }
})

describe('migrations registry', () => {
  it('has at least one migration', () => {
    expect(migrations.length).toBeGreaterThan(0)
  })

  it('versions are strictly increasing and start at 1', () => {
    expect(migrations[0].version).toBe(1)
    for (let i = 1; i < migrations.length; i++) {
      expect(migrations[i].version).toBe(migrations[i - 1].version + 1)
    }
  })

  it('all migrations have non-empty name and up SQL', () => {
    for (const m of migrations) {
      expect(m.name).toBeTruthy()
      expect(m.up.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('migration SQL execution', () => {
  let tmpDir: string
  let db: Database.Database

  beforeEach((ctx) => {
    if (!DatabaseImpl) {
      ctx.skip()
      return
    }
    tmpDir = mkdtempSync(join(tmpdir(), 'tt-migrations-'))
    const dbPath = join(tmpDir, 'test.sqlite')
    db = new DatabaseImpl(dbPath)
    db.pragma('foreign_keys = ON')
    db.exec(
      `CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
  })

  afterEach(() => {
    if (!db) return
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function applyAll(): void {
    for (const m of migrations) {
      const tx = db.transaction(() => {
        db.exec(m.up)
        db.prepare(
          'INSERT INTO schema_version (version, name) VALUES (?, ?)'
        ).run(m.version, m.name)
      })
      tx()
    }
  }

  it('migration 001 creates clients, entries, settings tables', () => {
    applyAll()
    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((r) => r.name)
    expect(tables).toContain('clients')
    expect(tables).toContain('entries')
    expect(tables).toContain('settings')
  })

  it('migration 001 creates idx_entries_client_started index', () => {
    applyAll()
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_entries_client_started'"
      )
      .get()
    expect(idx).toBeDefined()
  })

  it('migration 001 seeds default settings', () => {
    applyAll()
    const rows = db
      .prepare('SELECT key, value FROM settings ORDER BY key')
      .all()
    expect(rows).toEqual([
      { key: 'backup_path', value: '' },
      { key: 'company_name', value: '' },
      { key: 'rounding_minutes', value: '15' },
      { key: 'rounding_mode', value: 'none' }
    ])
  })

  it('migration 001 is idempotent', () => {
    applyAll()
    db.exec('DELETE FROM schema_version')
    expect(() => applyAll()).not.toThrow()
    const count = db.prepare('SELECT COUNT(*) as n FROM settings').get() as {
      n: number
    }
    expect(count.n).toBe(4)
  })

  it('foreign key cascade deletes entries when client is deleted', () => {
    applyAll()
    db.prepare("INSERT INTO clients (id, name) VALUES (1, 'Acme')").run()
    db.prepare(
      "INSERT INTO entries (client_id, started_at) VALUES (1, '2026-01-01T00:00:00Z')"
    ).run()
    db.prepare('DELETE FROM clients WHERE id = 1').run()
    const remaining = db
      .prepare('SELECT COUNT(*) as n FROM entries')
      .get() as { n: number }
    expect(remaining.n).toBe(0)
  })

  it('records each applied migration in schema_version', () => {
    applyAll()
    const rows = db
      .prepare('SELECT version, name FROM schema_version ORDER BY version')
      .all()
    expect(rows).toEqual(
      migrations.map((m) => ({ version: m.version, name: m.name }))
    )
  })

  it('rolls back migration on SQL failure (transactional)', () => {
    applyAll()
    const beforeCount = db
      .prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table'")
      .get() as { n: number }

    const broken = `
      CREATE TABLE valid_table (id INTEGER);
      INSERT INTO clients (name) VALUES ('Should rollback');
      THIS IS NOT VALID SQL;
    `
    expect(() => {
      const tx = db.transaction(() => {
        db.exec(broken)
        db.prepare(
          'INSERT INTO schema_version (version, name) VALUES (?, ?)'
        ).run(99, 'broken')
      })
      tx()
    }).toThrow()

    const afterCount = db
      .prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table'")
      .get() as { n: number }
    expect(afterCount.n).toBe(beforeCount.n)
    const clientCount = db
      .prepare(
        "SELECT COUNT(*) as n FROM clients WHERE name='Should rollback'"
      )
      .get() as { n: number }
    expect(clientCount.n).toBe(0)
    const versionRow = db
      .prepare('SELECT * FROM schema_version WHERE version = 99')
      .get()
    expect(versionRow).toBeUndefined()
  })
})
