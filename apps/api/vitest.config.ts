import { defineConfig } from 'vitest/config';

// Two independent projects so CI can run them as separate gates:
//   unit        — co-located src/**/*.test.ts
//   integration — test/integration/**/*.test.ts (real temp-file SQLite)
export default defineConfig({
  test: {
    // Delete-path P0 coverage gate (Story 3.4; epic-1 retro item 7 targets):
    // >80% integration coverage scoped to the modules the DELETE path flows
    // through (route + repository — they also carry the other endpoints, but
    // they ARE the delete path's integration surface). Coverage options live
    // at the root in projects mode; enforced only with --coverage
    // (`npm run test:integration:coverage`, the CI integration step).
    coverage: {
      provider: 'v8',
      include: ['src/routes/todos.route.ts', 'src/repositories/todo.repository.ts'],
      thresholds: {
        statements: 80.01,
        branches: 80.01,
        functions: 80.01,
        lines: 80.01,
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/integration/**/*.test.ts'],
        },
      },
    ],
  },
});
