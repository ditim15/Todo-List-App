import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Writes dist/sw.js from src/pwa/sw.js, filling in the list of built files to cache on
// install (so every page works offline after the first visit) and a version made from
// those file names (so each deploy installs a fresh worker and clears the old caches).
function serviceWorker() {
  return {
    name: 'doneyet-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((file) => file !== 'index.html' && !file.endsWith('.map'))
        .sort()
        .map((file) => `/${file}`)
      const template = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8')
      // The worker's own code is part of the version, so changing it also starts fresh caches.
      const version = createHash('sha256').update(template).update(files.join('\n')).digest('hex').slice(0, 12)
      const source = template
        .replace("'__SW_VERSION__'", JSON.stringify(version))
        .replace("'__SW_PRECACHE__'", JSON.stringify(files))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
})
