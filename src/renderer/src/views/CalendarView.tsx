import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useEntriesStore } from '../store/entriesStore'
import { useTimer } from '../hooks/useTimer'
import { CalendarDrawer } from '../components/CalendarDrawer'

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
  const { clients } = useTimer()
  const version = useEntriesStore((s) => s.version)

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
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label="Vorheriger Monat"
        >
          ‹
        </button>
        <h2 className="min-w-[200px] text-center text-lg font-semibold text-slate-100">
          {formatMonthHeader(cursor)}
        </h2>
        <button
          type="button"
          onClick={onNext}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label="Nächster Monat"
        >
          ›
        </button>
        <button
          type="button"
          onClick={onToday}
          className="ml-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          Heute
        </button>
        {status === 'loading' && <span className="ml-auto text-xs text-slate-500">Lade…</span>}
        {status === 'error' && (
          <span className="ml-auto text-xs text-red-400" title={errorMsg ?? ''}>
            Fehler beim Laden
          </span>
        )}
      </div>

      {/* Header row: KW + Mo–So */}
      <div className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] gap-px rounded-t-lg bg-slate-700">
        <div className="bg-slate-800 px-2 py-1 text-center text-xs font-medium text-slate-500">
          KW
        </div>
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
          <div
            key={d}
            className="bg-slate-800 px-2 py-1 text-center text-xs font-medium text-slate-400"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        role="grid"
        aria-label="Kalender"
        onKeyDown={handleKey}
        className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] gap-px rounded-b-lg bg-slate-700"
      >
        {weeks.map((week) => (
          <Week
            key={week.weekKey}
            week={week}
            cursor={cursor}
            byDay={byDay}
            focusDay={focusDay}
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
  focusDay,
  onSelect
}: {
  week: WeekData
  cursor: Date
  byDay: Map<string, Entry[]>
  focusDay: Date
  onSelect: (d: Date) => void
}): React.JSX.Element {
  return (
    <>
      <div className="bg-slate-900/60 px-2 py-2 text-center text-xs text-slate-500">
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
            aria-label={`${formatAriaDate(day)}${dayEntries.length ? `, ${dayEntries.length} Einträge` : ''}`}
            onClick={() => onSelect(day)}
            className={[
              'relative flex h-24 flex-col gap-0.5 px-2 py-1 text-left transition-colors',
              'bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400',
              !inMonth && 'opacity-40',
              isToday && 'border-2 border-indigo-500'
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="flex items-start justify-between">
              <span
                className={`text-sm font-semibold ${isToday ? 'text-indigo-300' : 'text-slate-100'}`}
              >
                {day.getDate()}
              </span>
              {dayEntries.length > 0 && (
                <span className="font-mono text-[10px] tabular-nums text-slate-400">
                  {formatHHMM(totalSeconds)}
                </span>
              )}
            </div>
            <DayBars entries={dayEntries} />
          </button>
        )
      })}
    </>
  )
}

const MAX_BARS = 5

function DayBars({ entries }: { entries: Entry[] }): React.JSX.Element | null {
  if (entries.length === 0) return null
  const visible = entries.slice(0, MAX_BARS)
  const overflow = entries.length - visible.length
  return (
    <div className="mt-auto flex flex-col gap-[2px]">
      {visible.map((e) => (
        <div
          key={e.id}
          className="h-[3px] rounded-sm"
          style={{ backgroundColor: '#6366f1' }}
          title={`${e.description || 'Eintrag'} (${formatHHMM(entryDurationSeconds(e))})`}
        />
      ))}
      {overflow > 0 && <span className="text-[10px] text-slate-400">+{overflow}</span>}
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

const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember'
]

function formatMonthHeader(d: Date): string {
  return `${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`
}

function formatAriaDate(d: Date): string {
  return `${d.getDate()}. ${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`
}
