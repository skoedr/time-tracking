import { useState } from 'react'
import TimerView from './views/TimerView'
import ClientsView from './views/ClientsView'
import SettingsView from './views/SettingsView'
import { IdleModal } from './components/IdleModal'
import { useTimer } from './hooks/useTimer'

type View = 'timer' | 'calendar' | 'clients' | 'settings'

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('timer')
  const { idleEvent, idleKeep, idleStopAtIdle, idleMarkPause } = useTimer()

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex flex-col overflow-hidden">
      {/* Nav */}
      <nav className="flex gap-1 px-3 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
        {(['timer', 'calendar', 'clients', 'settings'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              ${view === v ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}
          >
            {v === 'timer'
              ? 'Timer'
              : v === 'calendar'
                ? 'Kalender'
                : v === 'clients'
                  ? 'Kunden'
                  : 'Einstellungen'}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {view === 'timer' && <TimerView />}
        {view === 'calendar' && (
          <div className="flex flex-col items-center justify-center mt-24 gap-3 text-slate-600">
            <span className="text-5xl">📅</span>
            <p className="font-medium text-slate-400">Kalender-Ansicht</p>
            <p className="text-sm">Kommt in der nächsten Session.</p>
          </div>
        )}
        {view === 'clients' && <ClientsView />}
        {view === 'settings' && <SettingsView />}
      </main>

      {idleEvent && (
        <IdleModal
          idleSince={idleEvent.idleSince}
          idleSeconds={idleEvent.idleSeconds}
          onKeep={idleKeep}
          onStopAtIdle={idleStopAtIdle}
          onMarkPause={idleMarkPause}
        />
      )}
    </div>
  )
}

export default App


