import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import MiniApp from './MiniApp'
import { useSettingsStore } from './store/settingsStore'
import { I18nProvider } from './contexts/I18nContext'

// v1.13.2 PR 2: settings live in a zustand store — no provider to forget
// (the missing SettingsProvider here is exactly what broke the mini widget
// in v1.13.0, fixed in v1.13.1). Kick off the load before first render.
void useSettingsStore.getState().load()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <MiniApp />
    </I18nProvider>
  </StrictMode>
)
