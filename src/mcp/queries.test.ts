/**
 * Unit tests for the read-only MCP query layer.
 *
 * Same approach as ipc.test.ts: seed an in-memory DB with the real migrations
 * and exercise the query functions directly. Skips gracefully when
 * better-sqlite3 cannot load under the current Node ABI.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { migrations } from '../main/migrations'
import {
  durationSeconds,
  monthWindow,
  listClients,
  listProjects,
  listEntries,
  getRunningTimer,
  getAnalytics,
  getSetting,
  readStoredPrivacy,
  type SqliteDb
} from './queries'
import { resolvePrivacy, type PrivacyConfig } from './privacy'

const HIDE: PrivacyConfig = { exposeRates: false, exposePrivateNotes: false }
const SHOW: PrivacyConfig = { exposeRates: true, exposePrivateNotes: true }

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

function seed(db: Database.Database): void {
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

  // Clients: 1 active (with rate), 2 archived.
  db.prepare(
    `INSERT INTO clients (id, name, color, active, rate_cent, vat_id, contact_person)
     VALUES (1, 'Acme', '#111111', 1, 12000, 'DE123', 'Alice'),
            (2, 'Zeta', '#222222', 0, 0, NULL, NULL)`
  ).run()

  // Projects: active + archived for client 1.
  db.prepare(
    `INSERT INTO projects (id, client_id, name, color, rate_cent, active, status, budget_minutes)
     VALUES (10, 1, 'Website', '#333333', 15000, 1, 'active', 600),
            (11, 1, 'Altprojekt', '#444444', NULL, 0, 'archived', NULL)`
  ).run()

  // Entries in June 2026: two completed (client 1), one non-billable, one
  // soft-deleted (must be ignored), plus a running timer.
  const ins = db.prepare(
    `INSERT INTO entries
       (id, client_id, project_id, description, started_at, stopped_at, tags,
        reference, billable, private_note, deleted_at)
     VALUES (@id, @client_id, @project_id, @description, @started_at, @stopped_at,
        @tags, @reference, @billable, @private_note, @deleted_at)`
  )
  // 1h billable, project 10, tagged bug
  ins.run({
    id: 100,
    client_id: 1,
    project_id: 10,
    description: 'Feature A',
    started_at: '2026-06-10T09:00:00.000Z',
    stopped_at: '2026-06-10T10:00:00.000Z',
    tags: ',bug,ux,',
    reference: 'JIRA-1',
    billable: 1,
    private_note: 'geheim',
    deleted_at: null
  })
  // 30m non-billable, no project
  ins.run({
    id: 101,
    client_id: 1,
    project_id: null,
    description: 'Call',
    started_at: '2026-06-11T09:00:00.000Z',
    stopped_at: '2026-06-11T09:30:00.000Z',
    tags: '',
    reference: '',
    billable: 0,
    private_note: '',
    deleted_at: null
  })
  // soft-deleted — must never appear
  ins.run({
    id: 102,
    client_id: 1,
    project_id: 10,
    description: 'Deleted',
    started_at: '2026-06-12T09:00:00.000Z',
    stopped_at: '2026-06-12T11:00:00.000Z',
    tags: '',
    reference: '',
    billable: 1,
    private_note: '',
    deleted_at: '2026-06-12T12:00:00.000Z'
  })
  // running (no stopped_at)
  ins.run({
    id: 103,
    client_id: 1,
    project_id: null,
    description: 'Running',
    started_at: '2026-06-13T09:00:00.000Z',
    stopped_at: null,
    tags: '',
    reference: '',
    billable: 1,
    private_note: '',
    deleted_at: null
  })
}

describe('durationSeconds (pure)', () => {
  it('measures completed entries', () => {
    expect(durationSeconds('2026-06-10T09:00:00.000Z', '2026-06-10T10:00:00.000Z', 0)).toBe(3600)
  })
  it('measures running entries against now', () => {
    const now = Date.parse('2026-06-10T09:30:00.000Z')
    expect(durationSeconds('2026-06-10T09:00:00.000Z', null, now)).toBe(1800)
  })
  it('never returns negative', () => {
    expect(durationSeconds('2026-06-10T10:00:00.000Z', '2026-06-10T09:00:00.000Z', 0)).toBe(0)
  })
})

describe('monthWindow', () => {
  it('builds a UTC month window with December rollover', () => {
    expect(monthWindow(2026, 12)).toEqual({
      start: '2026-12-01T00:00:00.000Z',
      end: '2027-01-01T00:00:00.000Z'
    })
  })
})

describe('query layer', () => {
  let db: Database.Database
  let sdb: SqliteDb

  beforeEach((ctx) => {
    if (!DatabaseImpl) {
      ctx.skip()
      return
    }
    db = new DatabaseImpl(':memory:')
    seed(db)
    sdb = db
  })

  it('listClients hides archived and rates by default', () => {
    const clients = listClients(sdb, HIDE)
    expect(clients).toHaveLength(1)
    expect(clients[0].name).toBe('Acme')
    expect(clients[0].active).toBe(true)
    expect(clients[0].rate_cent).toBeUndefined()
    expect(clients[0].vat_id).toBe('DE123')
  })

  it('listClients includes archived and rates when asked', () => {
    const clients = listClients(sdb, SHOW, { includeArchived: true })
    expect(clients).toHaveLength(2)
    expect(clients.find((c) => c.name === 'Acme')?.rate_cent).toBe(12000)
  })

  it('listProjects excludes archived by default and reports usage', () => {
    const projects = listProjects(sdb, HIDE, { clientId: 1 })
    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe('Website')
    // project 10 has entry 100 (live) + 102 (soft-deleted, excluded) → 1
    expect(projects[0].entry_count).toBe(1)
  })

  it('listProjects entry_count excludes soft-deleted entries', () => {
    const projects = listProjects(sdb, HIDE, { clientId: 1, includeArchived: true })
    const website = projects.find((p) => p.id === 10)!
    // entries 100 (live) counts; 102 is soft-deleted → excluded.
    expect(website.entry_count).toBe(1)
    expect(website.rate_cent).toBeUndefined() // hidden
  })

  it('listEntries by month returns live entries with totals', () => {
    const now = Date.parse('2026-06-13T09:30:00.000Z') // running at 30m
    const res = listEntries(sdb, HIDE, { year: 2026, month: 6 }, now)
    // 100, 101, 103 — NOT the soft-deleted 102
    expect(res.count).toBe(3)
    expect(res.entries.map((e) => e.id).sort()).toEqual([100, 101, 103])
    // 3600 + 1800 + 1800(running) = 7200
    expect(res.total_seconds).toBe(7200)
    const running = res.entries.find((e) => e.id === 103)!
    expect(running.running).toBe(true)
    expect(running.stopped_at).toBeNull()
  })

  it('listEntries hides private_note by default, exposes when enabled', () => {
    const now = Date.now()
    const hidden = listEntries(sdb, HIDE, { year: 2026, month: 6 }, now)
    expect(hidden.entries.find((e) => e.id === 100)?.private_note).toBeUndefined()
    const shown = listEntries(sdb, SHOW, { year: 2026, month: 6 }, now)
    expect(shown.entries.find((e) => e.id === 100)?.private_note).toBe('geheim')
  })

  it('listEntries filters by tag (exact match)', () => {
    const res = listEntries(sdb, HIDE, { year: 2026, month: 6, tag: 'bug' }, Date.now())
    expect(res.entries.map((e) => e.id)).toEqual([100])
    expect(res.entries[0].tags).toEqual(['bug', 'ux'])
  })

  it('listEntries filters by project', () => {
    const res = listEntries(sdb, HIDE, { year: 2026, month: 6, projectId: 10 }, Date.now())
    expect(res.entries.map((e) => e.id)).toEqual([100])
  })

  it('getRunningTimer returns the open entry', () => {
    const entry = getRunningTimer(sdb, HIDE, Date.now())
    expect(entry?.id).toBe(103)
    expect(entry?.running).toBe(true)
  })

  it('getAnalytics sums completed entries and hides revenue by default', () => {
    const a = getAnalytics(sdb, HIDE, 2026, 6)
    // completed billable: 100 (3600). 101 non-billable (1800). 103 running excluded.
    expect(a.total_seconds).toBe(5400) // 3600 + 1800
    expect(a.billable_seconds).toBe(3600)
    expect(a.revenue_cent).toBeUndefined()
    expect(a.by_client.every((c) => c.revenue_cent === undefined)).toBe(true)
  })

  it('getAnalytics exposes revenue when rates enabled', () => {
    const a = getAnalytics(sdb, SHOW, 2026, 6)
    // entry 100: 1h on project 10 (rate 15000ct/h) → 15000ct revenue.
    expect(a.revenue_cent).toBe(15000)
    const acme = a.by_client.find((c) => c.client_id === 1)!
    expect(acme.revenue_cent).toBe(15000)
  })

  it('migration 018 seeds MCP flags to off; readStoredPrivacy reflects them', () => {
    expect(getSetting(sdb, 'mcp_expose_rates')).toBe('0')
    expect(getSetting(sdb, 'mcp_expose_private_notes')).toBe('0')
    expect(getSetting(sdb, 'mcp_write_enabled')).toBe('0')
    expect(readStoredPrivacy(sdb)).toEqual({ exposeRates: false, exposePrivateNotes: false })

    db.prepare(`UPDATE settings SET value = '1' WHERE key = 'mcp_expose_rates'`).run()
    expect(readStoredPrivacy(sdb)).toEqual({ exposeRates: true, exposePrivateNotes: false })
  })
})

describe('resolvePrivacy (stored + env)', () => {
  it('exposes when the stored flag is on', () => {
    expect(resolvePrivacy({ exposeRates: true, exposePrivateNotes: false }, {})).toEqual({
      exposeRates: true,
      exposePrivateNotes: false
    })
  })

  it('env var can enable even when stored is off', () => {
    const env = { TIMETRACK_MCP_EXPOSE_PRIVATE_NOTES: '1' } as NodeJS.ProcessEnv
    expect(resolvePrivacy({ exposeRates: false, exposePrivateNotes: false }, env)).toEqual({
      exposeRates: false,
      exposePrivateNotes: true
    })
  })

  it('defaults to hidden when neither source enables', () => {
    expect(resolvePrivacy({}, {})).toEqual({ exposeRates: false, exposePrivateNotes: false })
  })
})
