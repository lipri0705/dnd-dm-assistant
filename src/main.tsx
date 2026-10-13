import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Saves are fire-and-forget; surface any failed IndexedDB write (e.g. quota exceeded) instead of losing it silently.
window.addEventListener('unhandledrejection', (e) => {
  alert(`Something went wrong, the last change may not be saved:\n${e.reason}`)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
