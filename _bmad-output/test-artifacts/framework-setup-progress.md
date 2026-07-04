---
stepsCompleted: ['step-01-preflight', 'step-02-select-framework', 'step-03-scaffold-framework', 'step-04-docs-and-scripts', 'step-05-validate-and-summary']
lastStep: 'step-05-validate-and-summary'
lastSaved: '2026-07-04'
workflowStatus: 'completed'
framework: 'Playwright'
---

# Test Framework Setup — Progress

## Step 01: Preflight

- **Detected stack:** fullstack (frontend `apps/web` React 19 + Vite 8; backend `apps/api` Fastify)
- **Package manager:** npm workspaces (`apps/*`, `packages/*`), Node >=24
- **Existing E2E framework:** none found (no playwright.config.* / cypress config) — clean to scaffold
- **Relevant deps already present:** `axe-core@4.12.1`, `vitest-axe@0.1.0` in `apps/web`; TanStack Query; uuid
- **CI platform:** GitHub Actions (`.github/workflows/ci.yml`)
- **Context docs:** architecture.md, test-design/test-design-qa.md, epics.md, deferred-work.md
- **Requested stack:** @playwright/test + @seontechnologies/playwright-utils/api-request/fixtures + axe-core; @p0/@p1 grep tags; `npx playwright test` PR default
- **Purpose:** deferred "Committed Playwright e2e harness" — prerequisite for Story 3.3, owned by Story 3.4
- **Prerequisites:** PASS

## Step 02: Framework Selection

- **Selected browser/E2E framework:** Playwright (`config.test_framework: auto` → auto-select)
- **Rationale:** fullstack; multi-browser emulation needed for Story 3.3 (forced-colors / reduced-motion / 200%-zoom); heavy API+UI integration via playwright-utils API-request fixtures; CI parallelism for <15min PR suite; already the committed choice in test-design-qa.md
- **Backend framework:** unchanged — `apps/api` already uses Vitest (unit + integration). No new backend framework scaffolded; Playwright adds the E2E/browser + API-e2e layer only.

## Step 03: Scaffold Framework

**Execution mode:** sequential (single-agent).

**Files created:**
- `playwright.config.ts` (repo root) — two projects: `api` (browserless, `**/*.api.spec.ts`) + `chromium`; HTML+JUnit+list reporters; standard timeouts (action 15s / nav 30s / expect 10s / test 60s); trace/screenshot/video on failure; `webServer: npm run dev` on an isolated `DATABASE_PATH=./data/e2e.db`; baseURL `http://localhost:5173` (Vite proxy → Fastify). Story 3.3 emulation-project extension point left commented.
- `e2e/support/api-fixtures.ts` — `mergeTests(apiRequest, recurse)` for pure API specs (no browser).
- `e2e/support/ui-fixtures.ts` — `mergeTests(seedTodos+apiRequest, interceptNetworkCall, networkErrorMonitor)`; `seedTodos` custom fixture (API-first setup, self-cleaning teardown).
- `e2e/support/factories/todo-factory.ts` — `createTodo()` (faker + UUIDv7), matches `createTodoBody` `{id, description}`.
- `e2e/tests/api/todos.api.spec.ts` — samples: `@p0 create persists`, `@p1 delete idempotent`.
- `e2e/tests/ui/capture-and-complete.smoke.spec.ts` — samples: `@p0` seeded-render+complete (drives whole-row `<label>`), `@p0` capture-adds-task.
- `e2e/tsconfig.json`, `e2e/.env.example`.

**Config/deps:**
- Root devDeps: `@playwright/test ^1.61.1`, `@seontechnologies/playwright-utils ^4.4.0`, `@faker-js/faker ^10.5.0`, `uuid ^14.0.1`; Chromium installed.
- Root scripts: `test:e2e`, `test:e2e:p0`, `test:e2e:p1`, `test:e2e:report`.
- `.gitignore`: added `/test-results/`, `/playwright-report/`, `/e2e/.auth/` (`*.db` already ignored).

**Verification:** `npm run test:e2e` → **4 passed (2.7s)** — 2 API (browserless) + 2 Chromium UI against the live app on the isolated DB. Git status clean of artifacts.

**Selector note:** app uses accessible roles (`role="list"`/`listitem`, checkbox `aria-label={description}`), not `data-testid`. The real checkbox `<input>` is hidden behind a styled indicator; toggle via the whole-row `<label>` (click the description), not `checkbox.check()`.

## Step 04: Docs & Scripts

- **`e2e/README.md`** created — setup, running (local/headed/debug/UI/project-scoped), architecture (fixtures/factories/two-project split), best practices (API-first, role selectors, label-toggle, tags, no hard waits, network-monitor opt-out), isolation, CI-integration note (deferred to Story 3.4), KB references.
- **Scripts** already added in Step 03: `test:e2e`, `test:e2e:p0`, `test:e2e:p1`, `test:e2e:report`.

## Step 05: Validate & Summary

**Checklist result:** PASS. Verified end-to-end — `npx tsc -p e2e/tsconfig.json` clean; `npm run test:e2e` → 4 passed (3.0s); artifacts (trace/screenshot/video/HTML/JUnit) generated on the earlier failure; git status clean of artifacts and DB files.

**Intentional deviations from the generic checklist (justified for this project):**
- **Structure:** harness at repo root (`playwright.config.ts` + `e2e/`) instead of `tests/` — it's a monorepo-wide cross-stack harness distinct from the per-app Vitest suites. The key `support/` pattern is honored.
- **Selectors:** accessible roles (`getByRole`/`getByPlaceholder`), NOT `data-testid` — the app exposes no test ids and is built on its a11y contract; role selectors are the correct and more robust choice here.
- **Helpers dir:** seeding lives in the `seedTodos` fixture (ui-fixtures) rather than a separate `support/helpers/` dir — right-sized for a 4-endpoint API.
- **`.env.example`:** single local env (`BASE_URL` + `E2E_DATABASE_PATH`), no `TEST_ENV` config map — no staging/prod environments in this MVP.

**Knowledge fragments applied:** overview, api-request, fixtures-composition, intercept-network-call, network-error-monitor, data-factories, playwright-config.

**Not done here (owned by later Story 3.4 work, per deferred-work.md):**
- CI `e2e` job in `.github/workflows/ci.yml` (+ `playwright install --with-deps chromium`, failure-artifact upload).
- The full committed E2E suite (roving-tabindex, delete arm→confirm→revert + 5s auto-revert + concurrent arm/submit).
- Story 3.3 emulation projects (forced-colors / reduced-motion / 200%-zoom) — extension point stubbed in `playwright.config.ts`.
- `@axe-core/playwright` a11y scan wiring (NFR3-E2E-002).
