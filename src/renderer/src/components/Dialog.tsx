import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Maximum width in tailwind units. Default: w-[460px]. */
  widthClass?: string
}

/**
 * Generic modal dialog used for "+ Eintrag nachtragen" on TodayView.
 * Inside the Calendar Drawer the form is inlined directly — this wrapper
 * is for the case where there is no surrounding drawer to host it.
 *
 * Focus management: traps focus inside on mount, returns it to the
 * previously focused element on close. Escape closes.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  widthClass = 'w-[460px]'
}: Props): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    // Move focus into the dialog after mount so screen readers announce it.
    queueMicrotask(() => {
      const first = containerRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button'
      )
      first?.focus()
    })
    return () => {
      window.removeEventListener('keydown', handler)
      const prev = previouslyFocused.current
      if (prev instanceof HTMLElement) prev.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={containerRef}
        className={`${widthClass} rounded-xl bg-zinc-900 p-6 shadow-2xl ring-1 ring-zinc-700`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="dialog-title" className="text-lg font-semibold text-zinc-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 grid h-11 w-11 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
