import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the UI runs here and the Python API runs on 8090; this proxy
// means the front end only ever talks to relative /api paths, so the same code
// works unchanged when FastAPI serves the built files itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8090' },
  },
})
