import { useState } from 'react'
import { useT } from '../contexts/I18nContext'
import { useEntriesStore } from '../store/entriesStore'
import { Dialog } from './Dialog'
import type { Client } from '../../../shared/types'
import type { EntryDraft, SkippedEvent } from '../../../shared/graphCalendar'
import type { TranslationKey } from '../../../shared/locales/de'

interface Props {
  open: boolean
  onClose: () => void
  clients: Client[]
}

/**
 * "Import appointments" (#130c) — the confirm step of the calendar import.
 *
 * Everything that decides anything (filters, domain matching, dedupe, entry
 * validation) lives in the main process; this dialog renders drafts and
 * collects three choices per row: take it or not, which client, and whether a
 * not-yet-mapped domain should be remembered for that client.
 *
 * The learn checkbox defaults to ON by decision on #130 (2026-07-29): mappings
 * are only ever created here, visibly, never silently — but the common case
 * (the mapping is right) should not cost an extra click per meeting.
 */
interface RowState {
  checked: boolean
  clientId: number | null
  /** Domain → learn? Only domains that are not already mapped appear here. */
  learn: Record<string, boolean>
}

type Phase = 'idle' | 'loading' | 'loaded' | 'importing' | 'done'

export function GraphImportModal({ open, onClose, clients }: Props): React.ReactElement | null {
  const t = useT()
  const bumpVersion = useEntriesStore((s) => s.bumpVersion)

  const today = localDateInputValue(new Date())
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<EntryDraft[]>([])
  const [skipped, setSkipped] = useState<SkippedEvent[]>([])
  const [rows, setRows] = useState<Map<string, RowState>>(new Map())
  const [failures, setFailures] = useState<Map<string, string>>(new Map())
  const [doneMsg, setDoneMsg] = useState<string | null>(null)

  const activeClients = clients.filter((c) => c.active)

  function reset(): void {
    setPhase('idle')
    setError(null)
    setDrafts([])
    setSkipped([])
    setRows(new Map())
    setFailures(new Map())
    setDoneMsg(null)
  }

  function close(): void {
    reset()
    onClose()
  }

  async function load(): Promise<void> {
    setPhase('loading')
    setError(null)
    setFailures(new Map())
    setDoneMsg(null)
    const range = dateRangeIso(fromDate, toDate)
    const [previewRes, domainsRes] = await Promise.all([
      window.api.graph.calendarPreview(range),
      window.api.graph.listDomains()
    ])
    if (!previewRes.ok) {
      setPhase('idle')
      setError(previewRes.error)
      return
    }
    const mapped = new Set(domainsRes.ok ? domainsRes.data.map((d) => d.domain) : [])
    const next = new Map<string, RowState>()
    for (const draft of previewRes.data.drafts) {
      next.set(draft.graphEventId, {
        checked: draft.clientId !== null,
        clientId: draft.clientId,
        learn: Object.fromEntries(draft.domains.filter((d) => !mapped.has(d)).map((d) => [d, true]))
      })
    }
    setDrafts(previewRes.data.drafts)
    setSkipped(previewRes.data.skipped)
    setRows(next)
    setPhase('loaded')
  }

  function patchRow(id: string, patch: Partial<RowState>): void {
    setRows((prev) => {
      const next = new Map(prev)
      const row = next.get(id)
      if (row) next.set(id, { ...row, ...patch })
      return next
    })
  }

  const selected = drafts.filter((d) => {
    const row = rows.get(d.graphEventId)
    return row?.checked === true && row.clientId !== null
  })

  async function runImport(): Promise<void> {
    setPhase('importing')
    setError(null)
    // Learn first: an import failure (e.g. overlap) should not cost the user
    // the mapping they just confirmed — next preview then matches already.
    for (const draft of selected) {
      const row = rows.get(draft.graphEventId)
      if (!row || row.clientId === null) continue
      for (const [domain, learn] of Object.entries(row.learn)) {
        if (learn) await window.api.graph.learnDomain(domain, row.clientId)
      }
    }
    const res = await window.api.graph.importEntries(
      selected.map((d) => {
        const row = rows.get(d.graphEventId)
        return {
          graphEventId: d.graphEventId,
          description: d.description,
          startedAt: d.startedAt,
          stoppedAt: d.stoppedAt,
          clientId: row?.clientId ?? 0
        }
      })
    )
    if (!res.ok) {
      setPhase('loaded')
      setError(res.error)
      return
    }
    if (res.data.created > 0) bumpVersion()
    setFailures(new Map(res.data.failed.map((f) => [f.graphEventId, f.error])))
    setDoneMsg(
      res.data.created === 0
        ? t('calendarImport.doneAllFailed')
        : t('calendarImport.done', { created: res.data.created, total: selected.length })
    )
    // Keep failed rows on screen with their errors; drop the imported ones.
    const failedIds = new Set(res.data.failed.map((f) => f.graphEventId))
    setDrafts((prev) =>
      prev.filter((d) => {
        const row = rows.get(d.graphEventId)
        const wasSelected = row?.checked === true && row.clientId !== null
        return !wasSelected || failedIds.has(d.graphEventId)
      })
    )
    setPhase('done')
  }

  if (!open) return null

  return (
    <Dialog open={open} onClose={close} title={t('calendarImport.title')} widthClass="w-[640px]">
      <div className="flex flex-col gap-4">
        {/* Range picker + load */}
        <div className="flex flex-wrap items-end gap-3">
          <DateField
            label={t('calendarImport.from')}
            value={fromDate}
            onChange={(v) => setFromDate(v)}
          />
          <DateField label={t('calendarImport.to')} value={toDate} onChange={(v) => setToDate(v)} />
          <button
            type="button"
            onClick={() => void load()}
            disabled={phase === 'loading' || phase === 'importing'}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            style={{ background: 'var(--accent)' }}
          >
            {phase === 'loading' ? t('calendarImport.loading') : t('calendarImport.load')}
          </button>
        </div>

        {error && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        {doneMsg && (
          <p className="text-xs" style={{ color: 'var(--green)' }}>
            {doneMsg}
          </p>
        )}

        {(phase === 'loaded' || phase === 'importing' || phase === 'done') &&
          drafts.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text3)' }}>
              {t('calendarImport.empty')}
            </p>
          )}

        {/* Draft rows */}
        {drafts.map((draft) => {
          const row = rows.get(draft.graphEventId)
          if (!row) return null
          const failure = failures.get(draft.graphEventId)
          const hintKey = hintTranslationKey(draft.clientHint)
          return (
            <div
              key={draft.graphEventId}
              className="flex flex-col gap-2 rounded-lg border px-3 py-2.5"
              style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={row.checked}
                  disabled={row.clientId === null || phase === 'importing'}
                  onChange={(e) => patchRow(draft.graphEventId, { checked: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-indigo-500"
                  aria-label={draft.description}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {draft.description || '—'}
                  </div>
                  <div
                    className="text-xs tabular-nums"
                    style={{ color: 'var(--text2)', fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {formatDraftRange(draft.startedAt, draft.stoppedAt)}
                  </div>
                </div>
                <select
                  value={row.clientId ?? ''}
                  disabled={phase === 'importing'}
                  onChange={(e) => {
                    const clientId = e.target.value ? Number(e.target.value) : null
                    // Choosing a client is the intent to take the row.
                    patchRow(draft.graphEventId, { clientId, checked: clientId !== null })
                  }}
                  aria-label={t('calendarImport.clientPlaceholder')}
                  className="w-44 shrink-0 appearance-none rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  style={{
                    background: 'var(--input-bg)',
                    borderColor: 'var(--card-border)',
                    color: 'var(--text)'
                  }}
                >
                  <option value="">{t('calendarImport.clientPlaceholder')}</option>
                  {activeClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {row.clientId === null && hintKey && (
                <p className="text-xs" style={{ color: 'var(--text3)' }}>
                  {t(hintKey)}
                  {draft.domains.length > 0 && ` (${draft.domains.join(', ')})`}
                </p>
              )}

              {/* Learn checkboxes — one per not-yet-mapped domain, default ON. */}
              {row.clientId !== null &&
                Object.keys(row.learn).map((domain) => (
                  <label
                    key={domain}
                    className="flex items-center gap-2 text-xs"
                    style={{ color: 'var(--text2)' }}
                  >
                    <input
                      type="checkbox"
                      checked={row.learn[domain]}
                      disabled={phase === 'importing'}
                      onChange={(e) =>
                        patchRow(draft.graphEventId, {
                          learn: { ...row.learn, [domain]: e.target.checked }
                        })
                      }
                      className="h-3.5 w-3.5 accent-indigo-500"
                    />
                    {t('calendarImport.learn', { domain })}
                  </label>
                ))}

              {failure && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>
                  {failure}
                </p>
              )}
            </div>
          )
        })}

        {/* Skipped events, folded away — they explain, they don't nag. */}
        {skipped.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs" style={{ color: 'var(--text3)' }}>
              {t('calendarImport.skipped', { count: skipped.length })}
            </summary>
            <ul
              className="mt-1 flex flex-col gap-0.5 pl-4 text-xs"
              style={{ color: 'var(--text3)' }}
            >
              {skipped.map((s, i) => (
                <li key={s.graphEventId ?? i}>
                  {s.subject || '—'} — {t(skipReasonKey(s.reason))}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Footer */}
        {(phase === 'loaded' || phase === 'importing') && drafts.length > 0 && (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ borderColor: 'var(--card-border)', color: 'var(--text2)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void runImport()}
              disabled={selected.length === 0 || phase === 'importing'}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              style={{ background: 'var(--accent)' }}
            >
              {phase === 'importing'
                ? t('calendarImport.importing')
                : t('calendarImport.import', { count: selected.length })}
            </button>
          </div>
        )}
        {phase === 'done' && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ borderColor: 'var(--card-border)', color: 'var(--text)' }}
            >
              {t('common.close')}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  )
}

function DateField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (v: string) => void
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text3)' }}>
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        style={{
          background: 'var(--input-bg)',
          borderColor: 'var(--card-border)',
          color: 'var(--text)'
        }}
      />
    </label>
  )
}

/** Local YYYY-MM-DD for `<input type="date">` — NOT toISOString, which is UTC. */
function localDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Date inputs → the half-open ISO range the main process expects: local
 * midnight of `from` up to local midnight AFTER `to`, so "Von heute bis heute"
 * covers the whole of today.
 */
function dateRangeIso(from: string, to: string): { startIso: string; endIso: string } {
  const start = parseLocalDate(from)
  const end = parseLocalDate(to)
  end.setDate(end.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function formatDraftRange(startedAt: string, stoppedAt: string): string {
  const start = new Date(startedAt)
  const stop = new Date(stoppedAt)
  const day = start.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  })
  const hm = (d: Date): string =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${day} ${hm(start)}–${hm(stop)}`
}

function hintTranslationKey(hint: EntryDraft['clientHint']): TranslationKey | null {
  switch (hint) {
    case 'no-domain':
      return 'calendarImport.hint.noDomain'
    case 'unknown-domain':
      return 'calendarImport.hint.unknownDomain'
    case 'ambiguous':
      return 'calendarImport.hint.ambiguous'
    case 'matched':
      return null
  }
}

function skipReasonKey(reason: SkippedEvent['reason']): TranslationKey {
  switch (reason) {
    case 'cancelled':
      return 'calendarImport.skipReason.cancelled'
    case 'all-day':
      return 'calendarImport.skipReason.allDay'
    case 'declined':
      return 'calendarImport.skipReason.declined'
    case 'free':
      return 'calendarImport.skipReason.free'
    case 'no-id':
      return 'calendarImport.skipReason.noId'
    case 'no-times':
      return 'calendarImport.skipReason.noTimes'
    case 'already-imported':
      return 'calendarImport.skipReason.alreadyImported'
  }
}
