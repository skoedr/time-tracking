import { useEffect, useMemo, useRef, useState } from 'react'
import type { Client, DashboardSummary, Entry, Project } from '../../../shared/types'
import { useEntriesStore } from '../store/entriesStore'
import { useProjectsStore } from '../store/projectsStore'
import { useToastStore } from '../store/toastStore'
import { useTimer, formatDuration } from '../hooks/useTimer'
import { Dialog } from '../components/Dialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EntryEditForm } from '../components/EntryEditForm'
import * as Icons from '../components/Icons'
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
  const { runningEntry, clients, startWithClient, stop } = useTimer()
  const version = useEntriesStore((s) => s.version)
  const projectsVersion = useProjectsStore((s) => s.version)
  const showToast = useToastStore((s) => s.show)

  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [projectsById, setProjectsById] = useState<Map<number, Project>>(new Map())

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

  // Load all projects for name lookup — re-fetch when projects are added/edited
  useEffect(() => {
    void window.api.projects.getAll({}).then((res) => {
      if (res.ok) {
        const map = new Map<number, Project>()
        for (const p of res.data) map.set(p.id, p)
        setProjectsById(map)
      }
    })
  }, [projectsVersion])

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
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6">
      <ActiveTimerPill runningEntry={runningEntry} clientsById={clientsById} projectsById={projectsById} onStop={() => void stop()} />

      {status === 'loading' && <SummarySkeleton />}
      {status === 'error' && (
        <div className="rounded-[14px] border border-red-700/50 bg-red-900/20 p-4 text-sm text-red-200">
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
            <StatCard label={t('today.stats.today')} seconds={summary.todaySeconds} accentColor="var(--accent)" />
            <StatCard label={t('today.stats.week')} seconds={summary.weekSeconds} accentColor="var(--green)" />
          </div>

          <QuickStartRow
            topClients={summary.topClients30d}
            disabled={!!runningEntry}
            clientsById={clientsById}
            projectsById={projectsById}
            onStart={(id, projectId) => void startWithClient(id, projectId)}
          />

          <RecentList
            entries={summary.recentEntries}
            clientsById={clientsById}
            projectsById={projectsById}
            onEdit={(e) => setEditEntry(e)}
            onDelete={(e) => setDeleteCandidate(e)}
          />
        </>
      )}

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        disabled={clients.length === 0}
        className="self-start flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
      >
        <Icons.Plus />
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
  clientsById,
  projectsById,
  onStop
}: {
  runningEntry: Entry | null
  clientsById: Map<number, Client>
  projectsById: Map<number, Project>
  onStop: () => void
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
      <div
        className="rounded-[14px] border px-4 py-2 text-sm backdrop-blur-xl"
        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text3)' }}
      >
        {t('today.noTimer')}
      </div>
    )
  }
  const client = clientsById.get(runningEntry.client_id)
  const runningProject = runningEntry.project_id != null ? projectsById.get(runningEntry.project_id) : undefined
  return (
    <div
      className="flex items-center gap-3 rounded-[14px] border px-4 py-2 text-sm backdrop-blur-xl"
      style={{
        background: 'linear-gradient(90deg, var(--green-bg), var(--card-bg))',
        borderColor: 'var(--green)',
        color: 'var(--text)'
      }}
    >
      <span
        className="h-2.5 w-2.5 animate-pulse rounded-full"
        style={{ backgroundColor: runningProject?.color || (client?.color ?? '#10b981') }}
      />
      <span className="font-medium" style={{ color: 'var(--text)' }}>{client?.name ?? t('common.unknown')}</span>
      {runningEntry.description && (
        <span className="truncate" style={{ color: 'var(--text2)' }}>— {runningEntry.description}</span>
      )}
      <span className="ml-auto tabular-nums" style={{ color: 'var(--green)', fontFamily: "'JetBrains Mono', monospace" }}>
        {formatDuration(tickSeconds)}
      </span>
      <button
        type="button"
        onClick={onStop}
        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-400"
        style={{ color: 'var(--danger)' }}
        title="Timer stoppen"
        aria-label="Timer stoppen"
      >
        <Icons.Stop width={14} height={14} />
      </button>
    </div>
  )
}

function StatCard({
  label,
  seconds,
  accentColor
}: {
  label: string
  seconds: number
  accentColor: string
}): React.JSX.Element {
  return (
    <div
      className="rounded-[14px] border p-4 backdrop-blur-xl"
      style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text3)' }}>{label}</p>
      <p
        className="mt-2 tabular-nums"
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 40, fontWeight: 700, lineHeight: 1, letterSpacing: 2, color: accentColor }}
      >
        {formatHHMM(seconds)}
      </p>
    </div>
  )
}

