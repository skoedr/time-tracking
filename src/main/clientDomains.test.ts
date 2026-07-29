import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync } from 'fs'
import {
  domainMapping,
  forgetDomain,
  learnDomain,
  listClientDomains,
  normalizeDomain
} from './clientDomains'
import { applyMigrations, loadSqlite, type DatabaseCtor } from '../test/sqlite'

let DatabaseImpl: DatabaseCtor

beforeAll(async () => {
  DatabaseImpl = await loadSqlite()
})

describe('normalizeDomain', () => {
  it('lowercases and trims', () => {
    expect(normalizeDomain('  KUNDE-X.De ')).toBe('kunde-x.de')
  })

  it('strips a leading @ — how people naturally type a domain', () => {
    expect(normalizeDomain('@kunde.de')).toBe('kunde.de')
  })

  it('accepts multi-label domains', () => {
    expect(normalizeDomain('mail.sub.kunde.co.uk')).toBe('mail.sub.kunde.co.uk')
  })

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['no-dot', 'no dot'],
    ['zwei worte.de', 'contains space'],
    ['alice@kunde.de', 'a full address, not a domain'],
    ['kunde.de/pfad', 'contains a path'],
    ['-kunde.de', 'label starts with hyphen'],
    ['kunde..de', 'empty label']
  ])('rejects %j (%s)', (raw) => {
    expect(normalizeDomain(raw)).toBeNull()
  })
})

describe('clientDomains', () => {
  let tmpDir: string
  let db: Database.Database

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
    db = new DatabaseImpl(join(tmpDir, 'test.db'))
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    applyMigrations(db)
    db.prepare(`INSERT INTO clients (id, name) VALUES (1, 'Kunde X')`).run()
    db.prepare(`INSERT INTO clients (id, name) VALUES (2, 'Kunde Y')`).run()
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('starts empty', () => {
    expect(listClientDomains(db)).toEqual({ ok: true, data: [] })
  })

  it('learns a domain, normalized to lowercase', () => {
    const result = learnDomain(db, ' @Kunde-X.DE ', 1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.domain).toBe('kunde-x.de')
      expect(result.data.clientId).toBe(1)
    }
  })

  it('lists domains sorted by name', () => {
    learnDomain(db, 'zeta.de', 1)
    learnDomain(db, 'alpha.de', 2)
    const result = listClientDomains(db)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.map((d) => d.domain)).toEqual(['alpha.de', 'zeta.de'])
    }
  })

  it('moves an existing domain to another client instead of failing — correcting a wrong mapping', () => {
    learnDomain(db, 'kunde.de', 1)
    const moved = learnDomain(db, 'kunde.de', 2)
    expect(moved.ok).toBe(true)
    if (moved.ok) expect(moved.data.clientId).toBe(2)
    const rows = listClientDomains(db)
    if (rows.ok) expect(rows.data).toHaveLength(1)
  })

  it('rejects a domain that does not look like one', () => {
    const result = learnDomain(db, 'alice@kunde.de', 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('keine gültige Domain')
  })

  it('rejects a client that does not exist, with a readable message instead of an FK error', () => {
    const result = learnDomain(db, 'kunde.de', 999)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('existiert nicht')
  })

  it('forgets a domain', () => {
    learnDomain(db, 'kunde.de', 1)
    expect(forgetDomain(db, 'KUNDE.de')).toEqual({ ok: true, data: undefined })
    expect(listClientDomains(db)).toEqual({ ok: true, data: [] })
  })

  it('forgetting an unknown domain is a no-op, not an error', () => {
    expect(forgetDomain(db, 'nie-gesehen.de')).toEqual({ ok: true, data: undefined })
  })

  it('deleting a client cascades to its domains — the reason this is a table, not a settings blob', () => {
    learnDomain(db, 'kunde.de', 1)
    learnDomain(db, 'andere.de', 2)
    db.prepare(`DELETE FROM clients WHERE id = 1`).run()
    const rows = listClientDomains(db)
    expect(rows.ok).toBe(true)
    if (rows.ok) expect(rows.data.map((d) => d.domain)).toEqual(['andere.de'])
  })

  it('domainMapping returns the lookup resolveClient consumes', () => {
    learnDomain(db, 'kunde.de', 1)
    learnDomain(db, 'andere.de', 2)
    expect(domainMapping(db)).toEqual(
      new Map([
        ['kunde.de', 1],
        ['andere.de', 2]
      ])
    )
  })
})
