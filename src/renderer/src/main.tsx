import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './assets/base.css'
import './assets/main.css'
// v1.5 PR A — route renderer console.* through main-process electron-log
// (which is initialized with spyRendererConsole: true). Picked up via IPC.
import 'electron-log/renderer'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SettingsProvider } from './contexts/SettingsContext'
import { I18nProvider } from './contexts/I18nContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { RoundingProvider } from './contexts/RoundingContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <I18nProvider>
        <ThemeProvider>
          <RoundingProvider>
            <App />
          </RoundingProvider>
        </ThemeProvider>
      </I18nProvider>
    </SettingsProvider>
  </StrictMode>
)
