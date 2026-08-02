/**
 * Where the week begins (#188).
 *
 * Until v1.17 the app disagreed with itself: the "Heute" week card and the MCP
 * dashboard counted from Sunday, while the export quick filters and the
 * calendar grid counted from Monday. One setting now decides, and every
 * surface that shows a *week* reads it from here.
 *
 * The one exception is the 12-week chart in Auswertung: its bars are labelled
 * `KW##`, and the calendar week is defined by ISO 8601 as Monday-based. That
 * is not a matter of taste, so those buckets stay Monday no matter what this
 * setting says.
 */

export type WeekStart = 'monday' | 'sunday'

/**
 * Monday — what three of the app's five week computations already did, and
 * what ISO 8601 and the de-DE locale expect. Installations that ran the old
 * Sunday-based week card see that one number change once (release note), and
 * can set it back here.
 */
export const DEFAULT_WEEK_START: WeekStart = 'monday'

export const WEEK_START_SETTING_KEY = 'week_start'

/** Anything that is not exactly `sunday` is the default — settings are text. */
export function parseWeekStart(value: string | null | undefined): WeekStart {
  return value === 'sunday' ? 'sunday' : DEFAULT_WEEK_START
}

/** date-fns `weekStartsOn`: 0 = Sunday, 1 = Monday. */
export function weekStartsOn(week: WeekStart): 0 | 1 {
  return week === 'sunday' ? 0 : 1
}

/**
 * SQLite modifiers that move a date to the start of *its own* week.
 *
 * Order matters, and the obvious order is wrong. `'weekday N', '-7 days'`
 * (what the week card shipped with) advances to the *coming* weekday first —
 * so on the boundary day itself it stays put, and the `-7 days` then lands a
 * whole week early: an eight-day "week" every Sunday.
 *
 * `'-6 days', 'weekday N'` has no such day. Step back six days, then forward
 * to the next boundary: for every weekday including the boundary itself, that
 * is the start of the current week. `weekStart.test.ts` pins all seven days
 * for both settings.
 */
export function weekStartModifiers(week: WeekStart): string {
  return `'-6 days', 'weekday ${weekStartsOn(week)}'`
}
