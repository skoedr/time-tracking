import { useEffect, useMemo, useRef, useState } from 'react'
import type { Client, Entry } from '../../../shared/types'
import { deserializeTags, entryHasTag } from '../../../shared/tags'
import { useEntriesStore } from '../store/entriesStore'
import { useToastStore } from '../store/toastStore'
import { ConfirmDialog } from './ConfirmDialog'
import { EntryEditForm } from './EntryEditForm'

interface Props {
  open: boolean
  /** ISO date YYYY-MM-DD (LOCAL) the drawer is showing entries for. */
  dateISO: string
  /** Entries for this day (caller filters from getByMonth). */
  entries: Entry[]
  clients: Client[]
  onClose: () => void
}

/**
 * Right-side drawer for a single day in CalendarView. Shows the
 * chronological list of entries with inline edit / delete and a
 * sticky-footer "+ Eintrag hinzufügen" button.
 *
 * Delete uses a `ConfirmDialog` (default-focus = Cancel) and on confirm
 * fires a soft-delete + 5s "Rückgängig" toast. The toast snapshot owns
 * the entry id so undo still works after the drawer closes (E9).
 */
export function CalendarDrawer({
  open,
  dateISO,
  entries,
  clients,
  onClose
}: Props): React.ReactElement | null {
  const showToast = useToastStore((s) => s.show)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<Entry | null>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (editingId !== null) setEditingId(null)
        else if (creating) setCreating(false)
        else if (deleteCandidate) setDeleteCandidate(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', handler)
    queueMicrotask(() => {
      drawerRef.current?.querySelector<HTMLElement>('button, [tabindex]')?.focus()
    })
    return () => {
      window.removeEventListener('keydown', handler)
      const prev = previouslyFocused.current
      if (prev instanceof HTMLElement) prev.focus()
    }
  }, [open, onClose, editingId, creating, deleteCandidate])

  const clientsById = useMemo(() => {
    const m = new Map<number, Client>()
    for (const c of clients) m.set(c.id, c)
    return m
  }, [clients])

  // Collect all unique tags from today's entries for the filter pill bar.
  const allDayTags = useMemo(() => {
    const seen = new Set<string>()
    for (const e of entries) {
      for (const t of deserializeTags(e.tags)) seen.add(t)
    }
    return [...seen].sort()
  }, [entries])

  const filteredEntries = useMemo(
    () =>
      tagFilter
        ? entries.filter((e) => entryHasTag(e.tags, tagFilter))
        : entries,
    [entries, tagFilter]
  )

  if (!open) return null

  async function confirmDelete(entry: Entry): Promise<void> {
    setDeleteCandidate(null)
    const res = await window.api.entries.delete(entry.id)
    if (!res.ok) {
      showToast(`Löschen fehlgeschlagen: ${res.error}`)
      return
    }
    useEntriesStore.getState().bumpVersion()
    showToast('Eintrag gelöscht', {
      label: 'Rückgängig',
      type: 'undo_delete',
      data: { entryId: entry.id }
    })
  }

  const dateLabel = formatHumanDate(dateISO)
  const totalSeconds = filteredEntries.reduce((sum, e) => sum + durationSeconds(e), 0)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose} aria-hidden="true" />
      {/* Drawer */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Einträge für ${dateLabel}`}
        className="fixed right-0 top-0 z-40 flex h-screen w-96 flex-col bg-slate-900 shadow-2xl ring-1 ring-slate-700"
      >
        {/* Sticky header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Einträge für {dateLabel}</h2>
            {entries.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-400">
                {filteredEntries.length !== entries.length
                  ? `${filteredEntries.length} von ${entries.length} Eintrag${entries.length === 1 ? '' : 'e'}`
                  : `${entries.length} Eintrag${entries.length === 1 ? '' : 'e'}`}{' '}
                · {formatHHMM(totalSeconds)}
              </p>
            )}
            {allDayTags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {allDayTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                      tagFilter === tag
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slateigo-500 hover:bg-slate-700'
                    }`}
                    aria-pressed={tagFilter === tag}
                    title={tagFilter === tag ? 'Filter entfernen' : `Nach #${tag} filtern`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="grid h-11 w-11 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            ×
          </button>
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto p-3">
          {filteredEntries.length === 0 && !creating && (
            <div className="mt-8 text-center text-sm text-slate-500">
              {tagFilter ? (
                <p>Keine Einträge mit Tag <span className="font-medium text-slate-400">#{tagFilter}</span>.</p>
              ) : (
                <p>Kein Eintrag an diesem Tag.</p>
              )}
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {filteredEntries.map((e) => {
              const client = clientsById.get(e.client_id)
              const isEditing = editingId === e.id
              const entryTags = deserializeTags(e.tags)
              return (
                <li key={e.id} className="rounded-lg border border-slate-700 bg-slate-800/60">
                  {!isEditing && (
                    <div className="flex items-center gap-2 p-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: client?.color ?? '#64748b' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="font-mono tabular-nums">{formatTimeRange(e)}</span>
                          <span>·</span>
                          <span className="truncate text-slate-200">
                            {client?.name ?? 'Unbekannt'}
                          </span>
                        </div>
                        {e.description && (
                          <p
                            className="mt-0.5 truncate text-xs text-slate-400"
                            title={e.description}
                          >
                            {e.description}
                          </p>
                        )}
                        {entryTags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {entryTags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-slate-700 px-1.5 py-px text-xs text-slate-400"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="font-mono text-xs tabular-nums text-slate-300">
                        {formatHHMM(durationSeconds(e))}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingId(e.id)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        aria-label="Bearbeiten"
                        title="Bearbeiten"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteCandidate(e)}
                        disabled={e.stopped_at === null}
                        className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Löschen"
                        title={e.stopped_at === null ? 'Laufenden Timer zuerst stoppen' : 'Löschen'}
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                  {isEditing && (
                    <div className="border-t border-slate-700 p-3">
                      <EntryEditForm
                        entry={e}
                        clients={clients}
                        onSaved={() => {
                          setEditingId(null)
                          showToast('Eintrag gespeichert')
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    </div>
                  )}
                </li>
              )
            })}
            {creating && (
              <li className="rounded-lg border border-indigo-500/60 bg-slate-800/60 p-3">
                <EntryEditForm
                  clients={clients}
                  defaultDate={defaultStartForDay(dateISO)}
                  onSaved={() => {
                    setCreating(false)
                    showToast('Eintrag gespeichert')
                  }}
                  onCancel={() => setCreating(false)}
                />
              </li>
            )}
          </ul>
        </div>

        {/* Sticky footer */}
        {!creating && (
          <div className="shrink-0 border-t border-slate-700 bg-slate-800 p-3">
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={clients.length === 0}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Eintrag für {dateLabel} hinzufügen
            </button>
          </div>
        )}
      </aside>

      <ConfirmDialog
        open={deleteCandidate !== null}
        title="Eintrag löschen?"
        message={
          deleteCandidate
            ? buildDeleteMessage(deleteCandidate, clientsById.get(deleteCandidate.client_id))
            : ''
        }
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        variant="danger"
        onConfirm={() => deleteCandidate && void confirmDelete(deleteCandidate)}
        onCancel={() => setDeleteCandidate(null)}
      />
    </>
  )
}

// --- helpers ---

function durationSeconds(entry: Entry): number {
  const stop = entry.stopped_at ? new Date(entry.stopped_at).getTime() : Date.now()
  return Math.floor((stop - new Date(entry.started_at).getTime()) / 1000)
}

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

function formatHumanDate(dateISO: string): string {
  // dateISO is YYYY-MM-DD (LOCAL); show as DD.MM.YYYY
  const [y, m, d] = dateISO.split('-')
  return `${d}.${m}.${y}`
}

function defaultStartForDay(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map((s) => parseInt(s, 10))
  // Default to 09:00 local on the chosen day for backfill convenience.
  return new Date(y, m - 1, d, 9, 0, 0, 0)
}

function buildDeleteMessage(entry: Entry, client: Client | undefined): string {
  const dur = formatHHMM(durationSeconds(entry))
  const date = new Date(entry.started_at)
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const name = client?.name ?? 'Unbekannt'
  return `${name} · ${dateStr} · ${dur} — Wirklich löschen? Du kannst es 5 Sekunden lang rückgängig machen.`
}
