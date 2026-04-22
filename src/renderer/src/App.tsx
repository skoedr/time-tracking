import { useState } from 'react'
import TimerView from './views/TimerView'
import ClientsView from './views/ClientsView'

type View = 'timer' | 'calendar' | 'clients' | 'settings'

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('timer')

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex flex-col overflow-hidden">
      {/* Nav */}
      <nav className="flex gap-1 px-3 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
        {(['timer', 'calendar', 'clients', 'settings'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors
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
          <div className="text-slate-500 text-center mt-16">Kalender-Ansicht — kommt bald</div>
        )}
        {view === 'clients' && <ClientsView />}
        {view === 'settings' && (
          <div className="text-slate-500 text-center mt-16">Einstellungen — kommen bald</div>
        )}
      </main>
    </div>
  )
}

export default App


