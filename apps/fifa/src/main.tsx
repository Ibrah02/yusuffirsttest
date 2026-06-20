import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Session } from './session'
import './styles.css'

// Build the engine session once at boot (wires inspectors + mock interceptors).
Session.initialize()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
