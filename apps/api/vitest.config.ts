import { defineConfig } from 'vitest/config';

// Two independent projects so CI can run them as separate gates:
//   unit        — co-located src/**/*.test.ts
//   integration — test/integration/**/*.test.ts (real temp-file SQLite)
export default defineConfig({
  test: {
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
