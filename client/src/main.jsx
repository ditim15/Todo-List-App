import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted brand font for the Nudge wordmark (see --brand-font in index.css).
import '@fontsource-variable/fredoka/wght.css'
import './index.css'
import App from './App.jsx'

// Entry point: mounts the React app into the #root element defined in index.html.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
