import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted brand font for the DoneYet? wordmark (see --brand-font in index.css).
import '@fontsource-variable/fredoka/wght.css'
// Display face for headlines (see --font-display in index.css). opsz axis included.
import '@fontsource-variable/fraunces/opsz.css'
import './index.css'
import App from './App.jsx'

// Entry point: mounts the React app into the #root element defined in index.html.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