function QuickStartRow({
  topClients,
  disabled,
  clientsById,
  projectsById,
  onStart
}: {
  topClients: DashboardSummary['topClients30d']
  disabled: boolean
  clientsById: Map<number, Client>
  projectsById: Map<number, Project>
  onStart: (clientId: number, projectId: number | null) => void
}): React.JSX.Element | null {
  const t = useT()
  if (topClients.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>{t('today.quickstart.label')}</span>
      {topClients.map((c) => (
        <QuickStartPill
          key={c.client_id}
          clientId={c.client_id}
          name={c.name}
          color={c.color}
          lastProjectId={c.last_project_id}
          projectsById={projectsById}
          clientsById={clientsById}
          disabled={disabled}
          onStart={onStart}
        />
      ))}
    </div>
  )
}

function QuickStartPill({
  clientId,
  name,
  color,
  lastProjectId,
  projectsById,
  clientsById,
  disabled,
  onStart
}: {
  clientId: number
  name: string
  color: string
  lastProjectId: number | null
  projectsById: Map<number, Project>
  clientsById: Map<number, Client>
  disabled: boolean
  onStart: (clientId: number, projectId: number | null) => void
}): React.JSX.Element {
  const t = useT()
  const [holdProgress, setHoldProgress] = useState(0)
  const [fanOpen, setFanOpen] = useState(false)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isPressingRef = useRef(false)
  const startTimeRef = useRef(0)

  const stillActive = clientsById.get(clientId)?.active === 1
  const lastProject = lastProjectId != null ? projectsById.get(lastProjectId) : undefined

  const clientProjects = useMemo(
    () => Array.from(projectsById.values()).filter((p) => p.client_id === clientId && p.active === 1),
    [projectsById, clientId]
  )
  const hasProjects = clientProjects.length > 0

  const fanItems: Array<{ id: number | null; name: string; color: string }> = useMemo(
    () => [
      ...clientProjects.map((p) => ({ id: p.id, name: p.name, color: p.color || color })),
      { id: null, name: t('today.quickstart.noProject'), color: 'var(--text3)' }
    ],
    [clientProjects, color, t]
  )

  function clearHoldTimer(): void {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null }
  }

  function getFanPos(index: number): { x: number; y: number } {
    const N = fanItems.length
    const R = 72
    if (N === 1) return { x: 0, y: -R }
    const spread = Math.min(120, (N - 1) * 30)
    const angleDeg = -spread / 2 + index * (spread / (N - 1))
    const rad = angleDeg * (Math.PI / 180)
    return { x: R * Math.sin(rad), y: -R * Math.cos(rad) }
  }

  function handlePointerDown(e: React.PointerEvent): void {
    if (disabled || !stillActive || fanOpen) return
    e.preventDefault()
    isPressingRef.current = true
    if (!hasProjects) return
    startTimeRef.current = Date.now()
    const HOLD_MS = 300
    progressIntervalRef.current = setInterval(() => {
      setHoldProgress(Math.min((Date.now() - startTimeRef.current) / HOLD_MS, 0.999))
    }, 16)
    holdTimerRef.current = setTimeout(() => {
      clearHoldTimer()
      setHoldProgress(0)
      setFanOpen(true)
    }, HOLD_MS)
  }

  function handlePointerUp(): void {
    const wasPressing = isPressingRef.current
    isPressingRef.current = false
    clearHoldTimer()
    setHoldProgress(0)
    if (!wasPressing || fanOpen) return
    if (!disabled && stillActive) {
      onStart(clientId, lastProjectId ?? null)
    }
  }

  function handlePointerLeave(): void {
    if (!fanOpen) {
      isPressingRef.current = false
      clearHoldTimer()
      setHoldProgress(0)
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {fanOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          onPointerDown={() => setFanOpen(false)}
        />
      )}
      {fanOpen &&
        fanItems.map((item, i) => {
          const pos = getFanPos(i)
          return (
            <button
              key={item.id ?? 'none'}
              type="button"
              onClick={() => { setFanOpen(false); onStart(clientId, item.id) }}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur-xl transition-colors hover:border-indigo-400"
              style={{
                position: 'absolute',
                left: `calc(50% + ${pos.x}px)`,
                top: `calc(50% + ${pos.y}px)`,
                transform: 'translate(-50%, -50%)',
                zIndex: 50,
                whiteSpace: 'nowrap',
                background: 'var(--card-bg)',
                borderColor: 'var(--card-border)',
                color: 'var(--text)',
                animation: `qs-fan-in 150ms ease-out ${i * 25}ms both`
              }}
            >
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: item.id != null ? item.color : 'var(--text3)' }}
              />
              {item.name}
            </button>
          )
        })}
      <button
        type="button"
        disabled={disabled || !stillActive}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(e) => {
          if (hasProjects && !disabled && stillActive) {
            e.preventDefault()
            setFanOpen(true)
          }
        }}
        className="flex flex-col items-start rounded-[14px] border px-3 py-1.5 text-sm backdrop-blur-xl transition-colors hover:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: 'var(--card-bg)',
          borderColor: holdProgress > 0 ? color : 'var(--card-border)',
          color: 'var(--text)',
          transform: holdProgress > 0 ? `scale(${(1 - holdProgress * 0.04).toFixed(4)})` : undefined,
          boxShadow: holdProgress > 0 ? `0 0 0 ${(holdProgress * 3).toFixed(1)}px ${color}50` : undefined,
          userSelect: 'none'
        }}
        title={
          stillActive
            ? hasProjects
              ? t('today.quickstart.holdHint')
              : t('today.quickstart.startFor', { name })
            : t('today.quickstart.clientInactive')
        }
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-medium">{name}</span>
          {hasProjects && (
            <Icons.ChevronDown width={10} height={10} style={{ color: 'var(--text3)', opacity: 0.6 }} />
          )}
          <Icons.Play width={11} height={11} style={{ color: 'var(--text3)' }} />
        </div>
        {lastProject && (
          <div className="pl-4 text-xs leading-tight" style={{ color: 'var(--text3)', marginTop: 2 }}>
            {lastProject.name}
          </div>
        )}
      </button>
    </div>
  )
}

