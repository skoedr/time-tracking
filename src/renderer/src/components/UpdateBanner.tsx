import { useEffect } from 'react'
import { useUpdateStore } from '../store/updateStore'

/**
 * v1.5 PR B — slim banner above the main app surface.
 *
 * Visible only for non-idle states. Color choices follow the design-review
 * decision: indigo for passive info (available/downloading/ready), amber
 * for errors (NOT red — we don't want to alarm users).
 *
 * `idle` and `not-available` collapse the banner entirely.
 */
export function UpdateBanner(): React.JSX.Element | null {
  const { status, dismissed, dismissReady, installNow } = useUpdateStore()

  useEffect(() => {
    void useUpdateStore.getState().init()
  }, [])

  if (status.status === 'idle' || status.status === 'not-available') return null
  if (status.status === 'ready' && dismissed) return null

  let content: React.ReactNode = null
  let tone: 'info' | 'warn' = 'info'

  switch (status.status) {
    case 'checking':
      content = <span className="text-sm">Suche nach Updates …</span>
      break
    case 'available':
      content = (
        <span className="text-sm">
          Version <span className="font-semibold">{status.version}</span> verfügbar — wird
          heruntergeladen …
        </span>
      )
      break
    case 'downloading':
      content = (
        <span className="text-sm">
          Lade Version <span className="font-semibold">{status.version || '…'}</span>:{' '}
          {status.progress}%
        </span>
      )
      break
    case 'ready':
      content = (
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-sm">
            Version <span className="font-semibold">{status.version}</span> bereit — App neu
            starten?
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void installNow()}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Jetzt neu starten
            </button>
            <button
              type="button"
              onClick={dismissReady}
              className="rounded-md px-2 py-1 text-xs text-indigo-200 transition-colors hover:bg-indigo-500/20"
              aria-label="Banner ausblenden"
            >
              Später
            </button>
          </div>
        </div>
      )
      break
    case 'error':
      tone = 'warn'
      content = (
        <span className="text-sm">
          Update-Fehler: <span className="font-mono text-xs">{status.message}</span>
          {' — '}
          <span className="text-xs opacity-80">Details in den Einstellungen.</span>
        </span>
      )
      break
  }

  const toneClasses =
    tone === 'warn'
      ? 'bg-amber-900/70 text-amber-100 ring-amber-700/50'
      : 'bg-indigo-900/70 text-indigo-100 ring-indigo-700/50'

  return (
    <div
      role="status"
      className={`flex items-center px-4 py-2 ring-1 ring-inset ${toneClasses}`}
    >
      {content}
    </div>
  )
}
