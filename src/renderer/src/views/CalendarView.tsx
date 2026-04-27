import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../contexts/I18nContext'
import type { TranslationKey } from '../../../shared/locales/de'
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  getISOWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import type { Entry } from '../../../shared/types'
import type { Client } from '../../../shared/types'
import { getQuickRange, type QuickRangeKind } from '../../../shared/dateRanges'
import { useEntriesStore } from '../store/entriesStore'
import { useTimer } from '../hooks/useTimer'
import { CalendarDrawer } from '../components/CalendarDrawer'
import { ExportModal } from '../components/ExportModal'
import { PdfMergeModal } from '../components/PdfMergeModal'

/**
 * Month-grid calendar view. 7×N rows, KW column on the left.
 * Click a cell → opens `CalendarDrawer` with that day's entries.
 *
 * Performance budget (E12): grouping + render for 200 entries < 100ms.
 * The grouping pass is `O(n)` and uses local YYYY-MM-DD strings as keys.
 *
 * Refresh: re-fetches `entries:getByMonth` on mount, on month change,
 * and on `entriesStore.version` bump.
 */
export default function CalendarView(): React.JSX.Element {
  const t = useT()
  const { clients } = useTimer()
  const version = useEntriesStore((s) => s.version)

  const months = MONTHS_KEYS.map((k) => t(k as import('../../../shared/locales/de').TranslationKey))

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [entries, setEntries] = useState<Entry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [focusDay, setFocusDay] = useState<Date>(() => new Date())
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      setStatus((s) => (s === 'ready' ? s : 'loading'))
      const res = await window.api.entries.getByMonth({
        year: cursor.getFullYear(),
        month: cursor.getMonth() + 1
      })
      if (cancelled) return
      if (res.ok) {
        setEntries(res.data)
        setStatus('ready')
        setErrorMsg(null)
      } else {
        setStatus('error')
        setErrorMsg(res.error)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [cursor, version])

  // Group entries by local YYYY-MM-DD (the local-day key).
  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of entries) {
      const key = localDateKey(new Date(e.started_at))
      const arr = map.get(key)
      if (arr) arr.push(e)
      else map.set(key, [e])
    }
    return map
  }, [entries])

  // Build the visible grid (Mon-anchored weeks covering the whole month).
  const weeks = useMemo(() => buildMonthWeeks(cursor), [cursor])

  const onPrev = useCallback(() => setCursor((d) => addMonths(d, -1)), [])
  const onNext = useCallback(() => setCursor((d) => addMonths(d, 1)), [])
  const onToday = useCallback(() => {
    const today = new Date()
    setCursor(startOfMonth(today))
    setFocusDay(today)
  }, [])

  // PDF export modal state — opened by the quick-filter pills with the
  // selected range pre-filled (#21).
  const [pdfRange, setPdfRange] = useState<{ fromIso: string; toIso: string } | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)

  const onQuickRange = useCallback((kind: QuickRangeKind) => {
    const range = getQuickRange(kind, new Date())
    setPdfRange({ fromIso: localDateKey(range.from), toIso: localDateKey(range.to) })
  }, [])

  // Keyboard navigation on the grid.
  function handleKey(e: React.KeyboardEvent): void {
    let next: Date | null = null
    if (e.key === 'ArrowLeft') next = addDays(focusDay, -1)
    else if (e.key === 'ArrowRight') next = addDays(focusDay, 1)
    else if (e.key === 'ArrowUp') next = addDays(focusDay, -7)
    else if (e.key === 'ArrowDown') next = addDays(focusDay, 7)
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setSelectedDay(focusDay)
      return
    } else return
    e.preventDefault()
    setFocusDay(next)
    if (!isSameMonth(next, cursor)) setCursor(startOfMonth(next))
  }

  // When focusDay changes, move DOM focus to it (if rendered).
  useEffect(() => {
    if (!gridRef.current) return
    const key = localDateKey(focusDay)
    const cell = gridRef.current.querySelector<HTMLElement>(`[data-day="${key}"]`)
    cell?.focus({ preventScroll: true })
  }, [focusDay, cursor])

  const selectedKey = selectedDay ? localDateKey(selectedDay) : null
  const drawerEntries = selectedKey ? (byDay.get(selectedKey) ?? []) : []

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          className="grid h-9 w-9 place-items-center rounded-lg border backdrop-blur-xl hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text2)' }}
          aria-label={t('calendar.nav.prev')}
        >
          ‹
        </button>
        <h2 className="min-w-[200px] text-center text-lg font-semibold" style={{ color: 'var(--text)' }}>
          {formatMonthHeader(cursor, months)}
        </h2>
        <button
          type="button"
          onClick={onNext}
          className="grid h-9 w-9 place-items-center rounded-lg border backdrop-blur-xl hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text2)' }}
          aria-label={t('calendar.nav.next')}
        >
          ›
        </button>
        <button
          type="button"
          onClick={onToday}
          className="ml-2 rounded-lg border px-3 py-1.5 text-sm font-medium backdrop-blur-xl hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
        >
          {t('calendar.nav.today')}
        </button>
        {status === 'loading' && <span className="ml-auto text-xs" style={{ color: 'var(--text3)' }}>{t('calendar.status.loading')}</span>}
        {status === 'error' && (
          <span className="ml-auto text-xs" style={{ color: 'var(--danger)' }} title={errorMsg ?? ''}>
            {t('calendar.status.error')}
          </span>
        )}
      </div>

      {/* PDF quick-filter row (#21). Hero "Letzter Monat" gets the accent
          colour to draw the eye on the most common rechnungs-flow. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onQuickRange('lastMonth')}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          style={{ background: 'var(--accent)' }}
          title={t('calendar.export.lastMonthTitle')}
        >
          {t('calendar.export.lastMonth')}
        </button>
        <span className="ml-1 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>{t('calendar.export.rangeLabel')}</span>
        {(['thisWeek', 'lastWeek', 'thisMonth'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onQuickRange(k)}
            className="rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-xl hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
          >
            {t(('calendar.range.' + k) as TranslationKey)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMergeOpen(true)}
          className="ml-auto rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-xl hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
          title={t('calendar.export.mergeTitle')}
        >
          {t('calendar.export.merge')}
        </button>
      </div>

      {/* Header row: KW + Mo–So */}
      <div
        className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] gap-px rounded-t-lg"
        style={{ background: 'var(--card-border)' }}
      >
        <div
          className="px-2 py-1 text-center text-xs font-medium"
          style={{ background: 'var(--nav-bg)', color: 'var(--text3)' }}
        >
          {t('calendar.header.week')}
        </div>
        {(['calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed', 'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat', 'calendar.days.sun'] as TranslationKey[]).map((k) => (
          <div
            key={k}
            className="px-2 py-1 text-center text-xs font-medium"
            style={{ background: 'var(--nav-bg)', color: 'var(--text2)' }}
          >
            {t(k)}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        role="grid"
        aria-label={t('calendar.grid.aria')}
        onKeyDown={handleKey}
        className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] gap-px rounded-b-lg"
        style={{ background: 'var(--card-border)' }}
      >
        {weeks.map((week) => (
          <Week
            key={week.weekKey}
            week={week}
            cursor={cursor}
            byDay={byDay}
            clients={clients}
            focusDay={focusDay}
            months={months}
            onSelect={(d) => {
              setFocusDay(d)
              setSelectedDay(d)
            }}
          />
        ))}
      </div>

      <CalendarDrawer
        open={selectedDay !== null}
        dateISO={selectedDay ? localDateKey(selectedDay) : ''}
        entries={drawerEntries}
        clients={clients}
        onClose={() => setSelectedDay(null)}
      />

      <ExportModal
        key={pdfRange ? `${pdfRange.fromIso}-${pdfRange.toIso}` : 'closed'}
        open={pdfRange !== null}
        prefilledRange={pdfRange ?? undefined}
        onClose={() => setPdfRange(null)}
      />

      <PdfMergeModal open={mergeOpen} onClose={() => setMergeOpen(false)} />
    </div>
  )
}

