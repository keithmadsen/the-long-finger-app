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
    // Delete-path P0 coverage gate (Story 3.4; epic-1 retro item 7 targets).
    // Scoped to the delete-path modules — the P0 interaction's state machine
    // and mutation — NOT blanket global numbers: a global threshold would
    // dilute the signal across unrelated files and let the P0 path regress
    // behind an average. Enforced only when run with --coverage
    // (`npm run test:coverage`, the CI web-test step).
    coverage: {
      provider: 'v8',
      include: ['src/hooks/useArmedDelete.ts', 'src/hooks/useDeleteTodo.ts'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
})
