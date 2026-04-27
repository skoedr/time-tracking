/**
 * Tests for the PDF payload assembler + HTML template renderer.
 * No Electron, no I/O — operates on an in-memory SQLite + checks
 * the produced HTML string with structural assertions (we deliberately
 * avoid pixel snapshots; printToPDF rendering varies across Chromium
 * point releases).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { migrations } from './migrations'
import { buildPdfPayload, buildPdfHtml } from './pdf'

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

describe('buildPdfPayload', () => {
  let tmpDir: string
  let db: Database.Database

  beforeEach((ctx) => {
    if (!DatabaseImpl) {
      ctx.skip()
      return
    }
    tmpDir = mkdtempSync(join(tmpdir(), 'tt-pdf-'))
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
    db.prepare(
      `INSERT INTO clients (id, name, color, rate_cent) VALUES (1, 'Acme', '#6366f1', 8500)`
    ).run()
    db.prepare(
      `INSERT INTO clients (id, name, color, rate_cent) VALUES (2, 'Pro Bono', '#10b981', 0)`
    ).run()
  })

  afterEach(() => {
    if (!db) return
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('throws when client does not exist', () => {
    expect(() =>
      buildPdfPayload(db, { clientId: 999, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    ).toThrow(/Kunde/)
  })

  it('returns empty rows + zero totals when no entries match', () => {
    const p = buildPdfPayload(db, { clientId: 1, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    expect(p.rows).toEqual([])
    expect(p.totals.minutes).toBe(0)
    // Client has rate 8500 — totals.feeCent stays 0, not null, because
    // the "no fee column" decision is rate-based not entry-based.
    expect(p.totals.feeCent).toBe(0)
  })

  it('omits fee column for clients with rate_cent = 0', () => {
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at)
       VALUES (2, '2026-04-15T08:00:00.000Z', '2026-04-15T09:30:00.000Z')`
    ).run()
    const p = buildPdfPayload(db, { clientId: 2, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    expect(p.totals.feeCent).toBeNull()
    expect(p.rows[0].feeCent).toBeNull()
  })

  it('aggregates minutes and fee for paid clients', () => {
    db.prepare(
      `INSERT INTO entries (client_id, description, started_at, stopped_at)
       VALUES (1, 'work', '2026-04-15T08:00:00.000Z', '2026-04-15T09:30:00.000Z')`
    ).run()
    db.prepare(
      `INSERT INTO entries (client_id, description, started_at, stopped_at)
       VALUES (1, 'more work', '2026-04-16T10:00:00.000Z', '2026-04-16T11:00:00.000Z')`
    ).run()
    const p = buildPdfPayload(db, { clientId: 1, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    expect(p.rows).toHaveLength(2)
    expect(p.totals.minutes).toBe(150) // 90 + 60
    // 150 min × 8500 cent/h ÷ 60 = 21250 cent
    expect(p.totals.feeCent).toBe(21250)
  })

  it('respects pdf_round_minutes setting', () => {
    db.prepare(`UPDATE settings SET value='15' WHERE key='pdf_round_minutes'`).run()
    db.prepare(
      // 23 minutes raw — should round to 30 with step=15
      `INSERT INTO entries (client_id, description, started_at, stopped_at)
       VALUES (1, 'short task', '2026-04-15T08:00:00.000Z', '2026-04-15T08:23:00.000Z')`
    ).run()
    const p = buildPdfPayload(db, { clientId: 1, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    expect(p.rows[0].minutes).toBe(30)
    expect(p.totals.minutes).toBe(30)
  })

  it('aligns displayed Von/Bis with the rounded duration (step=30)', () => {
    // The recipient must never see a row like "18:54 – 19:18 → 0:30" where
    // the visible times disagree with the duration column. Rule:
    //   displayedStart = round(rawStart) to nearest step
    //   displayedStop  = displayedStart + roundedMinutes
    db.prepare(`UPDATE settings SET value='30' WHERE key='pdf_round_minutes'`).run()
    // Local 18:54 → 19:18 (raw 24 min, rounds to 30 with step=30) → 19:00 – 19:30
    const a1 = new Date(2026, 3, 24, 18, 54, 0).toISOString()
    const a2 = new Date(2026, 3, 24, 19, 18, 0).toISOString()
    // Local 18:55 → 19:25 (raw 30 min, stays 30 with step=30) → 19:00 – 19:30
    const b1 = new Date(2026, 3, 25, 18, 55, 0).toISOString()
    const b2 = new Date(2026, 3, 25, 19, 25, 0).toISOString()
    db.prepare(`INSERT INTO entries (client_id, started_at, stopped_at) VALUES (1, ?, ?)`).run(
      a1,
      a2
    )
    db.prepare(`INSERT INTO entries (client_id, started_at, stopped_at) VALUES (1, ?, ?)`).run(
      b1,
      b2
    )
    const p = buildPdfPayload(db, { clientId: 1, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    expect(p.rows[0].startTime).toBe('19:00')
    expect(p.rows[0].stopTime).toBe('19:30')
    expect(p.rows[0].minutes).toBe(30)
    expect(p.rows[1].startTime).toBe('19:00')
    expect(p.rows[1].stopTime).toBe('19:30')
    expect(p.rows[1].minutes).toBe(30)
  })

  it('aligns displayed Von/Bis with rounding step=5', () => {
    db.prepare(`UPDATE settings SET value='5' WHERE key='pdf_round_minutes'`).run()
    // 18:54 → 19:18 (raw 24 min, rounds to 25 with step=5) → 18:55 – 19:20
    const a1 = new Date(2026, 3, 24, 18, 54, 0).toISOString()
    const a2 = new Date(2026, 3, 24, 19, 18, 0).toISOString()
    db.prepare(`INSERT INTO entries (client_id, started_at, stopped_at) VALUES (1, ?, ?)`).run(
      a1,
      a2
    )
    const p = buildPdfPayload(db, { clientId: 1, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    expect(p.rows[0].startTime).toBe('18:55')
    expect(p.rows[0].stopTime).toBe('19:20')
    expect(p.rows[0].minutes).toBe(25)
  })

  it('keeps raw Von/Bis when rounding is disabled', () => {
    // pdf_round_minutes default is '0'
    const a1 = new Date(2026, 3, 24, 18, 54, 0).toISOString()
    const a2 = new Date(2026, 3, 24, 19, 18, 0).toISOString()
    db.prepare(`INSERT INTO entries (client_id, started_at, stopped_at) VALUES (1, ?, ?)`).run(
      a1,
      a2
    )
    const p = buildPdfPayload(db, { clientId: 1, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    expect(p.rows[0].startTime).toBe('18:54')
    expect(p.rows[0].stopTime).toBe('19:18')
    expect(p.rows[0].minutes).toBe(24)
  })

  it('excludes soft-deleted entries', () => {
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at, deleted_at)
       VALUES (1, '2026-04-15T08:00:00.000Z', '2026-04-15T09:00:00.000Z', '2026-04-15T10:00:00.000Z')`
    ).run()
    const p = buildPdfPayload(db, { clientId: 1, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    expect(p.rows).toHaveLength(0)
  })

  it('excludes running entries (stopped_at IS NULL)', () => {
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at)
       VALUES (1, '2026-04-15T08:00:00.000Z', NULL)`
    ).run()
    const p = buildPdfPayload(db, { clientId: 1, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    expect(p.rows).toHaveLength(0)
  })

  it('range is inclusive — captures entries on the last day', () => {
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at)
       VALUES (1, '2026-04-30T22:00:00.000Z', '2026-04-30T23:00:00.000Z')`
    ).run()
    const p = buildPdfPayload(db, { clientId: 1, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    expect(p.rows).toHaveLength(1)
  })

  it('includes cross-midnight halves as separate rows (link_id preserved by data layer)', () => {
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at, link_id)
       VALUES (1, '2026-04-24T22:00:00.000Z', '2026-04-25T00:00:00.000Z', 'aaa')`
    ).run()
    db.prepare(
      `INSERT INTO entries (client_id, started_at, stopped_at, link_id)
       VALUES (1, '2026-04-25T00:00:00.000Z', '2026-04-25T01:30:00.000Z', 'aaa')`
    ).run()
    const p = buildPdfPayload(db, { clientId: 1, fromIso: '2026-04-24', toIso: '2026-04-25' }, '')
    expect(p.rows).toHaveLength(2)
  })

  it('uses settings for sender block + accent color', () => {
    db.prepare(`UPDATE settings SET value='Robin GmbH' WHERE key='company_name'`).run()
    db.prepare(
      `UPDATE settings SET value='Musterstr. 1\n12345 Berlin' WHERE key='pdf_sender_address'`
    ).run()
    db.prepare(`UPDATE settings SET value='DE12345' WHERE key='pdf_tax_id'`).run()
    db.prepare(`UPDATE settings SET value='#ff0000' WHERE key='pdf_accent_color'`).run()
    const p = buildPdfPayload(db, { clientId: 1, fromIso: '2026-04-01', toIso: '2026-04-30' }, '')
    expect(p.sender.name).toBe('Robin GmbH')
    expect(p.sender.address).toContain('Musterstr')
    expect(p.sender.taxId).toBe('DE12345')
    expect(p.accentColor).toBe('#ff0000')
  })
})

describe('buildPdfHtml', () => {
  function makePayload(
    overrides: Partial<Parameters<typeof buildPdfHtml>[0]> = {}
  ): Parameters<typeof buildPdfHtml>[0] {
    return {
      client: { id: 1, name: 'Acme', rate_cent: 8500 },
      sender: { name: 'Robin GmbH', address: 'Musterstr. 1\n12345 Berlin', taxId: 'DE12345' },
      fromIso: '2026-04-01',
      toIso: '2026-04-30',
      rows: [
        {
          date: '15.04.2026',
          startTime: '08:00',
          stopTime: '09:30',
          description: 'Work',
          minutes: 90,
          feeCent: 12750
        }
      ],
      totals: { minutes: 90, feeCent: 12750 },
      accentColor: '#4f46e5',
      footerText: 'Bitte überweisen Sie bis zum 15.05.',
      logoDataUrl: '',
      roundMinutes: 0,
      generatedAtIso: '2026-04-24T12:00:00.000Z',
      groups: null,
      ...overrides
    }
  }

  it('produces a self-contained HTML document', () => {
    const html = buildPdfHtml(makePayload())
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<title>Stundennachweis</title>')
    expect(html).toContain('Acme')
    expect(html).toContain('15.04.2026')
    expect(html).toContain('127,50 €') // formatted fee
  })

  it('includes a Content-Security-Policy meta tag (locks down to inline CSS + data: images)', () => {
    const html = buildPdfHtml(makePayload())
    expect(html).toMatch(/Content-Security-Policy.*default-src 'none'/)
  })

  it('escapes user-controlled strings (XSS hardening)', () => {
    const html = buildPdfHtml(
      makePayload({
        client: { id: 1, name: '<script>alert(1)</script>', rate_cent: 8500 },
        sender: { name: '"><img>', address: '', taxId: '' }
      })
    )
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&quot;&gt;&lt;img&gt;')
  })

  it('falls back to indigo accent on malformed color input', () => {
    const html = buildPdfHtml(makePayload({ accentColor: 'javascript:alert(1)' }))
    expect(html).toContain('#4f46e5')
    expect(html).not.toContain('javascript:')
  })

  it('omits the fee column when totals.feeCent is null', () => {
    const html = buildPdfHtml(
      makePayload({
        client: { id: 1, name: 'Pro Bono', rate_cent: 0 },
        rows: [
          {
            date: '15.04.2026',
            startTime: '08:00',
            stopTime: '09:00',
            description: 'Help',
            minutes: 60,
            feeCent: null
          }
        ],
        totals: { minutes: 60, feeCent: null }
      })
    )
    expect(html).not.toContain('Honorar')
    expect(html).not.toContain('€')
  })

  it('shows an empty-state row when there are no entries', () => {
    const html = buildPdfHtml(makePayload({ rows: [], totals: { minutes: 0, feeCent: 0 } }))
    expect(html).toContain('Keine Einträge im gewählten Zeitraum.')
  })

  it('embeds logo as a data URL when provided', () => {
    const html = buildPdfHtml(makePayload({ logoDataUrl: 'data:image/png;base64,iVBORw0K' }))
    expect(html).toContain('data:image/png;base64,iVBORw0K')
    expect(html).toContain('class="logo"')
  })

  it('never reveals the rounding to the recipient (no visible hint)', () => {
    // The displayed Von/Bis times are aligned with the rounded duration
    // in the payload builder; the recipient should see internally
    // consistent rows but no "rounded to X minutes" disclosure.
    expect(buildPdfHtml(makePayload({ roundMinutes: 0 }))).not.toMatch(/gerundet|rounded/i)
    expect(buildPdfHtml(makePayload({ roundMinutes: 15 }))).not.toMatch(/gerundet|rounded/i)
    expect(buildPdfHtml(makePayload({ roundMinutes: 30 }))).not.toMatch(/gerundet|rounded/i)
  })

  it('renders entry-ref div when reference is non-empty', () => {
    const html = buildPdfHtml(
      makePayload({
        rows: [
          {
            date: '15.04.2026',
            startTime: '08:00',
            stopTime: '09:30',
            description: 'Work',
            minutes: 90,
            feeCent: 12750,
            reference: 'JIRA-123'
          }
        ]
      })
    )
    expect(html).toContain('class="entry-ref"')
    expect(html).toContain('JIRA-123')
  })

  it('omits entry-ref div when reference is empty or absent', () => {
    const htmlEmpty = buildPdfHtml(
      makePayload({
        rows: [
          {
            date: '15.04.2026',
            startTime: '08:00',
            stopTime: '09:30',
            description: 'Work',
            minutes: 90,
            feeCent: 12750,
            reference: ''
          }
        ]
      })
    )
    expect(htmlEmpty).not.toContain('class="entry-ref"')

    const htmlAbsent = buildPdfHtml(makePayload())
    expect(htmlAbsent).not.toContain('class="entry-ref"')
  })
})
