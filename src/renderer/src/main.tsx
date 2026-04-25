import './assets/main.css'
// v1.5 PR A — route renderer console.* through main-process electron-log
// (which is initialized with spyRendererConsole: true). Picked up via IPC.
import 'electron-log/renderer'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { I18nProvider } from './contexts/I18nContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>
)
