import { useTimer, formatDuration } from '../hooks/useTimer'

export default function TimerView() {
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
        <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">Kunde</label>
        <select
          value={selectedClientId ?? ''}
          onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : null)}
          disabled={isRunning}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">— Kunden auswählen —</option>
          {activeClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {activeClients.length === 0 && (
          <p className="text-slate-500 text-xs">
            Noch keine Kunden angelegt. Gehe zu{' '}
            <span className="text-indigo-400">Kunden</span>, um welche hinzuzufügen.
          </p>
        )}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">
          Beschreibung
        </label>
        <input
          type="text"
          placeholder="Woran arbeitest du?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isRunning}
          onKeyDown={(e) => e.key === 'Enter' && canStart && start()}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100
            placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500
            focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Start / Stop Button */}
      {!isRunning ? (
        <button
          onClick={start}
          disabled={!canStart || isLoading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500
            text-white font-semibold py-3 rounded-xl transition-colors text-lg
            disabled:cursor-not-allowed"
        >
          {isLoading ? '...' : '▶ Start'}
        </button>
      ) : (
        <button
          onClick={stop}
          disabled={isLoading}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold
            py-3 rounded-xl transition-colors text-lg"
        >
          {isLoading ? '...' : '■ Stop'}
        </button>
      )}

      {/* Running status hint */}
      {isRunning && (
        <p className="text-center text-slate-500 text-xs">
          Timer läuft · F5 zum Stoppen (Hotkey folgt)
        </p>
      )}
    </div>
  )
}
