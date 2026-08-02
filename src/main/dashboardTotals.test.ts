/**
 * Tests for the shared today/week totals (#186).
 *
 * Two jobs: pin the window semantics (running entry counts, entries outside
 * the window do not), and pin the numbers against the *other* copy of the same
 * definition — `getDashboard()` in the read-only MCP layer. Both are read by
 * different surfaces; if one is ever changed alone, this goes red instead of
 * the dial quietly disagreeing with the app.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { applyMigrations, loadSqlite, type DatabaseCtor } from '../test/sqlite'
import { readRoundMinutes, readTotals } from './dashboardTotals'
import { getDashboard, type SqliteDb } from '../mcp/queries'

let DatabaseImpl: DatabaseCtor

beforeAll(async () => {
  DatabaseImpl = await loadSqlite()
})

function iso(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString()
}

/** Local-midnight-safe: a date N days back at 10:00 local time. */
function daysAgoAt10(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(10, 0, 0, 0)
  return d
}

function addClosed(db: Database.Database, startedAt: string, minutes: number): void {
  db.prepare(
    `INSERT INTO entries (client_id, description, started_at, stopped_at, billable)
     VALUES (1, 'x', ?, ?, 1)`
  ).run(startedAt, new Date(Date.parse(startedAt) + minutes * 60_000).toISOString())
}

describe('readTotals', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new DatabaseImpl(':memory:')
    db.pragma('foreign_keys = ON')
    applyMigrations(db)
    db.prepare(
      `INSERT INTO clients (id, name, color, active, rate_cent) VALUES (1,'Acme','#111',1,0)`
    ).run()
  })

  it('is zero on an empty database', () => {
    expect(readTotals(db)).toEqual({ today_seconds: 0, week_seconds: 0 })
  })

  it('sums closed entries of today into both windows', () => {
    addClosed(db, iso(-3 * 3_600_000), 30)
    addClosed(db, iso(-2 * 3_600_000), 15)
    const t = readTotals(db)
    expect(t.today_seconds).toBe(45 * 60)
    expect(t.week_seconds).toBe(45 * 60)
  })

  it('counts a running entry up to now, in both windows', () => {
    db.prepare(
      `INSERT INTO entries (client_id, description, started_at, billable)
       VALUES (1, 'running', ?, 1)`
    ).run(iso(-600_000))
    const t = readTotals(db)
    expect(t.today_seconds).toBeGreaterThanOrEqual(600)
    expect(t.today_seconds).toBeLessThan(660)
    expect(t.week_seconds).toBe(t.today_seconds)
  })

  it('counts a running entry started before midnight — the cross-midnight case', () => {
    const yesterdayEvening = daysAgoAt10(1)
    yesterdayEvening.setHours(22, 0, 0, 0)
    db.prepare(
      `INSERT INTO entries (client_id, description, started_at, billable)
       VALUES (1, 'overnight', ?, 1)`
    ).run(yesterdayEvening.toISOString())
    // `OR stopped_at IS NULL` puts it in today's window even though it started
    // yesterday — the app, the tray and the dial all show it that way.
    expect(readTotals(db).today_seconds).toBeGreaterThan(8 * 3600)
  })

  it('excludes deleted entries and entries older than the week window', () => {
    addClosed(db, daysAgoAt10(0).toISOString(), 60)
    addClosed(db, daysAgoAt10(30).toISOString(), 120)
    db.prepare(
      `INSERT INTO entries (client_id, description, started_at, stopped_at, billable, deleted_at)
       VALUES (1, 'trash', ?, ?, 1, ?)`
    ).run(iso(-7_200_000), iso(-3_600_000), iso(0))

    const t = readTotals(db)
    expect(t.today_seconds).toBe(60 * 60)
    expect(t.week_seconds).toBe(60 * 60)
  })

  it('week ≥ today whenever both windows are populated', () => {
    addClosed(db, daysAgoAt10(0).toISOString(), 45)
    // Two days back is inside the window on most weekdays; either way the
    // invariant week ≥ today must hold.
    addClosed(db, daysAgoAt10(2).toISOString(), 90)
    const t = readTotals(db)
    expect(t.week_seconds).toBeGreaterThanOrEqual(t.today_seconds)
  })

  it('readRoundMinutes: off unless the setting holds a positive number', () => {
    const set = (v: string): void => {
      db.prepare(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('pdf_round_minutes', ?)`
      ).run(v)
    }
    // Unset ⇒ no rounding.
    expect(readRoundMinutes(db)).toBe(0)
    set('15')
    expect(readRoundMinutes(db)).toBe(15)
    set('0')
    expect(readRoundMinutes(db)).toBe(0)
    // Garbage must not switch rounding on — same tolerance as the renderer's
    // parseInt in RoundingContext.
    set('abc')
    expect(readRoundMinutes(db)).toBe(0)
    set('-5')
    expect(readRoundMinutes(db)).toBe(0)
  })

  it('agrees with getDashboard() — the second copy of the same definition', () => {
    addClosed(db, daysAgoAt10(0).toISOString(), 45)
    addClosed(db, daysAgoAt10(2).toISOString(), 90)
    addClosed(db, daysAgoAt10(20).toISOString(), 30)
    db.prepare(
      `INSERT INTO entries (client_id, description, started_at, billable)
       VALUES (1, 'running', ?, 1)`
    ).run(iso(-120_000))

    const mine = readTotals(db)
    const theirs = getDashboard(
      db as unknown as SqliteDb,
      { exposeRates: false, exposePrivateNotes: false },
      Date.now()
    )
    expect(mine.today_seconds).toBe(theirs.today_seconds)
    expect(mine.week_seconds).toBe(theirs.week_seconds)
  })
})
