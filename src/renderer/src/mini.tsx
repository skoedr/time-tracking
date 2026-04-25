import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import MiniApp from './MiniApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MiniApp />
  </StrictMode>
)
