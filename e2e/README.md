# E2E & API Test Harness (Playwright)

The committed Playwright harness for **the long finger** — repo-wide end-to-end
and pure-API tests that run against the real app (Fastify + Vite), on an isolated
SQLite database. Stood up in Epic 3 via `bmad-testarch-framework`; it is the
prerequisite for Story 3.3 (browser forced-colors / reduced-motion / 200%-zoom
gates) and is owned/expanded by Story 3.4 (full CI quality gates).

Unit and integration tests live with their apps (`apps/web`, `apps/api`) under
Vitest — this harness is only for cross-stack E2E and API/service tests.

## Setup

```bash
nvm use            # Node 24 (better-sqlite3 ABI)
npm ci
npx playwright install --with-deps chromium
```

## Running

```bash
npm run test:e2e            # full suite (PR default) — boots the app automatically
npm run test:e2e:p0         # P0 only  (--grep @p0)
npm run test:e2e:p1         # P0 + P1  (--grep "@p0|@p1")
npm run test:e2e:report     # open the last HTML report

# Iterating locally:
npx playwright test --ui                 # interactive UI mode
npx playwright test --headed --project=chromium
npx playwright test e2e/tests/ui/capture-and-complete.smoke.spec.ts --debug
npx playwright test --project=api        # browserless API specs only
```

The config's `webServer` runs `npm run dev` (API + web in parallel) and waits for
`http://localhost:5173`. `reuseExistingServer` is on locally, so if you already
have `npm run dev` up it attaches to it. In CI a fresh server is always started.

## Architecture

```
playwright.config.ts          # repo root — projects, webServer, reporters, timeouts
e2e/
├── support/
│   ├── api-fixtures.ts        # mergeTests(apiRequest, recurse) — browserless API tests
│   ├── ui-fixtures.ts         # mergeTests(seedTodos, interceptNetworkCall, networkErrorMonitor)
│   └── factories/
│       └── todo-factory.ts    # createTodo() — faker + UUIDv7, matches createTodoBody
└── tests/
    ├── api/*.api.spec.ts      # `api` project — no browser launched
    └── ui/*.spec.ts           # `chromium` project
```

**Two projects, one config.** `*.api.spec.ts` runs in the `api` project with no
browser (fast); everything else runs in `chromium`. Import the matching test
object:

```ts
// API / service specs
import { test, expect } from '../../support/api-fixtures'

// Browser specs
import { test, expect, createTodo } from '../../support/ui-fixtures'
```

Built on [`@seontechnologies/playwright-utils`](https://github.com/seontechnologies/playwright-utils):
`apiRequest` (typed HTTP client, path resolves against `baseURL` → the Vite proxy
→ Fastify), `recurse` (polling), `interceptNetworkCall` (spy/stub for forced-error
paths), and `network-error-monitor` (auto-fails a UI test on any stray 4xx/5xx).

## Best practices

- **API-first setup.** Seed state with `seedTodos` / `apiRequest`, never by driving
  the UI. The UI is for *validation* only. `seedTodos` deletes what it created in
  teardown, so specs stay self-cleaning against the shared E2E database.
- **Selectors: accessible roles, not `data-testid`.** The app is built on its a11y
  contract — `role="list"`/`listitem`, capture input by placeholder
  `What do you want to do?`, and each row's checkbox by `aria-label={description}`.
  Prefer `getByRole` / `getByPlaceholder`.
- **Toggling completion:** the real `<input>` is hidden behind a styled indicator,
  and the whole row is a `<label>` tap-target (Story 1.8). Toggle by clicking the
  row/description — **not** `checkbox.check()` on the hidden input.
- **Tags:** mark every spec `@p0`/`@p1`/`@p2` (priority) and `@API`/UI so
  `--grep` can select tiers. See `test-design-qa.md` for the priority matrix.
- **No hard waits.** Use web-first assertions (`expect(...).toBeVisible()`) and
  `interceptNetworkCall`/`recurse`, never `waitForTimeout`.
- **Intentional-error specs** (expecting a 4xx/5xx) must opt out of the network
  monitor: `test('...', { annotation: [{ type: 'skipNetworkMonitoring' }] }, ...)`.

## Isolation

`webServer` boots the API with `DATABASE_PATH=./data/e2e.db` (override via
`E2E_DATABASE_PATH`), resolved relative to `apps/api` and gitignored, so E2E runs
never touch dev data. Specs are individually self-cleaning; the file itself is
disposable and can be deleted between runs.

## CI integration

Not yet wired into `.github/workflows/ci.yml` — that single `e2e` job (plus
`npx playwright install --with-deps chromium` and failure-artifact upload of
`test-results/` + `playwright-report/`) is **Story 3.4**. HTML + JUnit reporters
are already configured; JUnit lands at `test-results/results.xml`.

## Knowledge base references

- `test-design-qa.md` — priority matrix, factory pattern, execution strategy
- `deferred-work.md` — why this harness exists (Epic 2 retro carry-over)
- playwright-utils fragments: `overview`, `api-request`, `fixtures-composition`,
  `intercept-network-call`, `network-error-monitor`, `data-factories`
