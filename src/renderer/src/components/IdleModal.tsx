import { useEffect } from 'react'
import { formatDuration } from '../../../shared/duration'

interface Props {
  idleSince: string
  idleSeconds: number
  onKeep: () => void
  onStopAtIdle: () => void
  onMarkPause: () => void
}

export function IdleModal({ idleSince, idleSeconds, onKeep, onStopAtIdle, onMarkPause }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onKeep()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onKeep])

  const idleSinceLocal = new Date(idleSince).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-modal-title"
    >
      <div className="w-[460px] rounded-xl bg-zinc-900 p-6 shadow-2xl ring-1 ring-zinc-700">
        <h2 id="idle-modal-title" className="mb-2 text-xl font-semibold text-zinc-100">
          Inaktivität erkannt
        </h2>
        <p className="mb-6 text-sm text-zinc-400">
          Du warst seit <span className="font-mono text-zinc-200">{idleSinceLocal}</span> nicht
          mehr aktiv ({formatDuration(idleSeconds)}). Was soll mit der Zeit passieren?
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus
          >
            Weiter laufen lassen
          </button>
          <button
            type="button"
            onClick={onStopAtIdle}
            className="rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            Bei Inaktivität stoppen ({idleSinceLocal})
          </button>
          <button
            type="button"
            onClick={onMarkPause}
            className="rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            Als Pause markieren
          </button>
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          Tipp: <kbd className="rounded bg-zinc-800 px-1.5 py-0.5">Esc</kbd> = Weiter laufen lassen
        </p>
      </div>
    </div>
  )
}
