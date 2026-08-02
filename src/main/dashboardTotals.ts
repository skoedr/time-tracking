/**
 * Hours today / this week — the two numbers the "Heute" view shows as stat
 * cards, and the same two the Stream Deck dial shows on its ambient face
 * (#186).
 *
 * Electron-free and DB-injected, so both callers read from ONE definition:
 * the `dashboard:summary` IPC handler (app window) and the controller scope of
 * the write bridge (`get_summary`). "The dial shows what the main page shows"
 * is then true by construction instead of by assertion.
 */
import type Database from 'better-sqlite3'
import {
  parseWeekStart,
  weekStartModifiers,
  WEEK_START_SETTING_KEY,
  type WeekStart
} from '../shared/weekStart'

type Db = Database.Database

/** Seconds of an entry; a running one counts up to now. */
const SECONDS = `CASE
       WHEN stopped_at IS NULL
         THEN CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', started_at) AS INTEGER)
       ELSE CAST(strftime('%s', stopped_at) AS INTEGER) - CAST(strftime('%s', started_at) AS INTEGER)
     END`

/**
 * Start of the week window, per the `week_start` setting (#188). Monday by
 * default — see `src/shared/weekStart.ts` for why, and for why the modifier
 * order is `'-6 days', 'weekday N'` and not the other way round.
 */
function weekStartExpr(db: Db): string {
  return `DATE('now', 'localtime', ${weekStartModifiers(readWeekStart(db))})`
}

/** The configured week start; absent or unreadable ⇒ the default (Monday). */
export function readWeekStart(db: Db): WeekStart {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(WEEK_START_SETTING_KEY) as
    | { value: string }
    | undefined
  return parseWeekStart(row?.value)
}

export interface DayWeekTotals {
  today_seconds: number
  week_seconds: number
}

/**
 * The rounding step the app applies before *showing* a duration
 * (`pdf_round_minutes`, ceiling arithmetic — see `roundDuration`). 0 = off.
 *
 * The stat cards on the "Heute" page round; the raw seconds stay in the
 * payload. Any surface that wants to show the same number as the app has to
 * round the same way, which is what tripped up the first version of the dial:
 * 6:24 raw against 6:30 on screen at a 15-minute step.
 */
export function readRoundMinutes(db: Db): number {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'pdf_round_minutes'`).get() as
    | { value: string }
    | undefined
  const n = parseInt(row?.value ?? '0', 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Both totals in one read. A running entry is always included in both windows
 * (`OR stopped_at IS NULL`) even when it was started before midnight — that is
 * what makes the tray, the stat cards and the dial agree while a timer runs.
 */
export function readTotals(db: Db): DayWeekTotals {
  const today = db
    .prepare(
      `SELECT COALESCE(SUM(${SECONDS}), 0) AS seconds
         FROM entries
        WHERE deleted_at IS NULL
          AND (DATE(started_at, 'localtime') = DATE('now', 'localtime')
               OR stopped_at IS NULL)`
    )
    .get() as { seconds: number }

  const week = db
    .prepare(
      `SELECT COALESCE(SUM(${SECONDS}), 0) AS seconds
         FROM entries
        WHERE deleted_at IS NULL
          AND (DATE(started_at, 'localtime') >= ${weekStartExpr(db)}
               OR stopped_at IS NULL)`
    )
    .get() as { seconds: number }

  return {
    today_seconds: Math.max(0, Math.floor(today.seconds ?? 0)),
    week_seconds: Math.max(0, Math.floor(week.seconds ?? 0))
  }
}
