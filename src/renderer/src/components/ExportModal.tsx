import { useEffect, useState } from 'react'
import type { Client, Project } from '../../../shared/types'
import { useT } from '../contexts/I18nContext'
import { Dialog } from './Dialog'
import { Toggle } from './Toggle'

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
  const t = useT()

  const [tab, setTab] = useState<Tab>('pdf')
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState<number | null>(prefilledClientId ?? null)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [fromIso, setFromIso] = useState(prefilledRange?.fromIso ?? '')
  const [toIso, setToIso] = useState(prefilledRange?.toIso ?? '')

  // PDF-specific
  const [includeSignatures, setIncludeSignatures] = useState(false)
  const [groupByTag, setGroupByTag] = useState(false)

  // CSV-specific
  const [csvFormat, setCsvFormat] = useState<CsvFormat>('de')
  const [csvGroupByTag, setCsvGroupByTag] = useState(false)

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
        setStatusMsg(t('export.status.clientsError', { error: res.error }))
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

  // Load active projects when a client is selected; reset project filter on change.
  useEffect(() => {
    if (clientId == null) {
      setProjects([])
      setProjectId(null)
      return
    }
    void window.api.projects.getAll({ clientId }).then((res) => {
      if (res.ok) {
        const active = res.data.filter((p) => p.active === 1)
        setProjects(active)
        setProjectId(null)
      }
    })
  }, [clientId])

  const canExport = clientId != null && fromIso !== '' && toIso !== '' && !busy

  function validateRange(): boolean {
    if (fromIso > toIso) {
      setStatusKind('error')
      setStatusMsg(t('export.status.dateError'))
      return false
    }
    return true
  }

  async function handlePdfExport(): Promise<void> {
    if (!canExport || !validateRange()) return
    setBusy(true)
    setStatusMsg(t('export.status.pdfCreating'))
    setStatusKind('info')
    const res = await window.api.pdf.export({
      clientId: clientId!,
      fromIso,
      toIso,
      projectId: projectId ?? undefined,
      includeSignatures,
      groupByTag
    })
    setBusy(false)
    if (res.ok) {
      setStatusKind('success')
      setStatusMsg(t('export.status.pdfSaved', { path: res.data.path }))
    } else if (res.error === 'Export abgebrochen') {
      setStatusMsg(null)
    } else {
      setStatusKind('error')
      setStatusMsg(t('export.status.error', { error: res.error }))
    }
  }

  async function handleCsvExport(): Promise<void> {
    if (!canExport || !validateRange()) return
    setBusy(true)
    setStatusMsg(t('export.status.csvCreating'))
    setStatusKind('info')
    const res = await window.api.csv.export({
      clientId: clientId!,
      fromIso,
      toIso,
      projectId: projectId ?? undefined,
      format: csvFormat,
      groupByTag: csvGroupByTag
    })
    setBusy(false)
    if (res.ok) {
      setStatusKind('success')
      setStatusMsg(t('export.status.csvSaved', { path: res.data.path }))
    } else if (res.error === 'Export abgebrochen') {
      setStatusMsg(null)
    } else {
      setStatusKind('error')
      setStatusMsg(t('export.status.error', { error: res.error }))
    }
  }

  const inputClass =
    'rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400'
  const inputStyle = { background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' } as React.CSSProperties

  return (
    <Dialog open={open} onClose={onClose} title={t('export.title')} widthClass="w-[520px]">
      <div className="flex flex-col gap-4">
        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg p-1 border" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
          {(['pdf', 'csv'] as Tab[]).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => handleTabChange(tabKey)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                tab === tabKey
                  ? 'bg-indigo-600 text-white'
                  : 'hover:bg-white/10'
              }`}
              style={tab !== tabKey ? { color: 'var(--text2)' } : undefined}
            >
              {tabKey === 'pdf' ? t('export.tab.pdf') : t('export.tab.csv')}
            </button>
          ))}
        </div>

        {/* Shared: client + date range */}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium" style={{ color: 'var(--text2)' }}>{t('export.client.label')}</span>
          <select
            title={t('export.client.label')}
            value={clientId ?? ''}
            onChange={(e) =>
              setClientId(e.target.value === '' ? null : Number.parseInt(e.target.value, 10))
            }
            disabled={busy}
            className={inputClass}
            style={inputStyle}
          >
            <option value="">{t('export.client.placeholder')}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.rate_cent > 0 ? ` (${(c.rate_cent / 100).toFixed(2)} €/h)` : ` ${t('export.client.noRate')}`}
              </option>
            ))}
          </select>
        </label>

        {/* Project filter — only shown when client has projects */}
        {projects.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium" style={{ color: 'var(--text2)' }}>{t('export.project.label')}</span>
            <select
              title={t('export.project.label')}
              value={projectId ?? ''}
              onChange={(e) =>
                setProjectId(e.target.value === '' ? null : Number.parseInt(e.target.value, 10))
              }
              disabled={busy}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">{t('export.project.placeholder')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium" style={{ color: 'var(--text2)' }}>{t('export.from')}</span>
            <input
              type="date"
              value={fromIso}
              onChange={(e) => setFromIso(e.target.value)}
              disabled={busy}
              className={inputClass}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium" style={{ color: 'var(--text2)' }}>{t('export.to')}</span>
            <input
              type="date"
              value={toIso}
              onChange={(e) => setToIso(e.target.value)}
              disabled={busy}
              className={inputClass}
              style={inputStyle}
            />
          </label>
        </div>

        {/* PDF-specific options */}
        {tab === 'pdf' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--text)' }}>{t('export.pdf.groupByTag')}</span>
                <Toggle checked={groupByTag} onChange={setGroupByTag} disabled={busy} />
              </div>
              <span className="text-xs" style={{ color: 'var(--text3)' }}>{t('export.pdf.groupByTagHint')}</span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--text)' }}>{t('export.pdf.signatures')}</span>
                <Toggle checked={includeSignatures} onChange={setIncludeSignatures} disabled={busy} />
              </div>
              <span className="text-xs" style={{ color: 'var(--text3)' }}>{t('export.pdf.signaturesHint')}</span>
            </div>
          </div>
        )}

        {/* CSV-specific options */}
        {tab === 'csv' && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--text)' }}>{t('export.csv.groupByTag')}</span>
                <Toggle checked={csvGroupByTag} onChange={setCsvGroupByTag} disabled={busy} />
              </div>
              <span className="text-xs" style={{ color: 'var(--text3)' }}>{t('export.csv.groupByTagHint')}</span>
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--text2)' }}>{t('export.csv.format')}</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
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
                  DE <span className="text-xs" style={{ color: 'var(--text3)' }}>{t('export.csv.formatDeHint')}</span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
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
                  US <span className="text-xs" style={{ color: 'var(--text3)' }}>{t('export.csv.formatUsHint')}</span>
                </span>
              </label>
            </div>
            <p className="text-xs" style={{ color: 'var(--text3)' }}>
              {t('export.csv.encodingNote')}
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
                {t('export.footer.pdfHint')}{' '}
                <span className="font-medium text-zinc-400">{t('export.footer.pdfHintPath')}</span>.
              </>
            ) : (
              t('export.footer.csvHint')
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={() => void (tab === 'pdf' ? handlePdfExport() : handleCsvExport())}
              disabled={!canExport}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('export.button.busy') : tab === 'pdf' ? t('export.button.pdf') : t('export.button.csv')}
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