interface WeekData {
  weekKey: string
  weekNumber: number
  days: Date[]
}

function Week({
  week,
  cursor,
  byDay,
  clients,
  focusDay,
  months,
  onSelect
}: {
  week: WeekData
  cursor: Date
  byDay: Map<string, Entry[]>
  clients: Client[]
  focusDay: Date
  months: readonly string[]
  onSelect: (d: Date) => void
}): React.JSX.Element {
  return (
    <>
      <div
        className="px-2 py-2 text-center text-xs"
        style={{ background: 'var(--nav-bg)', color: 'var(--text3)' }}
      >
        {week.weekNumber}
      </div>
      {week.days.map((day) => {
        const key = localDateKey(day)
        const dayEntries = byDay.get(key) ?? []
        const inMonth = isSameMonth(day, cursor)
        const isToday = isSameDay(day, new Date())
        const isFocus = isSameDay(day, focusDay)
        const totalSeconds = dayEntries.reduce((sum, e) => sum + entryDurationSeconds(e), 0)
        return (
          <button
            key={key}
            type="button"
            data-day={key}
            tabIndex={isFocus ? 0 : -1}
            role="gridcell"
            aria-label={`${formatAriaDate(day, months)}${dayEntries.length ? `, ${dayEntries.length}` : ''}`}
            onClick={() => onSelect(day)}
            className={[
              'relative flex h-24 flex-col gap-0.5 px-2 py-1 text-left transition-colors backdrop-blur-xl',
              'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400',
              !inMonth && 'opacity-40',
              isToday && 'border-2 border-indigo-500'
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ background: 'var(--card-bg)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--card-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--card-bg)')}
          >
            <div className="flex items-start justify-between">
              <span
                className="text-sm font-semibold"
                style={{ color: isToday ? 'var(--accent)' : 'var(--text)' }}
              >
                {day.getDate()}
              </span>
              {dayEntries.length > 0 && (
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--text3)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatHHMM(totalSeconds)}
                </span>
              )}
            </div>
            <DayBars entries={dayEntries} clients={clients} />
          </button>
        )
      })}
    </>
  )
}

