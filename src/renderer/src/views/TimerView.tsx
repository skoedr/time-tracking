import { useTimer, formatDuration } from '../hooks/useTimer'
import { useT } from '../contexts/I18nContext'

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
    <div className="max-w-md mx-auto mt-12 flex flex-col gap-6">
      {/* Timer Display */}
      <div className="text-center">
        <div
          className={`text-7xl font-mono font-bold tabular-nums transition-colors ${
            isRunning ? 'text-green-400' : 'text-slate-300'
          }`}
        >
          {formatDuration(elapsedSeconds)}
        </div>
        {isRunning && selectedClient && (
          <div className="mt-2 flex items-center justify-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full animate-pulse"
              style={{ backgroundColor: selectedClient.color }}
            />
            <span className="text-slate-400 text-sm">{selectedClient.name}</span>
          </div>
        )}
      </div>

      {/* Client Selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">{t('timer.client.label')}</label>
        <select
          value={selectedClientId ?? ''}
          onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : null)}
          disabled={isRunning}
          className="rounded-lg px-3 py-2.5 border backdrop-blur-xl
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
        >
          <option value="">{t('timer.client.placeholder')}</option>
          {activeClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {activeClients.length === 0 && (
          <p className="text-slate-500 text-xs">
            {t('timer.client.noClientsHint')}{' '}
            <span className="text-indigo-400">{t('timer.client.noClientsLink')}</span>{t('timer.client.noClientsSuffix')}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">
          {t('timer.description.label')}
        </label>
        <input
          type="text"
          placeholder={t('timer.description.placeholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isRunning}
          onKeyDown={(e) => e.key === 'Enter' && canStart && start()}
          className="rounded-lg px-3 py-2.5 border backdrop-blur-xl
            focus:outline-none focus:ring-2 focus:ring-indigo-500
            focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
        />
      </div>

      {/* Start / Stop Button */}
      {!isRunning ? (
        <button
          onClick={start}
          disabled={!canStart || isLoading}
          className="text-white font-semibold py-3 rounded-xl transition-colors text-lg
            disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: canStart && !isLoading ? 'var(--accent)' : 'var(--card-bg)', color: canStart && !isLoading ? 'white' : 'var(--text3)' }}
        >
          {isLoading ? '...' : '▶ Start'}
        </button>
      ) : (
        <button
          onClick={stop}
          disabled={isLoading}
          className="font-semibold py-3 rounded-xl transition-colors text-lg disabled:opacity-50"
          style={{ background: 'var(--danger)', color: 'white' }}
        >
          {isLoading ? '...' : '■ Stop'}
        </button>
      )}

      {/* Running status hint */}
      {isRunning && (
        <p className="text-center text-slate-500 text-xs">
          {t('timer.running.hint')} · <kbd className="font-mono text-slate-400">Alt+Shift+S</kbd> {t('timer.running.stopHint')}
        </p>
      )}
    </div>
  )
}
