import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import MiniApp from './MiniApp'
import { SettingsProvider } from './contexts/SettingsContext'
import { I18nProvider } from './contexts/I18nContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <I18nProvider>
        <MiniApp />
      </I18nProvider>
    </SettingsProvider>
  </StrictMode>
)
