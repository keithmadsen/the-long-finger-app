import { defineConfig, devices } from '@playwright/test'

// Repo-root Playwright config so `npx playwright test` is the PR default
// (test-design-qa.md Appendix A). This is the "Committed Playwright e2e harness"
// carried from the Epic 2 retro (deferred-work.md): prerequisite for Story 3.3
// (browser forced-colors / reduced-motion / 200%-zoom gates) and owned by
// Story 3.4 (expanded CI quality gates). Stood up via bmad-testarch-framework.
//
// Layout: specs + fixtures live under e2e/. Two projects keep pure API/service
// tests browserless (fast) while UI tests run in Chromium:
//   - `api`     → **/*.api.spec.ts, no browser
//   - `chromium`→ everything else, Desktop Chrome

// The web (Vite) dev origin. It proxies /todos and /health to the Fastify API,
// so a single baseURL serves both UI navigation and apiRequest path resolution.
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './test-results',
  fullyParallel: true,
  // Block a stray .only() from silently green-lighting a partial CI run.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 2 matches GitHub hosted-runner vCPUs; the suite is parallel-safe by design
  // (random stamps + GET-scoping + self-cleaning seeds — see e2e/support).
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['list'],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure-and-retries',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      // Pure API / service tests — no browser launched.
      name: 'api',
      testMatch: /.*\.api\.spec\.ts/,
    },
    {
      name: 'chromium',
      testIgnore: /.*\.api\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Emulation gates (Story 3.3) are per-test `page.emulateMedia()` /
    // `setViewportSize()` calls in e2e/tests/ui/a11y-modes.spec.ts. Dedicated
    // whole-suite emulation projects were DECLINED (Keith, 2026-07-14, Story
    // 3.4): they would multiply chromium CI time with no new assertion
    // coverage. Decision recorded in docs/wcag-conformance-matrix.md.
  ],
  // Boot the full app (Fastify API + Vite web) against an isolated SQLite file
  // so E2E runs never touch dev data. DATABASE_PATH is resolved relative to
  // apps/api (its dev cwd), and *.db is gitignored.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: '3001',
      DATABASE_PATH: process.env.E2E_DATABASE_PATH ?? './data/e2e.db',
    },
  },
})
