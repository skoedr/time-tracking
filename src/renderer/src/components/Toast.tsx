import { useToastStore } from '../store/toastStore'

/**
 * Toast tray. Mount once at the App root. Renders bottom-right above any
 * Drawer (z-index 60). Each toast lives ~5s; clicking the action button
 * (e.g. "Rückgängig") fires the snapshot stored on the toast.
 */
export function ToastTray(): React.ReactElement | null {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  const executeAction = useToastStore((s) => s.executeAction)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex min-w-[280px] max-w-[420px] items-center gap-3 rounded-lg bg-zinc-800 px-4 py-3 text-sm text-zinc-100 shadow-lg ring-1 ring-zinc-700"
        >
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => void executeAction(t.id)}
              className="rounded px-2 py-1 text-sm font-medium text-indigo-300 hover:bg-zinc-700 hover:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Schließen"
            className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
