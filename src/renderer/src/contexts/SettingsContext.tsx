import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { Settings } from '../../../shared/types'

interface SettingsCtx {
  /** All settings, or null while the initial load is in progress. */
  settings: Settings | null
  /** Update a single setting both locally and in the DB. */
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
}

const SettingsContext = createContext<SettingsCtx | null>(null)

/**
 * Outermost provider — calls `window.api.settings.getAll()` once on mount
 * and makes settings available to the entire React tree.
 *
 * Replaces the three independent `getAll()` calls that used to live in
 * `I18nContext`, `ThemeContext`, and `App.tsx`. v1.12 #106
 */
export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    void window.api.settings.getAll().then((res) => {
      if (res.ok) setSettings(res.data)
    })
  }, [])

  const setSetting = useCallback(async <K extends keyof Settings>(
    key: K,
    value: Settings[K]
  ): Promise<void> => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
    await window.api.settings.set(String(key), String(value))
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, setSetting }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
