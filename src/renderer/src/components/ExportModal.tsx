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

type Tab = 'pdf' | 'csv'
type CsvFormat = 'de' | 'us'

/**
 * Unified export modal (v1.5 PR C, issue #18).
 *
 * Two tabs: PDF (Stundennachweis) and CSV (spreadsheet-friendly).
 * Shared state: client, fromIso, toIso — so switching tabs keeps the
 * selection. Tab-specific options appear in-place.
 *
 * Replaces PdfExportModal. CalendarView is updated to import this component
 * under the same prop-contract, so existing prefill flows keep working.
 */
export function ExportModal(props: Props): React.JSX.Element {
  const { open, onClose, prefilledClientId, prefilledRange } = props

  const [tab, setTab] = useState<Tab>('pdf')
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState<number | null>(prefilledClientId ?? null)
  const [fromIso, setFromIso] = useState(prefilledRange?.fromIso ?? '')
  const [toIso, setToIso] = useState(prefilledRange?.toIso ?? '')

  // PDF-specific
  const [includeSignatures, setIncludeSignatures] = useState(false)
  const [groupByTag, setGroupByTag] = useState(false)

  // CSV-specific
  const [csvFormat, setCsvFormat] = useState<CsvFormat>('de')

  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [statusKind, setStatusKind] = useState<'info' | 'error' | 'success'>('info')

  // Reset status when switching tabs so stale messages don't confuse.
  function handleTabChange(next: Tab): void {
    setTab(next)
    setStatusMsg(null)
  }

  // Load clients once when the dialog first opens.
  useEffect(() => {
    if (!open || clients.length > 0) return
    void window.api.clients.getAll().then((res) => {
      if (res.ok) {
        setClients(res.data)
        if (!prefilledClientId && res.data.length === 1) {
          setClientId(res.data[0].id)
        }
      } else {
        setStatusKind('error')
        setStatusMsg(`Kunden laden fehlgeschlagen: ${res.error}`)
      }
    })
  }, [open, clients.length, prefilledClientId])

  // Sync prefill props if they change after mount (e.g. CalendarView quick-filters).
  useEffect(() => {
    if (prefilledClientId != null) setClientId(prefilledClientId)
  }, [prefilledClientId])
  useEffect(() => {
    if (prefilledRange) {
      setFromIso(prefilledRange.fromIso)
      setToIso(prefilledRange.toIso)
    }
  }, [prefilledRange])

  const canExport = clientId != null && fromIso !== '' && toIso !== '' && !busy

  function validateRange(): boolean {
    if (fromIso > toIso) {
      setStatusKind('error')
      setStatusMsg('Startdatum liegt nach dem Enddatum.')
      return false
    }
    return true
  }

  async function handlePdfExport(): Promise<void> {
    if (!canExport || !validateRange()) return
    setBusy(true)
    setStatusMsg('PDF wird erstellt …')
    setStatusKind('info')
    const res = await window.api.pdf.export({
      clientId: clientId!,
      fromIso,
      toIso,
      includeSignatures,
      groupByTag
    })
    setBusy(false)
    if (res.ok) {
      setStatusKind('success')
      setStatusMsg(`PDF gespeichert: ${res.data.path}`)
    } else if (res.error === 'Export abgebrochen') {
      setStatusMsg(null)
    } else {
      setStatusKind('error')
      setStatusMsg(`Fehler: ${res.error}`)
    }
  }

  async function handleCsvExport(): Promise<void> {
    if (!canExport || !validateRange()) return
    setBusy(true)
    setStatusMsg('CSV wird erstellt …')
    setStatusKind('info')
    const res = await window.api.csv.export({
      clientId: clientId!,
      fromIso,
      toIso,
      format: csvFormat
    })
    setBusy(false)
    if (res.ok) {
      setStatusKind('success')
      setStatusMsg(`CSV gespeichert: ${res.data.path}`)
    } else if (res.error === 'Export abgebrochen') {
      setStatusMsg(null)
    } else {
      setStatusKind('error')
      setStatusMsg(`Fehler: ${res.error}`)
    }
  }

  const inputClass =
    'rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400'
  const checkboxClass =
    'mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-400 focus:ring-offset-0'

  return (
    <Dialog open={open} onClose={onClose} title="Exportieren" widthClass="w-[520px]">
      <div className="flex flex-col gap-4">
        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
          {(['pdf', 'csv'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTabChange(t)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                tab === t
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t === 'pdf' ? 'PDF — Stundennachweis' : 'CSV — Tabelle'}
            </button>
          ))}
        </div>

        {/* Shared: client + date range */}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-300">Kunde</span>
          <select
            title="Kunde auswählen"
            value={clientId ?? ''}
            onChange={(e) =>
              setClientId(e.target.value === '' ? null : Number.parseInt(e.target.value, 10))
            }
            disabled={busy}
            className={inputClass}
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
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-300">Bis</span>
            <input
              type="date"
              value={toIso}
              onChange={(e) => setToIso(e.target.value)}
              disabled={busy}
              className={inputClass}
            />
          </label>
        </div>

        {/* PDF-specific options */}
        {tab === 'pdf' && (
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={groupByTag}
                onChange={(e) => setGroupByTag(e.target.checked)}
                disabled={busy}
                className={checkboxClass}
              />
              <span>
                Nach Tag gruppieren
                <span className="block text-xs text-zinc-500">
                  Einträge mit Tags werden in separaten Abschnitten zusammengefasst.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={includeSignatures}
                onChange={(e) => setIncludeSignatures(e.target.checked)}
                disabled={busy}
                className={checkboxClass}
              />
              <span>
                Unterschriftsfelder einblenden
                <span className="block text-xs text-zinc-500">
                  Fügt unten zwei Linien für Auftragnehmer / Auftraggeber hinzu.
                </span>
              </span>
            </label>
          </div>
        )}

        {/* CSV-specific options */}
        {tab === 'csv' && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-300">Format</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="csvFormat"
                  value="de"
                  checked={csvFormat === 'de'}
                  onChange={() => setCsvFormat('de')}
                  disabled={busy}
                  className="h-4 w-4 text-indigo-500 focus:ring-indigo-400"
                />
                <span>
                  DE <span className="text-xs text-zinc-500">(Semikolon, Komma-Dezimal — Excel DE)</span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="csvFormat"
                  value="us"
                  checked={csvFormat === 'us'}
                  onChange={() => setCsvFormat('us')}
                  disabled={busy}
                  className="h-4 w-4 text-indigo-500 focus:ring-indigo-400"
                />
                <span>
                  US <span className="text-xs text-zinc-500">(Komma, Punkt-Dezimal — DATEV)</span>
                </span>
              </label>
            </div>
            <p className="text-xs text-zinc-500">
              UTF-8 mit BOM. Excel öffnet die Datei ohne Encoding-Abfrage.
            </p>
          </div>
        )}

        {/* Status message */}
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

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            {tab === 'pdf' ? (
              <>
                Vorlage anpassen unter{' '}
                <span className="font-medium text-zinc-400">Einstellungen → PDF-Vorlage</span>.
              </>
            ) : (
              'Enthält alle abgeschlossenen Einträge im gewählten Zeitraum.'
            )}
          </p>
          <div className="flex shrink-0 gap-2">
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
              onClick={() => void (tab === 'pdf' ? handlePdfExport() : handleCsvExport())}
              disabled={!canExport}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Erstelle …' : tab === 'pdf' ? 'PDF speichern' : 'CSV speichern'}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * Re-export under the old name for backward-compatibility with any other
 * import sites that might appear in future PRs. CalendarView is updated
 * directly below.
 */
export { ExportModal as PdfExportModal }
