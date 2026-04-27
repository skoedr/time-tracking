import { useEffect, useRef, useState } from 'react'
import { Dialog } from './Dialog'
import { detectFilePurpose } from './pdfMergeUtils'

const basename = (p: string): string => p.replace(/.*[\\/]/, '')

const LS_SN_KEY = 'pdfMerge.lastSnPath'
const LS_INV_KEY = 'pdfMerge.lastInvPath'

interface Props {
  open: boolean
  onClose: () => void
}

export function PdfMergeModal({ open, onClose }: Props): React.JSX.Element {
  const [snPath, setSnPath] = useState<string | null>(null)
  const [invPath, setInvPath] = useState<string | null>(null)
  const [snPages, setSnPages] = useState<number | null>(null)
  const [invPages, setInvPages] = useState<number | null>(null)
  // 'sn' = picked SN-looking file into invoice slot; 'invoice' = reverse
  const [swapOffer, setSwapOffer] = useState<'sn' | 'invoice' | null>(null)
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [statusKind, setStatusKind] = useState<'info' | 'error' | 'success'>('info')

  // Version refs prevent stale pdf:pdf-info responses from overwriting newer picks.
  const snInfoVersion = useRef(0)
  const invInfoVersion = useRef(0)

  // Pre-fill from localStorage on open. Any failure = treat path as gone.
  useEffect(() => {
    if (!open) return
    setStatusMsg(null)
    setStatusKind('info')
    setBusy(false)

    const storedSn = localStorage.getItem(LS_SN_KEY)
    const storedInv = localStorage.getItem(LS_INV_KEY)

    if (storedSn) {
      snInfoVersion.current++
      const v = snInfoVersion.current
      void window.api.pdf.pdfInfo({ filePath: storedSn }).then((res) => {
        if (snInfoVersion.current !== v) return
        if (res.ok) {
          setSnPath(storedSn)
          setSnPages(res.data.pageCount)
        } else {
          localStorage.removeItem(LS_SN_KEY)
        }
      })
    }

    if (storedInv) {
      invInfoVersion.current++
      const v = invInfoVersion.current
      void window.api.pdf.pdfInfo({ filePath: storedInv }).then((res) => {
        if (invInfoVersion.current !== v) return
        if (res.ok) {
          setInvPath(storedInv)
          setInvPages(res.data.pageCount)
        } else {
          localStorage.removeItem(LS_INV_KEY)
        }
      })
    }
  }, [open])

  async function loadFileInfo(filePath: string, slot: 'sn' | 'invoice'): Promise<void> {
    if (slot === 'sn') {
      snInfoVersion.current++
      const v = snInfoVersion.current
      setSnPath(filePath)
      setSnPages(null)
      setSwapOffer(null)
      setStatusMsg(null)
      localStorage.setItem(LS_SN_KEY, filePath)

      const purpose = detectFilePurpose(basename(filePath))
      if (purpose === 'invoice') setSwapOffer('sn')

      const res = await window.api.pdf.pdfInfo({ filePath })
      if (snInfoVersion.current !== v) return
      if (res.ok) {
        setSnPages(res.data.pageCount)
      } else {
        setSnPath(null)
        setSnPages(null)
        setStatusKind('error')
        setStatusMsg(`Stundennachweis: ${res.error}`)
        localStorage.removeItem(LS_SN_KEY)
      }
    } else {
      invInfoVersion.current++
      const v = invInfoVersion.current
      setInvPath(filePath)
      setInvPages(null)
      setSwapOffer(null)
      setStatusMsg(null)
      localStorage.setItem(LS_INV_KEY, filePath)

      const purpose = detectFilePurpose(basename(filePath))
      if (purpose === 'sn') setSwapOffer('invoice')

      const res = await window.api.pdf.pdfInfo({ filePath })
      if (invInfoVersion.current !== v) return
      if (res.ok) {
        setInvPages(res.data.pageCount)
      } else {
        setInvPath(null)
        setInvPages(null)
        setStatusKind('error')
        setStatusMsg(`Rechnung: ${res.error}`)
        localStorage.removeItem(LS_INV_KEY)
      }
    }
  }

  async function handlePickFile(slot: 'sn' | 'invoice'): Promise<void> {
    const res = await window.api.pdf.openPdfDialog()
    if (!res.ok) {
      setStatusKind('error')
      setStatusMsg(`Fehler beim Öffnen: ${res.error}`)
      return
    }
    if (res.data === null) return // user cancelled — do nothing
    void loadFileInfo(res.data.filePath, slot)
  }

  function executeSwap(): void {
    const oldSn = snPath
    const oldInv = invPath
    const oldSnPages = snPages
    const oldInvPages = invPages
    setSnPath(oldInv)
    setInvPath(oldSn)
    setSnPages(oldInvPages)
    setInvPages(oldSnPages)
    if (oldInv) localStorage.setItem(LS_SN_KEY, oldInv)
    else localStorage.removeItem(LS_SN_KEY)
    if (oldSn) localStorage.setItem(LS_INV_KEY, oldSn)
    else localStorage.removeItem(LS_INV_KEY)
    setSwapOffer(null)
  }

  async function handleMerge(): Promise<void> {
    if (!snPath || !invPath) return
    setBusy(true)
    setStatusMsg('PDFs werden zusammengeführt …')
    setStatusKind('info')

    const res = await window.api.pdf.mergeOnly({ stundennachweisPath: snPath, invoicePath: invPath })
    setBusy(false)

    if (res.ok) {
      setStatusKind('success')
      setStatusMsg(res.data.path)
    } else if (res.error === 'Speichern abgebrochen') {
      setStatusKind('info')
      setStatusMsg(null)
    } else {
      setStatusKind('error')
      setStatusMsg(`Fehler: ${res.error}`)
    }
  }

  // Both paths AND page counts must be loaded before allowing merge.
  const canMerge =
    snPath !== null &&
    invPath !== null &&
    snPages !== null &&
    invPages !== null &&
    !busy

  const successPath = statusKind === 'success' ? statusMsg : null

  return (
    <Dialog open={open} onClose={onClose} title="PDFs zusammenführen" widthClass="w-[520px]">
      <div className="flex flex-col gap-4">
        {/* Stundennachweis slot */}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-300">Stundennachweis-PDF</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePickFile('sn')}
              disabled={busy}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
            >
              {snPath ? 'Wechseln …' : 'Datei wählen …'}
            </button>
            <span className="max-w-[260px] truncate text-xs text-zinc-400">
              {snPath ? basename(snPath) : 'keine Datei gewählt'}
            </span>
          </div>
          {snPath && (
            <span className="text-xs text-zinc-500">
              {snPages === null ? 'lädt …' : `${snPages} Seite${snPages !== 1 ? 'n' : ''}`}
            </span>
          )}
          {swapOffer === 'sn' && (
            <div className="flex items-center gap-2 rounded-md bg-amber-900/30 px-3 py-1.5 text-xs text-amber-300">
              <span>Sieht aus wie eine Rechnung. Tauschen?</span>
              <button
                type="button"
                onClick={executeSwap}
                className="font-semibold underline hover:text-amber-200"
              >
                Tauschen
              </button>
            </div>
          )}
        </div>

        {/* Invoice slot */}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-300">Rechnung-PDF</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePickFile('invoice')}
              disabled={busy}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
            >
              {invPath ? 'Wechseln …' : 'Datei wählen …'}
            </button>
            <span className="max-w-[260px] truncate text-xs text-zinc-400">
              {invPath ? basename(invPath) : 'keine Datei gewählt'}
            </span>
          </div>
          {invPath && (
            <span className="text-xs text-zinc-500">
              {invPages === null ? 'lädt …' : `${invPages} Seite${invPages !== 1 ? 'n' : ''}`}
            </span>
          )}
          {swapOffer === 'invoice' && (
            <div className="flex items-center gap-2 rounded-md bg-amber-900/30 px-3 py-1.5 text-xs text-amber-300">
              <span>Sieht aus wie ein Stundennachweis. Tauschen?</span>
              <button
                type="button"
                onClick={executeSwap}
                className="font-semibold underline hover:text-amber-200"
              >
                Tauschen
              </button>
            </div>
          )}
        </div>

        {/* Page count preview */}
        {snPages !== null && invPages !== null && (
          <div className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300">
            Rechnung ({invPages}) + Stundennachweis ({snPages}) = {invPages + snPages} Seiten
          </div>
        )}

        {/* Status messages */}
        {statusMsg && statusKind !== 'success' && (
          <div
            className={
              statusKind === 'error'
                ? 'rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-200'
                : 'rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300'
            }
            role={statusKind === 'error' ? 'alert' : undefined}
            aria-live="polite"
          >
            {statusMsg}
          </div>
        )}

        {/* Success state */}
        {successPath && (
          <div className="rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-200">
            <div className="font-medium">✓ Gespeichert</div>
            <div className="mt-0.5 truncate text-xs text-emerald-300/80">{basename(successPath)}</div>
            <button
              type="button"
              onClick={() => void window.api.shell.showItemInFolder(successPath)}
              className="mt-1 text-xs underline text-emerald-300 hover:text-emerald-200"
            >
              Im Explorer anzeigen
            </button>
          </div>
        )}

        {/* Footer */}
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
            onClick={() => void handleMerge()}
            disabled={!canMerge}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Zusammenführen …' : 'PDFs zusammenführen'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
