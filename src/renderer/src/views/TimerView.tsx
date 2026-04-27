import { useTimer, formatDuration } from '../hooks/useTimer'
import { useT } from '../contexts/I18nContext'
import * as Icons from '../components/Icons'

export default function TimerView() {
  const t = useT()
  const {
    clients,
    runningEntry,
    selectedClientId,
    description,
    elapsedSeconds,
    isLoading,
    setSelectedClientId,
    setDescription,
    start,
    stop
  } = useTimer()

  const activeClients = clients.filter((c) => c.active)
  const selectedClient = clients.find((c) => c.id === selectedClientId)
  const isRunning = !!runningEntry
  const canStart = selectedClientId !== null && !isRunning

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 h-full">
      {/* Clock + ambient glow */}
      <div className="relative">
        {isRunning && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[120px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[40px]"
            style={{ background: 'var(--green-bg)' }}
          />
        )}
        <div
          className="relative tabular-nums"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 78,
            fontWeight: 700,
            letterSpacing: 4,
            lineHeight: 1,
            color: isRunning ? 'var(--green)' : 'var(--text3)',
            textShadow: isRunning
              ? '0 0 60px color-mix(in srgb, var(--green) 25%, transparent)'
              : 'none',
            transition: 'color .4s, text-shadow .4s'
          }}
        >
          {formatDuration(elapsedSeconds)}
        </div>
        {isRunning && selectedClient && (
          <div className="mt-2.5 flex items-center justify-center gap-2">
            <span
              className="inline-block h-2 w-2 animate-pulse rounded-full"
              style={{ backgroundColor: selectedClient.color }}
            />
            <span className="text-sm" style={{ color: 'var(--text2)' }}>
              {selectedClient.name}
            </span>
          </div>
        )}
      </div>

      {/* Form card */}
      <div
        className="rounded-[14px] border backdrop-blur-xl"
        style={{
          background: 'var(--card-bg)',
          borderColor: 'var(--card-border)',
          padding: 24,
          width: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: 'var(--shadow)'
        }}
      >
        {/* Client */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text3)' }}
          >
            {t('timer.client.label')}
          </label>
          <div className="relative">
            <select
              aria-label={t('timer.client.label')}
              value={selectedClientId ?? ''}
              onChange={(e) =>
                setSelectedClientId(e.target.value ? Number(e.target.value) : null)
              }
              disabled={isRunning}
              className="w-full appearance-none rounded-[10px] border px-3.5 py-2.5 pr-9 text-sm backdrop-blur-xl
                focus:outline-none focus:ring-2 focus:ring-indigo-500
                disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: 'var(--input-bg)',
                borderColor: 'var(--card-border)',
                color: 'var(--text)'
              }}
            >
              <option value="">{t('timer.client.placeholder')}</option>
              {activeClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text3)' }}
            >
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

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text3)' }}
          >
            {t('timer.description.label')}
          </label>
          <input
            type="text"
            placeholder={t('timer.description.placeholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isRunning}
            onKeyDown={(e) => e.key === 'Enter' && canStart && start()}
            className="rounded-[10px] border px-3.5 py-2.5 text-sm backdrop-blur-xl
              focus:outline-none focus:ring-2 focus:ring-indigo-500
              disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: 'var(--input-bg)',
              borderColor: 'var(--card-border)',
              color: 'var(--text)'
            }}
          />
        </div>

        {/* Start / Stop */}
        {!isRunning ? (
          <button
            type="button"
            onClick={start}
            disabled={!canStart || isLoading}
            className="flex items-center justify-center gap-2.5 rounded-[12px] py-3 text-base font-bold transition-all
              disabled:cursor-not-allowed"
            style={{
              background: canStart && !isLoading ? 'var(--accent)' : 'var(--card-bg)',
              color: canStart && !isLoading ? '#fff' : 'var(--text3)',
              border: 'none',
              boxShadow:
                canStart && !isLoading ? '0 8px 32px var(--accent-glow)' : 'none'
            }}
          >
            <Icons.Play width={16} height={16} />
            {isLoading ? '…' : 'Start'}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            disabled={isLoading}
            className="flex items-center justify-center gap-2.5 rounded-[12px] py-3 text-base font-bold transition-all disabled:opacity-50"
            style={{
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              border: '1px solid var(--danger)'
            }}
          >
            <Icons.Stop width={16} height={16} />
            {isLoading ? '…' : 'Stop'}
          </button>
        )}
      </div>

      {/* Hint with hotkey */}
      {isRunning && (
        <p className="text-xs" style={{ color: 'var(--text3)' }}>
          {t('timer.running.hint')} ·{' '}
          <kbd
            className="font-mono"
            style={{ color: 'var(--text2)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            Alt+Shift+S
          </kbd>{' '}
          {t('timer.running.stopHint')}
        </p>
      )}
    </div>
  )
}
