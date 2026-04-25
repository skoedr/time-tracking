import { useEffect, useState } from 'react'
import type { Client } from '../../../shared/types'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  onClose: () => void
  /** Pre-fills client + range when opened from a CalendarView quick-filter. */
  prefilledClientId?: number
  prefilledRange?: { fromIso: string; toIso: string }
}

/**
 * PDF-Stundennachweis modal (v1.3 PR C, issues #16 + #19).
 *
 * Lets the user pick a client + date range and triggers `pdf:export`,
 * which in turn opens a Save-Dialog and writes the rendered A4 PDF.
 *
 * Quick-filter pills on `CalendarView` open this with `prefilledRange`
 * already set, so the hero flow ("📄 Letzter Monat als PDF") is one
 * click away from the actual save dialog.
 */
export function PdfExportModal(props: Props): React.JSX.Element {
  const { open, onClose, prefilledClientId, prefilledRange } = props

  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState<number | null>(prefilledClientId ?? null)
  const [fromIso, setFromIso] = useState(prefilledRange?.fromIso ?? '')
  const [toIso, setToIso] = useState(prefilledRange?.toIso ?? '')
  // Off by default: most exports don't need signature lines, and an empty
  // signature row at the foot of the document looks like an unfinished
  // template to the recipient.
  const [includeSignatures, setIncludeSignatures] = useState(false)
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [statusKind, setStatusKind] = useState<'info' | 'error' | 'success'>('info')

  // Load clients once when the dialog first opens.
  useEffect(() => {
    if (!open || clients.length > 0) return
    void window.api.clients.getAll().then((res) => {
      if (res.ok) {
        setClients(res.data)
        // If only one client and no pre-fill, auto-select it.
        if (!prefilledClientId && res.data.length === 1) {
          setClientId(res.data[0].id)
        }
      } else {
        setStatusKind('error')
        setStatusMsg(`Kunden laden fehlgeschlagen: ${res.error}`)
      }
    })
  }, [open, clients.length, prefilledClientId])

  async function handleExport(): Promise<void> {
    if (clientId == null || !fromIso || !toIso) return
    if (fromIso > toIso) {
      setStatusKind('error')
      setStatusMsg('Startdatum liegt nach dem Enddatum.')
      return
    }
    setBusy(true)
    setStatusMsg('PDF wird erstellt …')
    setStatusKind('info')
    const res = await window.api.pdf.export({ clientId, fromIso, toIso, includeSignatures })
    setBusy(false)
    if (res.ok) {
      setStatusKind('success')
      setStatusMsg(`PDF gespeichert: ${res.data.path}`)
    } else if (res.error === 'Export abgebrochen') {
      setStatusKind('info')
      setStatusMsg(null)
    } else {
      setStatusKind('error')
      setStatusMsg(`Fehler: ${res.error}`)
    }
  }

  const canExport = clientId != null && fromIso !== '' && toIso !== '' && !busy

  return (
    <Dialog open={open} onClose={onClose} title="Stundennachweis als PDF" widthClass="w-[520px]">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-300">Kunde</span>
          <select
            value={clientId ?? ''}
            onChange={(e) =>
              setClientId(e.target.value === '' ? null : Number.parseInt(e.target.value, 10))
            }
            disabled={busy}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">— Kunde wählen —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.rate_cent > 0 ? ` (${(c.rate_cent / 100).toFixed(2)} €/h)` : ' (kein Tarif)'}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-300">Von</span>
            <input
              type="date"
              value={fromIso}
              onChange={(e) => setFromIso(e.target.value)}
              disabled={busy}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-300">Bis</span>
            <input
              type="date"
              value={toIso}
              onChange={(e) => setToIso(e.target.value)}
              disabled={busy}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </label>
        </div>

        <label className="flex items-start gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={includeSignatures}
            onChange={(e) => setIncludeSignatures(e.target.checked)}
            disabled={busy}
            className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-400 focus:ring-offset-0"
          />
          <span>
            Unterschriftsfelder einblenden
            <span className="block text-xs text-zinc-500">
              Fügt unten zwei Linien für Auftragnehmer / Auftraggeber hinzu.
            </span>
          </span>
        </label>

        {statusMsg && (
          <div
            className={
              statusKind === 'error'
                ? 'rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-200'
                : statusKind === 'success'
                  ? 'rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-200'
                  : 'rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300'
            }
            role={statusKind === 'error' ? 'alert' : 'status'}
          >
            {statusMsg}
          </div>
        )}

        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
          >
            Schließen
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!canExport}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Erstelle …' : 'PDF speichern'}
          </button>
        </div>

        <p className="text-xs text-zinc-500">
          Vorlage anpassen unter{' '}
          <span className="font-medium text-zinc-400">Einstellungen → PDF-Vorlage</span>.
        </p>
      </div>
    </Dialog>
  )
}