const MAX_BARS = 5

/** Indigo fallback when an entry's client_id no longer resolves
 *  (deleted client, race during reload, etc.) — same accent as the
 *  rest of the calendar UI so it still reads as "an entry". */
const DEFAULT_BAR_COLOR = '#6366f1'

function DayBars({
  entries,
  clients
}: {
  entries: Entry[]
  clients: Client[]
}): React.JSX.Element | null {
  if (entries.length === 0) return null
  const visible = entries.slice(0, MAX_BARS)
  const overflow = entries.length - visible.length
  const colorById = new Map(clients.map((c) => [c.id, c.color]))
  return (
    <div className="mt-auto flex flex-col gap-[2px]">
      {visible.map((e) => {
        const color = colorById.get(e.client_id) ?? DEFAULT_BAR_COLOR
        const clientName = clients.find((c) => c.id === e.client_id)?.name ?? 'Eintrag'
        const label = e.description ? `${clientName} — ${e.description}` : clientName
        return (
          <div
            key={e.id}
            className="h-[3px] rounded-sm"
            style={{ backgroundColor: color }}
            title={`${label} (${formatHHMM(entryDurationSeconds(e))})`}
          />
        )
      })}
      {overflow > 0 && <span className="text-[10px]" style={{ color: 'var(--text3)' }}>+{overflow}</span>}
    </div>
  )
}

// --- helpers ---

function buildMonthWeeks(cursor: Date): WeekData[] {
  // Mon-anchored weeks covering the visible month.
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
  const weeks: WeekData[] = []
  let d = start
  while (d <= end) {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      days.push(d)
      d = addDays(d, 1)
    }
    weeks.push({
      weekKey: localDateKey(days[0]),
      weekNumber: getISOWeek(days[0]),
      days
    })
  }
  return weeks
}

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

function entryDurationSeconds(e: Entry): number {
  const stop = e.stopped_at ? new Date(e.stopped_at).getTime() : Date.now()
  return Math.max(0, Math.floor((stop - new Date(e.started_at).getTime()) / 1000))
}

function formatHHMM(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const MONTHS_KEYS = [
  'calendar.months.jan',
  'calendar.months.feb',
  'calendar.months.mar',
  'calendar.months.apr',
  'calendar.months.may',
  'calendar.months.jun',
  'calendar.months.jul',
  'calendar.months.aug',
  'calendar.months.sep',
  'calendar.months.oct',
  'calendar.months.nov',
  'calendar.months.dec',
] as const

function formatMonthHeader(d: Date, months: readonly string[]): string {
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

function formatAriaDate(d: Date, months: readonly string[]): string {
  return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`
}
