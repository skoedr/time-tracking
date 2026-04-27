import { useEffect, useMemo, useState } from 'react'
import type { Client, DashboardSummary, Entry } from '../../../shared/types'
import { useEntriesStore } from '../store/entriesStore'
import { useToastStore } from '../store/toastStore'
import { useTimer, formatDuration } from '../hooks/useTimer'
import { Dialog } from '../components/Dialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EntryEditForm } from '../components/EntryEditForm'
import type { TFunction } from '../contexts/I18nContext'
import { useT } from '../contexts/I18nContext'

/**
 * `Heute` view — the new default tab in v1.2 (D1).
 *
 * Layout:
 *   - Top: compact `Aktiver Timer` pill (or "Kein Timer läuft").
 *   - Two stat cards: today + this week (HH:MM, no seconds).
 *   - Quick-Start row: top-3 frequent clients of the last 30d.
 *   - Recent list: last 5 entries with edit / delete icons.
 *   - "+ Eintrag nachtragen" button → opens the edit form in a Dialog.
 *
 * Refresh strategy (E1): re-fetch on mount, on `entriesStore.version`
 * change (any mutation in the app bumps it), and when the running entry
 * starts/stops. No polling.
 */
export default function TodayView(): React.JSX.Element {
  const t = useT()
  const { runningEntry, clients, startWithClient } = useTimer()
  const version = useEntriesStore((s) => s.version)
  const showToast = useToastStore((s) => s.show)

  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Edit / create / delete dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<Entry | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<Entry | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      setStatus((s) => (s === 'ready' ? s : 'loading'))
      const res = await window.api.dashboard.summary()
      if (cancelled) return
      if (res.ok) {
        setSummary(res.data)
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
  }, [version, runningEntry?.id])

  const clientsById = useMemo(() => {
    const map = new Map<number, Client>()
    for (const c of clients) map.set(c.id, c)
    return map
  }, [clients])

  async function confirmDelete(entry: Entry): Promise<void> {
    setDeleteCandidate(null)
    const res = await window.api.entries.delete(entry.id)
    if (!res.ok) {
      showToast(t('common.entryDeleteFailed', { error: res.error }))
      return
    }
    useEntriesStore.getState().bumpVersion()
    showToast(t('common.entryDeleted'), {
      label: t('common.undo'),
      type: 'undo_delete',
      data: { entryId: entry.id }
    })
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <ActiveTimerPill runningEntry={runningEntry} clientsById={clientsById} />

      {status === 'loading' && <SummarySkeleton />}
      {status === 'error' && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-4 text-sm text-red-200">
          <p className="mb-2 font-medium">{t('today.error.title')}</p>
          {errorMsg && <p className="mb-2 text-xs text-red-300/80">{errorMsg}</p>}
          <button
            type="button"
            className="rounded bg-red-800 px-3 py-1 text-xs hover:bg-red-700"
            onClick={() => useEntriesStore.getState().bumpVersion()}
          >
            {t('common.retry')}
          </button>
        </div>
      )}
      {status === 'ready' && summary && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label={t('today.stats.today')} seconds={summary.todaySeconds} accent="text-indigo-300" />
            <StatCard label={t('today.stats.week')} seconds={summary.weekSeconds} accent="text-emerald-300" />
          </div>

          <QuickStartRow
            topClients={summary.topClients30d}
            disabled={!!runningEntry}
            clientsById={clientsById}
            onStart={(id) => void startWithClient(id)}
          />

          <RecentList
            entries={summary.recentEntries}
            clientsById={clientsById}
            onEdit={(e) => setEditEntry(e)}
            onDelete={(e) => setDeleteCandidate(e)}
          />
        </>
      )}

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        disabled={clients.length === 0}
        className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('today.addEntry')}
      </button>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('today.dialog.add')}
        widthClass="w-[520px]"
      >
        <EntryEditForm
          clients={clients}
          defaultDate={defaultBackfillStart()}
          onSaved={() => {
            setCreateOpen(false)
            showToast(t('common.entrySaved'))
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </Dialog>

      <Dialog
        open={editEntry !== null}
        onClose={() => setEditEntry(null)}
        title={t('today.dialog.edit')}
        widthClass="w-[520px]"
      >
        {editEntry && (
          <EntryEditForm
            entry={editEntry}
            clients={clients}
            onSaved={() => {
              setEditEntry(null)
              showToast('Eintrag gespeichert')
            }}
            onCancel={() => setEditEntry(null)}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={deleteCandidate !== null}
        title={t('common.deleteEntryTitle')}
        message={
          deleteCandidate
            ? buildDeleteMessage(deleteCandidate, clientsById.get(deleteCandidate.client_id), t)
            : ''
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={() => deleteCandidate && void confirmDelete(deleteCandidate)}
        onCancel={() => setDeleteCandidate(null)}
      />
    </div>
  )
}

function ActiveTimerPill({
  runningEntry,
  clientsById
}: {
  runningEntry: Entry | null
  clientsById: Map<number, Client>
}): React.JSX.Element {
  const t = useT()
  // A `now` tick instead of derived `tickSeconds` so we don't call
  // setState synchronously when `runningEntry` changes (lint rule).
  const [, setNow] = useState(0)
  useEffect(() => {
    if (!runningEntry) return
    const id = setInterval(() => setNow((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [runningEntry])
  const tickSeconds = liveSeconds(runningEntry)

  if (!runningEntry) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm text-slate-500">
        {t('today.noTimer')}
      </div>
    )
  }
  const client = clientsById.get(runningEntry.client_id)
  return (
    <div className="flex items-center gap-3 rounded-lg border border-emerald-700/60 bg-emerald-900/20 px-4 py-2 text-sm">
      <span
        className="h-2.5 w-2.5 animate-pulse rounded-full"
        style={{ backgroundColor: client?.color ?? '#10b981' }}
      />
      <span className="font-medium text-slate-100">{client?.name ?? t('common.unknown')}</span>
      {runningEntry.description && (
        <span className="truncate text-slate-400">— {runningEntry.description}</span>
      )}
      <span className="ml-auto font-mono tabular-nums text-emerald-300">
        {formatDuration(tickSeconds)}
      </span>
    </div>
  )
}

function StatCard({
  label,
  seconds,
  accent
}: {
  label: string
  seconds: number
  accent: string
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 font-mono text-3xl font-bold tabular-nums ${accent}`}>
        {formatHHMM(seconds)}
      </p>
    </div>
  )
}

function QuickStartRow({
  topClients,
  disabled,
  clientsById,
  onStart
}: {
  topClients: DashboardSummary['topClients30d']
  disabled: boolean
  clientsById: Map<number, Client>
  onStart: (clientId: number) => void
}): React.JSX.Element | null {
  const t = useT()
  if (topClients.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">{t('today.quickstart.label')}</span>
      {topClients.map((c) => {
        const stillActive = clientsById.get(c.client_id)?.active === 1
        return (
          <button
            key={c.client_id}
            type="button"
            disabled={disabled || !stillActive}
            onClick={() => onStart(c.client_id)}
            className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:border-indigo-500 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            title={stillActive ? t('today.quickstart.startFor', { name: c.name }) : t('today.quickstart.clientInactive')}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
            {c.name}
          </button>
        )
      })}
    </div>
  )
}

function RecentList({
  entries,
  clientsById,
  onEdit,
  onDelete
}: {
  entries: Entry[]
  clientsById: Map<number, Client>
  onEdit: (e: Entry) => void
  onDelete: (e: Entry) => void
}): React.JSX.Element {
  const t = useT()
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/40 px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-300">{t('today.recent.empty')}</p>
        <p className="mt-1 text-xs text-slate-500">
          {t('today.recent.emptyHint')}
        </p>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-slate-800 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{t('today.table.time')}</th>
            <th className="px-3 py-2 text-left font-medium">{t('today.table.client')}</th>
            <th className="px-3 py-2 text-left font-medium">{t('today.table.description')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('today.table.duration')}</th>
            <th className="w-20 px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-900/40">
          {entries.map((e) => {
            const client = clientsById.get(e.client_id)
            return (
              <tr key={e.id} className="hover:bg-slate-800/60">
                <td className="px-3 py-2 font-mono text-xs text-slate-300 tabular-nums">
                  {formatTimeRange(e)}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2 text-slate-200">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: client?.color ?? '#64748b' }}
                    />
                    {client?.name ?? t('common.unknown')}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-300">
                  <span className="block max-w-[280px] truncate" title={e.description}>
                    {e.description || <span className="text-slate-600">—</span>}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-slate-300 tabular-nums">
                  {formatHHMM(durationSeconds(e))}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(e)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      aria-label={t('common.edit')}
                      title={t('common.edit')}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(e)}
                      disabled={e.stopped_at === null}
                      className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={t('common.delete')}
                      title={e.stopped_at === null ? t('common.stopRunningFirst') : t('common.delete')}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SummarySkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="h-24 animate-pulse rounded-lg bg-slate-800" />
        <div className="h-24 animate-pulse rounded-lg bg-slate-800" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-slate-800" />
        ))}
      </div>
    </div>
  )
}

// --- helpers ---

function liveSeconds(entry: Entry | null): number {
  if (!entry) return 0
  return Math.floor((Date.now() - new Date(entry.started_at).getTime()) / 1000)
}

function durationSeconds(entry: Entry): number {
  if (!entry.stopped_at) return liveSeconds(entry)
  return Math.floor(
    (new Date(entry.stopped_at).getTime() - new Date(entry.started_at).getTime()) / 1000
  )
}

/** Format seconds as HH:MM (no seconds, for stat cards / durations). */
function formatHHMM(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatTimeRange(e: Entry): string {
  const start = new Date(e.started_at)
  const startStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
  if (!e.stopped_at) return `${startStr} – …`
  const stop = new Date(e.stopped_at)
  const stopStr = `${String(stop.getHours()).padStart(2, '0')}:${String(stop.getMinutes()).padStart(2, '0')}`
  return `${startStr} – ${stopStr}`
}

/** Default `defaultDate` for "+ Eintrag nachtragen": one hour ago. */
function defaultBackfillStart(): Date {
  return new Date(Date.now() - 60 * 60 * 1000)
}

function buildDeleteMessage(
  entry: Entry,
  client: Client | undefined,
  t: TFunction
): string {
  const dur = formatHHMM(durationSeconds(entry))
  const date = new Date(entry.started_at)
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const name = client?.name ?? t('common.unknown')
  return t('common.deleteEntryMessage', { client: name, date: dateStr, duration: dur })
}
