import { endOfMonth, endOfWeek, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { DEFAULT_WEEK_START, weekStartsOn, type WeekStart } from './weekStart'

/**
 * Quick-filter ranges for the calendar / PDF export hero path (#21).
 *
 * Returned `from` is the inclusive start (00:00:00.000 local) and `to` is
 * the inclusive end (23:59:59.999 local). DST-safe because date-fns
 * normalises to local wall-clock. The week anchor follows the `week_start`
 * setting (#188); callers that do not pass one get the default.
 */
export type QuickRangeKind = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'

export interface DateRange {
  from: Date
  to: Date
}

export function getQuickRange(
  kind: QuickRangeKind,
  now: Date,
  week: WeekStart = DEFAULT_WEEK_START
): DateRange {
  const opts = { weekStartsOn: weekStartsOn(week) } as const
  switch (kind) {
    case 'thisWeek':
      return { from: startOfWeek(now, opts), to: endOfWeek(now, opts) }
    case 'lastWeek': {
      const ref = subWeeks(now, 1)
      return { from: startOfWeek(ref, opts), to: endOfWeek(ref, opts) }
    }
    case 'thisMonth':
      return { from: startOfMonth(now), to: endOfMonth(now) }
    case 'lastMonth': {
      const ref = subMonths(now, 1)
      return { from: startOfMonth(ref), to: endOfMonth(ref) }
    }
  }
}

/**
 * `YYYY-MM-DD` for a Date's **local** calendar day.
 *
 * Deliberately not `toISOString().slice(0, 10)`, which converts to UTC first
 * and therefore reports the previous day for any local time before the UTC
 * offset (e.g. 00:30 in CEST). Used both for calendar grid keys and to hand a
 * quick range to the export modal, which expects local day boundaries.
 */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const QUICK_RANGE_LABELS: Record<QuickRangeKind, string> = {
  thisWeek: 'Diese Woche',
  lastWeek: 'Letzte Woche',
  thisMonth: 'Dieser Monat',
  lastMonth: 'Letzter Monat'
}
