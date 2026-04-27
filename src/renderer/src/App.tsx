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
  const { idleEvent, idleKeep, idleStopAtIdle, idleMarkPause, quickNoteEntry, setQuickNoteEntry, runningEntry, clients } =
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
      {/* Ambient glow blobs — placed directly on the viewport (no clipping
          wrapper) and tinted with already-dilute *-bg tokens so they fade
          into the page bg instead of forming a visible frame. */}
      <div
        aria-hidden
        className="pointer-events-none fixed rounded-full"
        style={{
          top: -100,
          right: '20%',
          width: 400,
          height: 400,
          background: 'var(--accent-bg)',
          filter: 'blur(80px)',
          zIndex: 0
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed rounded-full"
        style={{
          bottom: -50,
          left: '10%',
          width: 300,
          height: 300,
          background: 'var(--green-bg)',
          filter: 'blur(80px)',
          zIndex: 0
        }}
      />

      <UpdateBanner />
      {/* Nav */}
      <nav
        className="relative z-10 flex items-center gap-1 px-3 py-2 shrink-0 border-b backdrop-blur-xl"
        style={{
          background: 'var(--nav-bg)',
          borderColor: 'var(--card-border)'
        }}
      >
        {(['today', 'timer', 'calendar', 'clients', 'settings'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              ${view === v ? 'bg-indigo-600 text-white' : 'hover:bg-white/10'}`}
            style={view !== v ? { color: 'var(--text2)' } : undefined}
          >
            {t(('nav.' + v) as `nav.${View}`)}
          </button>
        ))}

        {/* Running timer pill */}
        {runningEntry && (() => {
          const client = clients.find((c) => c.id === runningEntry.client_id)
          return (
            <RunningPill
              startedAt={runningEntry.started_at}
              clientName={client?.name}
              clientColor={client?.color}
            />
          )
        })()}
      </nav>

      {/* Content */}
      <main className="relative z-10 flex-1 overflow-y-auto p-6 flex flex-col">
        <div key={view} className="view-enter flex-1 flex flex-col">
          {view === 'today' && <TodayView />}
          {view === 'timer' && <TimerView />}
          {view === 'calendar' && <CalendarView />}
          {view === 'clients' && <ClientsView />}
          {view === 'settings' && <SettingsView />}
        </div>
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

// ── Running timer pill (nav bar, right side) ────────────────────────────────
function RunningPill({
  startedAt,
  clientName,
  clientColor
}: {
  startedAt: string
  clientName?: string
  clientColor?: string
}): React.JSX.Element {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

  return (
    <div
      className="ml-auto flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
      style={{ background: 'var(--green-bg)', borderColor: 'var(--green)', color: 'var(--green)' }}
    >
      <span
        className="h-2 w-2 animate-pulse rounded-full"
        style={{ backgroundColor: clientColor ?? 'var(--green)' }}
      />
      {clientName && <span className="font-medium" style={{ color: 'var(--text)' }}>{clientName}</span>}
      <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
    </div>
  )
}