function RecentList({
  entries,
  clientsById,
  projectsById,
  onEdit,
  onDelete
}: {
  entries: Entry[]
  clientsById: Map<number, Client>
  projectsById: Map<number, Project>
  onEdit: (e: Entry) => void
  onDelete: (e: Entry) => void
}): React.JSX.Element {
  const t = useT()
  if (entries.length === 0) {
    return (
      <div
        className="rounded-[14px] border border-dashed px-4 py-8 text-center backdrop-blur-xl"
        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
      >
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('today.recent.empty')}</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--text3)' }}>
          {t('today.recent.emptyHint')}
        </p>
      </div>
    )
  }
  return (
    <div
      className="overflow-hidden rounded-[14px] border backdrop-blur-xl text-sm"
      style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}
    >
      {/* Header */}
      <div
        className="grid px-3 py-2 text-xs font-medium uppercase tracking-wide"
        style={{ gridTemplateColumns: '110px 1fr 1fr 70px 72px', background: 'var(--nav-bg)', color: 'var(--text2)' }}
      >
        <span>{t('today.table.time')}</span>
        <span>{t('today.table.client')}</span>
        <span>{t('today.table.description')}</span>
        <span className="text-right">{t('today.table.duration')}</span>
        <span />
      </div>
      {/* Rows */}
      {entries.map((e) => {
        const client = clientsById.get(e.client_id)
        const project = e.project_id != null ? projectsById.get(e.project_id) : undefined
        return (
          <div
            key={e.id}
            className="grid items-center px-3 py-2.5 border-t transition-colors hover:bg-white/5"
            style={{ gridTemplateColumns: '110px 1fr 1fr 70px 72px', borderColor: 'var(--card-border)' }}
          >
            <span className="text-xs tabular-nums" style={{ color: 'var(--text2)', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatTimeRange(e)}
            </span>
            <span className="inline-flex items-center gap-2 overflow-hidden" style={{ color: 'var(--text)' }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project?.color || (client?.color ?? '#64748b') }} />
              <span className="truncate">
                {client?.name ?? t('common.unknown')}
                {project && (
                  <span style={{ color: 'var(--text3)' }}> · {project.name}</span>
                )}
              </span>
            </span>
            <span className="truncate pr-2" style={{ color: 'var(--text2)' }} title={e.description}>
              {e.description || <span style={{ color: 'var(--text3)' }}>—</span>}
            </span>
            <span className="text-right text-xs tabular-nums" style={{ color: 'var(--text2)', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatHHMM(durationSeconds(e))}
            </span>
            <span className="flex justify-end gap-1">
              <button
                type="button"
                onClick={() => onEdit(e)}
                className="rounded p-1 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors"
                style={{ color: 'var(--text2)' }}
                aria-label={t('common.edit')}
                title={t('common.edit')}
              >
                <Icons.Edit />
              </button>
              <button
                type="button"
                onClick={() => onDelete(e)}
                disabled={e.stopped_at === null}
                className="rounded p-1 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
                style={{ color: 'var(--danger)' }}
                aria-label={t('common.delete')}
                title={e.stopped_at === null ? t('common.stopRunningFirst') : t('common.delete')}
              >
                <Icons.Trash />
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function SummarySkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="h-24 animate-pulse rounded-lg" style={{ background: 'var(--card-bg)' }} />
        <div className="h-24 animate-pulse rounded-lg" style={{ background: 'var(--card-bg)' }} />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded" style={{ background: 'var(--card-bg)' }} />
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
