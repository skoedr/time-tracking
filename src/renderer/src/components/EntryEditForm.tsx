import { useEffect, useMemo, useState } from 'react'
import type { Client, Entry } from '../../../shared/types'
import { formatTimeHHMM, parseTimeToDate } from '../../../shared/date'
import { useEntriesStore } from '../store/entriesStore'
import { TagInput } from './TagInput'

interface Props {
  /** Existing entry to edit; omit for create-mode. */
  entry?: Entry
  /** Default date used in create-mode when no entry is supplied. */
  defaultDate?: Date
  clients: Client[]
  onSaved: (entry: Entry) => void
  onCancel: () => void
}

type FormState = 'idle' | 'saving' | 'success'

const MAX_DESCRIPTION_LEN = 500

function toDateInputValue(d: Date): string {
  // <input type="date"> wants YYYY-MM-DD in LOCAL time.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Inline edit/create form used both inside the Calendar Drawer and inside
 * the Today "+ Eintrag nachtragen" dialog. Validation runs client-side
 * for fast feedback; the server enforces the same rules authoritatively
 * (see `validateManualEntry` in src/main/ipc.ts).
 *
 * v1.3 PR B: cross-midnight entries are now allowed — the IPC auto-splits
 * them into linked halves at local midnight. The previous "folgt in v1.3"
 * banner has been removed.
 */
export function EntryEditForm({
  entry,
  defaultDate,
  clients,
  onSaved,
  onCancel
}: Props): React.ReactElement {
  const initialStart = entry ? new Date(entry.started_at) : (defaultDate ?? new Date())
  const initialStop = entry?.stopped_at
    ? new Date(entry.stopped_at)
    : new Date(initialStart.getTime() + 60 * 60 * 1000)

  const [date, setDate] = useState(toDateInputValue(initialStart))
  const [startTime, setStartTime] = useState(formatTimeHHMM(initialStart))
  const [stopTime, setStopTime] = useState(formatTimeHHMM(initialStop))
  const [clientId, setClientId] = useState<number>(entry?.client_id ?? clients[0]?.id ?? 0)
  const [description, setDescription] = useState(entry?.description ?? '')
  const [tags, setTags] = useState(entry?.tags ?? '')
  const [state, setState] = useState<FormState>('idle')
  const [error, setError] = useState<string | null>(null)
  const bumpVersion = useEntriesStore((s) => s.bumpVersion)

  // Local validation (200ms debounce so it doesn't flicker while typing).
  const [localError, setLocalError] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setLocalError(validateLocal()), 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, startTime, stopTime, clientId, description])

  function validateLocal(): string | null {
    if (!clientId) return 'Bitte einen Kunden wählen'
    let start: Date
    let stop: Date
    try {
      start = parseTimeToDate(date, startTime)
      stop = parseTimeToDate(date, stopTime)
    } catch (e) {
      return (e as Error).message
    }
    if (stop.getTime() <= start.getTime()) return 'Endzeit muss nach der Startzeit liegen'
    if (start.getTime() > Date.now()) return 'Startzeit darf nicht in der Zukunft liegen'
    if (description.length > MAX_DESCRIPTION_LEN) {
      return `Beschreibung überschreitet ${MAX_DESCRIPTION_LEN} Zeichen`
    }
    return null
  }

  const activeClients = useMemo(
    () => clients.filter((c) => c.active === 1 || c.id === clientId),
    [clients, clientId]
  )

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const err = validateLocal()
    if (err) {
      setLocalError(err)
      return
    }
    setState('saving')
    setError(null)
    const start = parseTimeToDate(date, startTime).toISOString()
    const stop = parseTimeToDate(date, stopTime).toISOString()
    const res = entry
      ? await window.api.entries.update({
          id: entry.id,
          client_id: clientId,
          description: description.trim(),
          started_at: start,
          stopped_at: stop,
          tags
        })
      : await window.api.entries.create({
          client_id: clientId,
          description: description.trim(),
          started_at: start,
          stopped_at: stop,
          tags
        })
    if (!res.ok) {
      setState('idle')
      setError(res.error)
      return
    }
    setState('success')
    bumpVersion()
    // Brief success flash before handing control back to the parent.
    setTimeout(() => onSaved(res.data), 300)
  }

  const isSaving = state === 'saving'
  const visibleError = error ?? localError

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Datum</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 focus:border-indigo-500 focus:outline-none"
            disabled={isSaving}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Start</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 focus:border-indigo-500 focus:outline-none"
            disabled={isSaving}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Ende</span>
          <input
            type="time"
            value={stopTime}
            onChange={(e) => setStopTime(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 focus:border-indigo-500 focus:outline-none"
            disabled={isSaving || (entry?.stopped_at == null && entry !== undefined)}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">Kunde</span>
        <select
          value={clientId}
          onChange={(e) => setClientId(parseInt(e.target.value, 10))}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 focus:border-indigo-500 focus:outline-none"
          disabled={isSaving}
        >
          {activeClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">
          Beschreibung{' '}
          <span className="text-zinc-600">
            ({description.length}/{MAX_DESCRIPTION_LEN})
          </span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={MAX_DESCRIPTION_LEN}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 focus:border-indigo-500 focus:outline-none"
          disabled={isSaving}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">Tags</span>
        <TagInput
          value={tags}
          onChange={(serialized) => setTags(serialized)}
          disabled={isSaving}
        />
        <span className="text-xs text-zinc-600">
          Tab, Enter oder Komma zum Hinzufügen · Backspace zum Entfernen
        </span>
      </div>

      {visibleError && (
        <p role="alert" className="text-xs text-red-400">
          {visibleError}
        </p>
      )}
      {state === 'success' && (
        <p role="status" className="text-xs text-emerald-400">
          Gespeichert
        </p>
      )}

      <div className="sticky bottom-0 -mx-1 mt-1 flex justify-end gap-2 bg-zinc-900/80 px-1 pt-2 backdrop-blur">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={isSaving || localError !== null}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
        >
          {isSaving ? 'Speichert…' : 'Speichern'}
        </button>
      </div>
    </form>
  )
}
