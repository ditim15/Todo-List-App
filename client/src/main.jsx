import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Display face for headlines and the DoneYet? wordmark (see --font-display in
// index.css). opsz axis included.
import '@fontsource-variable/fraunces/opsz.css'
import './index.css'
import App from './App.jsx'

// Entry point: mounts the React app into the #root element defined in index.html.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
