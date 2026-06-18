import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The Fastify API port (matches apps/api default / PORT in .env.example).
const API_PORT = process.env.PORT ?? '3001'
const API_TARGET = `http://localhost:${API_PORT}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev-origin bridge: proxy the API routes to the Fastify process so the
    // browser sees one logical origin (no CORS needed). This is AC 1.
    proxy: {
      '/todos': { target: API_TARGET, changeOrigin: true },
      '/health': { target: API_TARGET, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
