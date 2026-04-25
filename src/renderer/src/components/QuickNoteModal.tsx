import { useEffect, useRef, useState } from 'react'
import type { Entry } from '../../../shared/types'
import { useEntriesStore } from '../store/entriesStore'

const TIMEOUT_S = 30

interface Props {
  entry: Entry
  onDone: () => void
}

export function QuickNoteModal({ entry, onDone }: Props) {
  const [text, setText] = useState('')
  const [remaining, setRemaining] = useState(TIMEOUT_S)
  const inputRef = useRef<HTMLInputElement>(null)
  const deadlineRef = useRef(Date.now() + TIMEOUT_S * 1000)
  const bumpVersion = useEntriesStore((s) => s.bumpVersion)

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Countdown + auto-dismiss
  useEffect(() => {
    const tick = setInterval(() => {
      const r = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000))
      setRemaining(r)
      if (r <= 0) onDone()
    }, 250)
    return () => clearInterval(tick)
  }, [onDone])

  // Escape = skip
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onDone])

  const save = async (): Promise<void> => {
    const desc = text.trim()
    if (desc) {
      await window.api.entries.update({
        id: entry.id,
        client_id: entry.client_id,
        description: desc,
        started_at: entry.started_at,
        // entry was just stopped so stopped_at is always set here
        stopped_at: entry.stopped_at!,
        tags: entry.tags
      })
      bumpVersion()
    }
    onDone()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') void save()
  }

  const progressPct = (remaining / TIMEOUT_S) * 100

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quicknote-title"
    >
      <div className="w-[420px] rounded-xl bg-zinc-900 p-6 shadow-2xl ring-1 ring-zinc-700">
        <h2 id="quicknote-title" className="mb-1 text-xl font-semibold text-zinc-100">
          Was war das?
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Kein Eintrag hatte eine Beschreibung. Kurz notieren?
        </p>

        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Beschreibung eingeben …"
          className="mb-4 w-full rounded-lg bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100
            placeholder:text-zinc-500 outline-none ring-1 ring-zinc-700
            focus:ring-2 focus:ring-indigo-500"
        />

        {/* Progress bar */}
        <div className="mb-5 h-1 w-full overflow-hidden rounded-full bg-zinc-700">
          <div
            className="h-1 rounded-full bg-indigo-500 transition-none"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!text.trim()}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium
              text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Speichern
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300
              hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            Überspringen ({remaining}s)
          </button>
        </div>
      </div>
    </div>
  )
}
