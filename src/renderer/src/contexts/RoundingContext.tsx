import { createContext, useContext, useState, useEffect } from 'react'
import { useSettings } from './SettingsContext'

interface RoundingCtx {
  /** Rounding step in minutes; 0 = no rounding (pass-through). */
  roundMinutes: number
  /** Persist a new rounding step and update local state. */
  setRoundMinutes: (n: number) => Promise<void>
}

const RoundingContext = createContext<RoundingCtx>({
  roundMinutes: 0,
  setRoundMinutes: async () => {}
})

/**
 * Reads `pdf_round_minutes` from SettingsContext (no own IPC call).
 * Exposes `roundMinutes` and `setRoundMinutes` to the component tree.
 *
 * `setRoundMinutes` updates local state immediately and persists via
 * `window.api.settings.set()`, so the calendar reflects rounding changes
 * without a reload. v1.12 #106
 */
export function RoundingProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { settings, setSetting } = useSettings()
  const [roundMinutes, setRoundMinutesState] = useState(0)

  // Sync from SettingsContext once loaded (and whenever it changes).
  useEffect(() => {
    const v = parseInt(settings?.pdf_round_minutes ?? '0', 10)
    setRoundMinutesState(Number.isFinite(v) && v > 0 ? v : 0)
  }, [settings?.pdf_round_minutes])

  const setRoundMinutes = async (n: number): Promise<void> => {
    setRoundMinutesState(n)
    await setSetting('pdf_round_minutes', String(n) as never)
  }

  return (
    <RoundingContext.Provider value={{ roundMinutes, setRoundMinutes }}>
      {children}
    </RoundingContext.Provider>
  )
}

/** Returns `{ roundMinutes, setRoundMinutes }`. Must be inside RoundingProvider. */
export function useRounding(): RoundingCtx {
  return useContext(RoundingContext)
}
