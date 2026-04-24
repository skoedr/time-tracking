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
        db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(
          m.version,
          m.name
        )
      })
      tx()
    }
  }

  it('migration 001 creates clients, entries, settings tables', () => {
    applyAll()
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{
        name: string
      }>
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

  it('migrations seed default settings', () => {
    applyAll()
    const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all()
    expect(rows).toEqual([
      { key: 'auto_start', value: '0' },
      { key: 'backup_path', value: '' },
      { key: 'company_name', value: '' },
      { key: 'hotkey_toggle', value: 'Alt+Shift+S' },
      { key: 'idle_threshold_minutes', value: '5' },
      { key: 'language', value: 'de' },
      // Migration 004 — PDF template seeds (v1.3 PR A)
      { key: 'pdf_accent_color', value: '#4f46e5' },
      { key: 'pdf_footer_text', value: '' },
      { key: 'pdf_logo_path', value: '' },
      { key: 'pdf_round_minutes', value: '0' },
      { key: 'pdf_sender_address', value: '' },
      { key: 'pdf_tax_id', value: '' },
      { key: 'rounding_minutes', value: '15' },
      { key: 'rounding_mode', value: 'none' }
    ])
  })

  it('seed-only migrations are idempotent (001 + 002)', () => {
    // Migrations whose `up` SQL contains ONLY CREATE IF NOT EXISTS and
    // INSERT OR IGNORE are safe to replay on existing v1.0 installs.
    // 003+ may use ALTER TABLE — those rely on schema_version + the runner
    // (which only applies pending migrations) for idempotency.
    const seedOnly = migrations.filter((m) => m.version <= 2)
    for (const m of seedOnly) {
      const tx = db.transaction(() => {
        db.exec(m.up)
        db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(
          m.version,
          m.name
        )
      })
      tx()
    }
    db.exec('DELETE FROM schema_version')
    expect(() => {
      for (const m of seedOnly) {
        const tx = db.transaction(() => {
          db.exec(m.up)
          db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(
            m.version,
            m.name
          )
        })
        tx()
      }
    }).not.toThrow()
    const count = db.prepare('SELECT COUNT(*) as n FROM settings').get() as {
      n: number
    }
    expect(count.n).toBe(8)
  })

  it('foreign key cascade deletes entries when client is deleted', () => {
    applyAll()
    db.prepare("INSERT INTO clients (id, name) VALUES (1, 'Acme')").run()
    db.prepare(
      "INSERT INTO entries (client_id, started_at) VALUES (1, '2026-01-01T00:00:00Z')"
    ).run()
    db.prepare('DELETE FROM clients WHERE id = 1').run()
    const remaining = db.prepare('SELECT COUNT(*) as n FROM entries').get() as { n: number }
    expect(remaining.n).toBe(0)
  })

  it('records each applied migration in schema_version', () => {
    applyAll()
    const rows = db.prepare('SELECT version, name FROM schema_version ORDER BY version').all()
    expect(rows).toEqual(migrations.map((m) => ({ version: m.version, name: m.name })))
  })

  it('migration 003 adds clients.rate_cent and entries.deleted_at', () => {
    applyAll()
    const clientCols = (
      db.prepare('PRAGMA table_info(clients)').all() as Array<{ name: string }>
    ).map((r) => r.name)
    const entryCols = (
      db.prepare('PRAGMA table_info(entries)').all() as Array<{ name: string }>
    ).map((r) => r.name)
    expect(clientCols).toContain('rate_cent')
    expect(entryCols).toContain('deleted_at')
  })

  it('migration 003 creates idx_entries_started_at', () => {
    applyAll()
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_entries_started_at'"
      )
      .get()
    expect(idx).toBeDefined()
  })

  it('migration 003 backfills rounded_min for finished entries only', () => {
    applyAll()
    db.prepare("INSERT INTO clients (id, name) VALUES (1, 'Acme')").run()
    // Finished entry without rounded_min
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at)
       VALUES (1, '2026-04-24T08:00:00Z', '2026-04-24T09:30:00Z')`
    ).run()
    // Running entry — must remain NULL after backfill replays
    db.prepare(
      `INSERT INTO entries (client_id, started_at) VALUES (1, '2026-04-24T10:00:00Z')`
    ).run()
    // Replay the backfill statement directly (idempotent).
    db.exec(
      `UPDATE entries
         SET rounded_min = CAST(
           ROUND((julianday(stopped_at) - julianday(started_at)) * 1440) AS INTEGER
         )
       WHERE rounded_min IS NULL
         AND stopped_at IS NOT NULL
         AND stopped_at >= started_at`
    )
    const rows = db
      .prepare('SELECT id, stopped_at, rounded_min FROM entries ORDER BY id')
      .all() as Array<{ id: number; stopped_at: string | null; rounded_min: number | null }>
    expect(rows[0].rounded_min).toBe(90)
    expect(rows[1].stopped_at).toBeNull()
    expect(rows[1].rounded_min).toBeNull()
  })

  it('migration 003 skips clock-skew rows (stopped_at < started_at)', () => {
    applyAll()
    db.prepare("INSERT INTO clients (id, name) VALUES (1, 'Acme')").run()
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at)
       VALUES (1, '2026-04-24T10:00:00Z', '2026-04-24T09:00:00Z')`
    ).run()
    db.exec(
      `UPDATE entries
         SET rounded_min = CAST(
           ROUND((julianday(stopped_at) - julianday(started_at)) * 1440) AS INTEGER
         )
       WHERE rounded_min IS NULL
         AND stopped_at IS NOT NULL
         AND stopped_at >= started_at`
    )
    const row = db.prepare('SELECT rounded_min FROM entries').get() as {
      rounded_min: number | null
    }
    expect(row.rounded_min).toBeNull()
  })

  it('migration 003 default rate_cent is 0', () => {
    applyAll()
    db.prepare("INSERT INTO clients (name) VALUES ('Acme')").run()
    const row = db.prepare('SELECT rate_cent FROM clients').get() as { rate_cent: number }
    expect(row.rate_cent).toBe(0)
  })

  it('migration 004 seeds PDF template settings keys', () => {
    applyAll()
    const keys = (
      db.prepare("SELECT key FROM settings WHERE key LIKE 'pdf_%' ORDER BY key").all() as Array<{
        key: string
      }>
    ).map((r) => r.key)
    expect(keys).toEqual([
      'pdf_accent_color',
      'pdf_footer_text',
      'pdf_logo_path',
      'pdf_round_minutes',
      'pdf_sender_address',
      'pdf_tax_id'
    ])
    const accent = db.prepare("SELECT value FROM settings WHERE key='pdf_accent_color'").get() as {
      value: string
    }
    expect(accent.value).toBe('#4f46e5')
    const round = db.prepare("SELECT value FROM settings WHERE key='pdf_round_minutes'").get() as {
      value: string
    }
    expect(round.value).toBe('0')
  })

  it('migration 004 is idempotent (preserves user-overridden values)', () => {
    applyAll()
    db.prepare("UPDATE settings SET value='#ff0000' WHERE key='pdf_accent_color'").run()
    // Re-running the same INSERT OR IGNORE statement must not reset the override.
    db.exec(`
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('pdf_logo_path', ''),
        ('pdf_sender_address', ''),
        ('pdf_tax_id', ''),
        ('pdf_accent_color', '#4f46e5'),
        ('pdf_footer_text', ''),
        ('pdf_round_minutes', '0');
    `)
    const accent = db.prepare("SELECT value FROM settings WHERE key='pdf_accent_color'").get() as {
      value: string
    }
    expect(accent.value).toBe('#ff0000')
  })

  it('migration 005 adds entries.link_id column (nullable)', () => {
    applyAll()
    const cols = db.prepare(`PRAGMA table_info(entries)`).all() as Array<{
      name: string
      notnull: number
      dflt_value: string | null
    }>
    const linkCol = cols.find((c) => c.name === 'link_id')
    expect(linkCol).toBeDefined()
    // NULL is the "no split" sentinel — column must allow NULL.
    expect(linkCol?.notnull).toBe(0)
    expect(linkCol?.dflt_value).toBeNull()
  })

  it('migration 005 creates the partial idx_entries_link_id index', () => {
    applyAll()
    const idx = db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='index' AND name='idx_entries_link_id'"
      )
      .get() as { name: string; sql: string } | undefined
    expect(idx).toBeDefined()
    // Partial index: WHERE clause means we don't index the (large) NULL set.
    expect(idx?.sql).toMatch(/WHERE\s+link_id\s+IS\s+NOT\s+NULL/i)
  })

  it('migration 005 round-trips a UUID link_id on multiple rows', () => {
    applyAll()
    db.prepare(`INSERT INTO clients (id, name) VALUES (1, 'Acme')`).run()
    const linkId = '11111111-2222-3333-4444-555555555555'
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at, link_id)
       VALUES (1, '2026-04-24T23:30:00Z', '2026-04-25T00:00:00Z', ?)`
    ).run(linkId)
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at, link_id)
       VALUES (1, '2026-04-25T00:00:00Z', '2026-04-25T01:15:00Z', ?)`
    ).run(linkId)
    const linked = db
      .prepare(`SELECT id FROM entries WHERE link_id = ? ORDER BY started_at`)
      .all(linkId) as Array<{ id: number }>
    expect(linked).toHaveLength(2)
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
        db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(99, 'broken')
      })
      tx()
    }).toThrow()

    const afterCount = db
      .prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table'")
      .get() as { n: number }
    expect(afterCount.n).toBe(beforeCount.n)
    const clientCount = db
      .prepare("SELECT COUNT(*) as n FROM clients WHERE name='Should rollback'")
      .get() as { n: number }
    expect(clientCount.n).toBe(0)
    const versionRow = db.prepare('SELECT * FROM schema_version WHERE version = 99').get()
    expect(versionRow).toBeUndefined()
  })
})
