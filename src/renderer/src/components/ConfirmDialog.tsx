import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Visual style for the confirm button. 'danger' = red. */
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation dialog used for destructive actions (e.g. entry delete).
 *
 * Default focus is on Cancel — never on the destructive action — so a
 * stray Enter press does not delete user data.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Abbrechen',
  variant = 'primary',
  onConfirm,
  onCancel
}: Props): React.ReactElement | null {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    queueMicrotask(() => cancelRef.current?.focus())
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  const confirmClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-500 focus:ring-red-400'
      : 'bg-indigo-600 hover:bg-indigo-500 focus:ring-indigo-400'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
    >
      <div
        className="w-[440px] rounded-xl border p-6 shadow-2xl backdrop-blur-xl"
        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
      >
        <h2 id="confirm-title" className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
          {title}
        </h2>
        <p id="confirm-message" className="mb-6 text-sm" style={{ color: 'var(--text2)' }}>
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400 border backdrop-blur-xl"
            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white focus:outline-none focus:ring-2 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
