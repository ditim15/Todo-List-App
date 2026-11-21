import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Archivo: the one face for display, UI and reading (see --font-display in
// index.css). Weight axis 100-900.
import '@fontsource-variable/archivo'
import './index.css'
import App from './App.jsx'

// Entry point: mounts the React app into the #root element defined in index.html.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
