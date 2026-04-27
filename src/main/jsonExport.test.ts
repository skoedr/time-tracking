/**
 * Unit tests for `buildJsonExportPayload`. Pure function over a live SQLite
 * handle — no Electron save-dialog involved. Skipped automatically when
 * the better-sqlite3 native binding can't load (matches the migrations
 * suite pattern).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { migrations } from './migrations'
import { buildJsonExportPayload } from './jsonExport'

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

describe('buildJsonExportPayload', () => {
  let tmpDir: string
  let db: Database.Database

  beforeEach((ctx) => {
    if (!DatabaseImpl) {
      ctx.skip()
      return
    }
    tmpDir = mkdtempSync(join(tmpdir(), 'tt-export-'))
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
  })

  afterEach(() => {
    if (!db) return
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('emits meta with current schema version + appVersion + ISO exportedAt', () => {
    const payload = buildJsonExportPayload(db, '1.3.0')
    expect(payload.meta.schemaVersion).toBe(migrations.length)
    expect(payload.meta.appVersion).toBe('1.3.0')
    expect(payload.meta.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('includes seeded settings (alphabetically sorted)', () => {
    const payload = buildJsonExportPayload(db, '1.3.0')
    const keys = payload.settings.map((s) => s.key)
    // Sorted by key (BehaviorContract: stable diff across exports).
    const sorted = [...keys].sort()
    expect(keys).toEqual(sorted)
    // Spot-check a v1.2 + v1.3 key.
    expect(keys).toContain('rounding_minutes')
    expect(keys).toContain('pdf_accent_color')
  })

  it('includes clients + entries with their full column set', () => {
    db.prepare(
      `INSERT INTO clients (id, name, color, rate_cent) VALUES (1, 'Acme', '#6366f1', 8500)`
    ).run()
    db.prepare(
      `INSERT INTO entries (client_id, description, started_at, stopped_at, link_id)
       VALUES (1, 'work', '2026-04-24T08:00:00.000Z', '2026-04-24T09:30:00.000Z', NULL)`
    ).run()
    const payload = buildJsonExportPayload(db, '1.3.0')
    expect(payload.clients).toHaveLength(1)
    expect(payload.clients[0].rate_cent).toBe(8500)
    expect(payload.entries).toHaveLength(1)
    expect(payload.entries[0].description).toBe('work')
    // Verify the v1.3 link_id field is present (even when null).
    expect(payload.entries[0]).toHaveProperty('link_id')
  })

  it('preserves cross-midnight linked halves verbatim', () => {
    db.prepare(`INSERT INTO clients (id, name) VALUES (1, 'Acme')`).run()
    const linkId = '11111111-2222-3333-4444-555555555555'
    db.prepare(
      `INSERT INTO entries (client_id, description, started_at, stopped_at, link_id)
       VALUES (1, 'late', '2026-04-24T23:30:00.000Z', '2026-04-25T00:00:00.000Z', ?)`
    ).run(linkId)
    db.prepare(
      `INSERT INTO entries (client_id, description, started_at, stopped_at, link_id)
       VALUES (1, 'late', '2026-04-25T00:00:00.000Z', '2026-04-25T01:15:00.000Z', ?)`
    ).run(linkId)
    const payload = buildJsonExportPayload(db, '1.3.0')
    expect(payload.entries).toHaveLength(2)
    expect(payload.entries.every((e) => e.link_id === linkId)).toBe(true)
  })

  it('includes soft-deleted entries (audit trail / undo recovery)', () => {
    db.prepare(`INSERT INTO clients (id, name) VALUES (1, 'Acme')`).run()
    db.prepare(
      `INSERT INTO entries (client_id, description, started_at, stopped_at, deleted_at)
       VALUES (1, 'oops', '2026-04-24T08:00:00.000Z', '2026-04-24T09:00:00.000Z', '2026-04-24T10:00:00.000Z')`
    ).run()
    const payload = buildJsonExportPayload(db, '1.3.0')
    expect(payload.entries).toHaveLength(1)
    expect(payload.entries[0].deleted_at).toBe('2026-04-24T10:00:00.000Z')
  })

  it('serialises to stable, indented JSON (2-space)', () => {
    db.prepare(`INSERT INTO clients (id, name) VALUES (1, 'Acme')`).run()
    const payload = buildJsonExportPayload(db, '1.3.0')
    const json = JSON.stringify(payload, null, 2)
    // Indent guarantees readability ("open in any editor and verify your data").
    expect(json).toContain('\n  "clients": [')
    expect(json).toContain('\n  "entries":')
  })
})
