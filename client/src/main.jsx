import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Archivo: the one face for display, UI and reading (see --font-display in
// index.css). Weight axis 100-900.
import '@fontsource-variable/archivo'
import './index.css'
import App from './App.jsx'
// Starts listening for the browser's install offer before React mounts, so it isn't missed.
import { listenForInstallPrompt } from './pwa/installPrompt'

listenForInstallPrompt()

// The service worker (src/pwa/sw.js, built to /sw.js) makes the site installable and quick to open from
// the home screen. Production only: in development it would cache Vite's modules and
// get in the way of hot reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// Entry point: mounts the React app into the #root element defined in index.html.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
