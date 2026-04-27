import { useState, useEffect } from 'react'
import TodayView from './views/TodayView'
import TimerView from './views/TimerView'
import CalendarView from './views/CalendarView'
import ClientsView from './views/ClientsView'
import SettingsView from './views/SettingsView'
import { IdleModal } from './components/IdleModal'
import { QuickNoteModal } from './components/QuickNoteModal'
import { ToastTray } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import { OnboardingWizard } from './components/OnboardingWizard'
import { useTimer } from './hooks/useTimer'
import { useT } from './contexts/I18nContext'

type View = 'today' | 'timer' | 'calendar' | 'clients' | 'settings'

function App(): React.JSX.Element {
  const t = useT()
  const [view, setView] = useState<View>('today')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const { idleEvent, idleKeep, idleStopAtIdle, idleMarkPause, quickNoteEntry, setQuickNoteEntry } =
    useTimer()

  // Check onboarding flag on mount — show wizard only for fresh installs.
  useEffect(() => {
    void window.api.settings.getAll().then((res) => {
      if (res.ok && res.data.onboarding_completed === '0') {
        setShowOnboarding(true)
      }
    })
  }, [])

  async function finishOnboarding(): Promise<void> {
    setShowOnboarding(false)
    await window.api.settings.set('onboarding_completed', '1')
  }

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--page-bg)', color: 'var(--text)' }}
    >
      {/* Ambient glow blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-20 blur-3xl" style={{ background: 'var(--accent)' }} />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-15 blur-3xl" style={{ background: 'var(--green)' }} />
      </div>

      <UpdateBanner />
      {/* Nav */}
      <nav
        className="relative z-10 flex gap-1 px-3 py-2 shrink-0 border-b backdrop-blur-xl"
        style={{
          background: 'var(--nav-bg)',
          borderColor: 'var(--card-border)'
        }}
      >
        {(['today', 'timer', 'calendar', 'clients', 'settings'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              ${view === v ? 'bg-indigo-600 text-white' : 'hover:bg-white/10'}`}
            style={view !== v ? { color: 'var(--text2)' } : undefined}
          >
            {t(('nav.' + v) as `nav.${View}`)}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="relative z-10 flex-1 overflow-y-auto p-6">
        {view === 'today' && <TodayView />}
        {view === 'timer' && <TimerView />}
        {view === 'calendar' && <CalendarView />}
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
      {quickNoteEntry && (
        <QuickNoteModal entry={quickNoteEntry} onDone={() => setQuickNoteEntry(null)} />
      )}

      <ToastTray />

      <OnboardingWizard open={showOnboarding} onFinish={() => void finishOnboarding()} />
    </div>
  )
}

export default App
