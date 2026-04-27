import { createContext, useContext, useState, useEffect } from 'react'

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
  const [mode, setMode] = useState<ThemeMode>('system')

  // Load persisted mode from DB on mount.
  useEffect(() => {
    void window.api.settings.getAll().then((res) => {
      if (res.ok) setMode((res.data.theme_mode as ThemeMode) ?? 'system')
    })
  }, [])

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

  return <ThemeContext.Provider value={{ themeMode: mode, setThemeMode }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
