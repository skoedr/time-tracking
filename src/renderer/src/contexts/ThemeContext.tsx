import { createContext, useContext, useState, useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'system',
  setThemeMode: () => {}
})

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  // Selector: re-renders only when theme_mode changes (v1.13.2 PR 2).
  const themeMode = useSettingsStore((s) => s.settings?.theme_mode)
  const [mode, setMode] = useState<ThemeMode>('system')

  // Sync theme mode once settings are loaded.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- #142: dauerhaft — ruft rohes window.api.settings.set, und settings:set sendet kein Push-Update — lokaler State ist die einzige Stelle, die von der Änderung erfährt
    if (themeMode) setMode((themeMode as ThemeMode) ?? 'system')
  }, [themeMode])

  // Apply .dark class and listen for OS preference changes when mode = 'system'.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = (): void => {
      const isDark = mode === 'dark' || (mode === 'system' && mql.matches)
      document.documentElement.classList.toggle('dark', isDark)
    }

    apply()

    if (mode === 'system') {
      mql.addEventListener('change', apply)
      return () => mql.removeEventListener('change', apply)
    }
    return undefined
  }, [mode])

  const setThemeMode = (newMode: ThemeMode): void => {
    setMode(newMode)
    void window.api.settings.set('theme_mode', newMode)
  }

  return (
    <ThemeContext.Provider value={{ themeMode: mode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider + Hook bewusst im selben Modul; Fast-Refresh-Split ohne Laufzeitnutzen.
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
