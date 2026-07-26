import { createContext, useContext, useState, useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'

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
 * Reads `pdf_round_minutes` from the settings store (no own IPC call).
 * Exposes `roundMinutes` and `setRoundMinutes` to the component tree.
 *
 * `setRoundMinutes` updates local state immediately and persists via
 * `window.api.settings.set()`, so the calendar reflects rounding changes
 * without a reload. v1.12 #106
 */
export function RoundingProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  // Selector: re-renders only when pdf_round_minutes changes (v1.13.2 PR 2).
  const pdfRoundMinutes = useSettingsStore((s) => s.settings?.pdf_round_minutes)
  const setSetting = useSettingsStore((s) => s.setSetting)
  const [roundMinutes, setRoundMinutesState] = useState(0)

  // Sync from the settings store once loaded (and whenever it changes).
  useEffect(() => {
    const v = parseInt(pdfRoundMinutes ?? '0', 10)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- #142: React-Compiler-Regel, Aufarbeitung im Folge-PR
    setRoundMinutesState(Number.isFinite(v) && v > 0 ? v : 0)
  }, [pdfRoundMinutes])

  const setRoundMinutes = async (n: number): Promise<void> => {
    setRoundMinutesState(n)
    await setSetting('pdf_round_minutes', String(n))
  }

  return (
    <RoundingContext.Provider value={{ roundMinutes, setRoundMinutes }}>
      {children}
    </RoundingContext.Provider>
  )
}

/** Returns `{ roundMinutes, setRoundMinutes }`. Must be inside RoundingProvider. */
// eslint-disable-next-line react-refresh/only-export-components -- Provider + Hook bewusst im selben Modul; Fast-Refresh-Split ohne Laufzeitnutzen.
export function useRounding(): RoundingCtx {
  return useContext(RoundingContext)
}
