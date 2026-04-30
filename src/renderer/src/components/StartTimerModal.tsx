import { useEffect, useState } from 'react'
import { useTimer } from '../hooks/useTimer'
import { useT } from '../contexts/I18nContext'
import { useUiPrefsStore } from '../store/uiPrefsStore'
import * as Icons from './Icons'
import type { Project } from '../../../shared/types'

interface StartTimerModalProps {
  open: boolean
  onClose: () => void
}

export function StartTimerModal({ open, onClose }: StartTimerModalProps): React.JSX.Element | null {
  const t = useT()
  const showProjectNumber = useUiPrefsStore((s) => s.showProjectNumber)
  const {
    clients,
    selectedClientId,
    selectedProjectId,
    description,
    isLoading,
    setSelectedClientId,
    setSelectedProjectId,
    setDescription,
    start
  } = useTimer()

  const [projects, setProjects] = useState<Project[]>([])

  // Load projects when client selection changes
  useEffect(() => {
    if (!selectedClientId) {
      setProjects([])
      setSelectedProjectId(null)
      return
    }
    void window.api.projects.getAll({ clientId: selectedClientId }).then((res) => {
      if (res.ok) {
        const active = res.data.filter((p) => p.active === 1)
        setProjects(active)
        if (active.length === 1) {
          setSelectedProjectId(active[0].id)
        } else {
          setSelectedProjectId(null)
        }
      }
    })
  }, [selectedClientId])

  if (!open) return null

  const activeClients = clients.filter((c) => c.active)
  const selectedClient = clients.find((c) => c.id === selectedClientId)
  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const canStart = selectedClientId !== null && !isLoading

  function effectiveRateEuro(): number | null {
    if (selectedProject?.rate_cent != null) return selectedProject.rate_cent / 100
    if (selectedClient?.rate_cent) return selectedClient.rate_cent / 100
    return null
  }
  const effectiveRate = effectiveRateEuro()
  const showRateHint =
    selectedProject?.rate_cent != null &&
    selectedClient?.rate_cent != null &&
    selectedProject.rate_cent !== selectedClient.rate_cent

  async function handleStart(): Promise<void> {
    if (!canStart) return
    await start()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100]"
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
        onPointerDown={onClose}
      />
      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-[101] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border p-6 flex flex-col gap-4"
        style={{
          background: 'var(--modal-bg)',
          borderColor: 'var(--card-border)',
          boxShadow: 'var(--shadow)',
          backdropFilter: 'blur(20px)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            {t('timer.modal.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label={t('common.close')}
          >
            <Icons.X />
          </button>
        </div>

        {/* Client */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text3)' }}>
            {t('timer.client.label')}
          </label>
          <div className="relative">
            <select
              aria-label={t('timer.client.label')}
              value={selectedClientId ?? ''}
              onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : null)}
              className="w-full appearance-none rounded-[10px] border px-3.5 py-2.5 pr-9 text-sm backdrop-blur-xl
                focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
            >
              <option value="">{t('timer.client.placeholder')}</option>
              {activeClients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }}>
              <Icons.ChevronDown />
            </span>
          </div>
          {activeClients.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--text3)' }}>
              {t('timer.client.noClientsHint')}{' '}
              <span style={{ color: 'var(--accent)' }}>{t('timer.client.noClientsLink')}</span>
              {t('timer.client.noClientsSuffix')}
            </p>
          )}
        </div>

        {/* Project — only when client has projects */}
        {selectedClientId !== null && projects.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text3)' }}>
              {t('timer.project.label')}
            </label>
            <div className="relative">
              <select
                aria-label={t('timer.project.label')}
                value={selectedProjectId ?? ''}
                onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
                className="w-full appearance-none rounded-[10px] border px-3.5 py-2.5 pr-9 text-sm backdrop-blur-xl
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
              >
                <option value="">{t('timer.project.placeholder')}</option>
                {projects.map((p) => {
                  const label = showProjectNumber && p.external_project_number ? `${p.name} [${p.external_project_number}]` : p.name
                  return <option key={p.id} value={p.id}>{label}</option>
                })}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }}>
                <Icons.ChevronDown />
              </span>
            </div>
            {showRateHint && effectiveRate !== null && (
              <p className="text-xs" style={{ color: 'var(--text3)' }}>
                {t('timer.project.effectiveRate', {
                  rate: effectiveRate.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                })}
              </p>
            )}
          </div>
        )}

        {/* Budget warning — shows when selected project is ≥80% consumed */}
        {selectedProject?.budget_minutes != null && selectedProject.budget_minutes > 0 && (() => {
          const usedMin = selectedProject.used_minutes ?? 0
          const budgetMin = selectedProject.budget_minutes
          const pct = Math.round((usedMin / budgetMin) * 100)
          if (pct < 80) return null
          const usedH = (usedMin / 60).toFixed(1)
          const totalH = (budgetMin / 60).toFixed(1)
          const over = usedMin > budgetMin
          return (
            <div
              className="flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-xs"
              style={{
                background: over ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                color: over ? 'var(--danger)' : '#f59e0b'
              }}
            >
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>
                {over
                  ? t('timer.budget.overBudget', { used: usedH, total: totalH })
                  : t('timer.budget.warning', { percent: String(pct), used: usedH, total: totalH })
                }
              </span>
            </div>
          )
        })()}

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text3)' }}>
            {t('timer.description.label')}
          </label>
          <input
            type="text"
            placeholder={t('timer.description.placeholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleStart()}
            autoFocus
            className="rounded-[10px] border px-3.5 py-2.5 text-sm backdrop-blur-xl
              focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
          />
        </div>

        {/* Start button */}
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={!canStart}
          className="flex items-center justify-center gap-2.5 rounded-[12px] py-3 text-base font-bold transition-all
            disabled:cursor-not-allowed"
          style={{
            background: canStart ? 'var(--accent)' : 'var(--card-bg)',
            color: canStart ? '#fff' : 'var(--text3)',
            border: 'none'
          }}
        >
          <Icons.Play />
          {t('timer.modal.start')}
        </button>
      </div>
    </>
  )
}
