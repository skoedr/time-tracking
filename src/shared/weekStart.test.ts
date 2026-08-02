/**
 * Tests for the week-start helper (#188).
 *
 * The interesting one is the SQL modifier order. The week card shipped with
 * `'weekday 0', '-7 days'`, which is correct on six days out of seven and
 * silently wrong on the seventh: on the boundary day `weekday N` does not
 * move, so the `-7 days` lands a week early and the "week" is eight days long.
 * Every weekday is checked here, for both settings — that is the only way this
 * class of bug shows up, because six of seven days look fine.
 *
 * SQLite evaluates the modifiers, not us: the test asserts against the real
 * date arithmetic rather than a reimplementation of it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import type Database from 'better-sqlite3'
import { loadSqlite, type DatabaseCtor } from '../test/sqlite'
import {
  DEFAULT_WEEK_START,
  parseWeekStart,
  weekStartModifiers,
  weekStartsOn,
  type WeekStart
} from './weekStart'

let DatabaseImpl: DatabaseCtor
let db: Database.Database

beforeAll(async () => {
  DatabaseImpl = await loadSqlite()
  db = new DatabaseImpl(':memory:')
})

/** Run the modifier chain against a fixed anchor date. */
function weekStartOf(date: string, week: WeekStart): string {
  const row = db.prepare(`SELECT DATE(?, ${weekStartModifiers(week)}) AS d`).get(date) as {
    d: string
  }
  return row.d
}

/** The old, subtly wrong expression — kept to demonstrate what changed. */
function legacyWeekStart(date: string): string {
  return (db.prepare(`SELECT DATE(?, 'weekday 0', '-7 days') AS d`).get(date) as { d: string }).d
}

// 2026-08-02 is a Sunday; 2026-08-03 a Monday; through 2026-08-08 (Saturday).
const WEEK = {
  sun: '2026-08-02',
  mon: '2026-08-03',
  tue: '2026-08-04',
  wed: '2026-08-05',
  thu: '2026-08-06',
  fri: '2026-08-07',
  sat: '2026-08-08'
}

describe('parseWeekStart', () => {
  it('defaults to Monday for anything that is not exactly "sunday"', () => {
    expect(DEFAULT_WEEK_START).toBe('monday')
    expect(parseWeekStart('sunday')).toBe('sunday')
    expect(parseWeekStart('monday')).toBe('monday')
    expect(parseWeekStart(undefined)).toBe('monday')
    expect(parseWeekStart(null)).toBe('monday')
    expect(parseWeekStart('')).toBe('monday')
    expect(parseWeekStart('Sunday')).toBe('monday') // exact match only
    expect(parseWeekStart('garbage')).toBe('monday')
  })

  it('maps to date-fns weekStartsOn', () => {
    expect(weekStartsOn('monday')).toBe(1)
    expect(weekStartsOn('sunday')).toBe(0)
  })
})

describe('weekStartModifiers — Monday', () => {
  it('every day of a week resolves to the same Monday', () => {
    // Monday through Sunday all belong to the week starting 2026-08-03.
    for (const day of [WEEK.mon, WEEK.tue, WEEK.wed, WEEK.thu, WEEK.fri, WEEK.sat]) {
      expect(weekStartOf(day, 'monday'), `for ${day}`).toBe(WEEK.mon)
    }
    // The Sunday BEFORE that Monday belongs to the previous week (ISO).
    expect(weekStartOf(WEEK.sun, 'monday')).toBe('2026-07-27')
  })

  it('the boundary day maps to itself, not a week back', () => {
    expect(weekStartOf(WEEK.mon, 'monday')).toBe(WEEK.mon)
  })
})

describe('weekStartModifiers — Sunday', () => {
  it('every day of a week resolves to the same Sunday', () => {
    for (const day of [WEEK.mon, WEEK.tue, WEEK.wed, WEEK.thu, WEEK.fri, WEEK.sat]) {
      expect(weekStartOf(day, 'sunday'), `for ${day}`).toBe(WEEK.sun)
    }
  })

  it('the boundary day maps to itself, not a week back', () => {
    expect(weekStartOf(WEEK.sun, 'sunday')).toBe(WEEK.sun)
  })
})

describe('the bug the old expression had', () => {
  it('agreed with the new one on six days …', () => {
    for (const day of [WEEK.mon, WEEK.tue, WEEK.wed, WEEK.thu, WEEK.fri, WEEK.sat]) {
      expect(legacyWeekStart(day), `for ${day}`).toBe(weekStartOf(day, 'sunday'))
    }
  })

  it('… and produced an eight-day week on the seventh', () => {
    // On a Sunday the old chain stepped back a full extra week: the window
    // started 2026-07-26 and therefore counted eight days.
    expect(legacyWeekStart(WEEK.sun)).toBe('2026-07-26')
    expect(weekStartOf(WEEK.sun, 'sunday')).toBe(WEEK.sun)
  })
})

describe('window length', () => {
  it('is exactly seven days from every day, for both settings', () => {
    const days = Object.values(WEEK)
    for (const week of ['monday', 'sunday'] as const) {
      for (const day of days) {
        const start = weekStartOf(day, week)
        const spanned = db
          .prepare(`SELECT CAST(julianday(?) - julianday(?) AS INTEGER) AS n`)
          .get(day, start) as { n: number }
        expect(spanned.n, `${week} / ${day}`).toBeGreaterThanOrEqual(0)
        expect(spanned.n, `${week} / ${day}`).toBeLessThan(7)
      }
    }
  })
})
