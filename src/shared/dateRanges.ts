import { endOfMonth, endOfWeek, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'

/**
 * Quick-filter ranges for the calendar / PDF export hero path (#21).
 *
 * Returned `from` is the inclusive start (00:00:00.000 local) and `to` is
 * the inclusive end (23:59:59.999 local). DST-safe because date-fns
 * normalises to local wall-clock and we anchor weeks to Monday for the
 * de-DE locale.
 */
export type QuickRangeKind = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'

export interface DateRange {
  from: Date
  to: Date
}

const WEEK_OPTS = { weekStartsOn: 1 } as const // Monday

export function getQuickRange(kind: QuickRangeKind, now: Date): DateRange {
  switch (kind) {
    case 'thisWeek':
      return { from: startOfWeek(now, WEEK_OPTS), to: endOfWeek(now, WEEK_OPTS) }
    case 'lastWeek': {
      const ref = subWeeks(now, 1)
      return { from: startOfWeek(ref, WEEK_OPTS), to: endOfWeek(ref, WEEK_OPTS) }
    }
    case 'thisMonth':
      return { from: startOfMonth(now), to: endOfMonth(now) }
    case 'lastMonth': {
      const ref = subMonths(now, 1)
      return { from: startOfMonth(ref), to: endOfMonth(ref) }
    }
  }
}

export const QUICK_RANGE_LABELS: Record<QuickRangeKind, string> = {
  thisWeek: 'Diese Woche',
  lastWeek: 'Letzte Woche',
  thisMonth: 'Dieser Monat',
  lastMonth: 'Letzter Monat'
}
