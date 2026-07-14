# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"The Long Finger" — a minimal to-do app built as an npm-workspaces monorepo:

- `apps/api` — Fastify 5 backend, clean-architecture layering, better-sqlite3 behind a repository, DI via an awilix cradle.
- `apps/web` — React 19 + Vite frontend, TanStack Query, CSS Modules + design tokens.
- `packages/contracts` — `@tlf/contracts`, shared TypeBox schemas. Consumed as **TypeScript source** (no build step); both apps compile the `.ts` directly.
- `e2e/` + `playwright.config.ts` (repo root) — Playwright E2E/API harness.

## Node version

**Node 24 is required** (`engines` field, and better-sqlite3's ABI is compiled against it). If the shell defaults to an older Node, run `nvm use 24` before installing or running API tests — they fail under Node 22 with a native-module ABI error.

## Commands

```bash
npm install                 # once, from repo root — installs and links all workspaces
npm run dev                 # API (tsx watch, :3001) + web (Vite, :5173) in parallel
npm run dev:api             # API only
npm run dev:web             # web only

npm run typecheck           # tsc --noEmit, all workspaces
npm test                    # all workspace Vitest suites
npm run test:unit           # apps/api Vitest "unit" project (co-located src/**/*.test.ts)
npm run test:integration    # apps/api Vitest "integration" project (real temp-file SQLite)
npm run test --workspace apps/web   # web component tests (includes axe-core a11y gate)

# Single test file:
npx vitest run src/repositories/todo.repository.test.ts --root apps/api
npx vitest run src/hooks/useTodos.test.tsx --root apps/web

# E2E (boots the app via webServer; attaches to an existing `npm run dev` locally)
npm run test:e2e            # full suite
npm run test:e2e:p0         # --grep @p0
npx playwright test e2e/tests/ui/capture-and-complete.smoke.spec.ts --debug
npx playwright test --project=api       # browserless API specs only

# CSS/quality gates (all enforced in CI)
npm run lint:css                        # stylelint token-name lint (no literal colors / off-scale px)
npm run lint:css:selftest               # guards the lint gate itself
npm run contrast:check --workspace apps/web   # token contrast regression (8 pairs incl. focus ring ≥3:1)
npm run size:check --workspace apps/web       # absolute-ceiling gzipped bundle-size gate (needs a build first)

# Coverage-threshold gates (delete-path scoped — Story 3.4)
npm run test:coverage --workspace apps/web              # web tests + >90% thresholds on useArmedDelete/useDeleteTodo
npm run test:integration:coverage --workspace apps/api  # integration + >80% thresholds on todos route/repository

# k6 latency (script: e2e/load/post-todos-signoff.js; sign-off record: docs/k6-latency-signoff.md)
docker run --rm -i -e BASE_URL=http://host.docker.internal:3001 grafana/k6 run - < e2e/load/post-todos-signoff.js
```

CI (`.github/workflows/ci.yml`) runs three parallel merge-blocking jobs: `verify` (typecheck → CSS lint + selftest → web tests + delete-path coverage → contrast → web build → size ceiling → API unit → API integration + coverage), `e2e` (full unfiltered Playwright suite — includes the real-browser axe gate and the WCAG emulation gates), and `k6-smoke` (loosened-threshold POST-latency tripwire against the production container). `docs/wcag-conformance-matrix.md` maps every enumerated WCAG 2.2 AA criterion to its gate.

## Architecture

### API — clean architecture over an awilix cradle

Request flow: `route → (handler/service/domain when warranted) → repository → SQLite`.

- `src/server.ts` exports `buildServer({ databasePath, logger, staticRoot })` — builds the app but never calls `listen()`. `src/index.ts` owns listening; integration tests reuse the builder with a temp-file DB. Keep new wiring in `buildServer` so tests inherit it.
- **The cradle** (`src/types/cradle.ts`) declares every injectable dependency; `plugins/awilix.ts` registers them. Routes resolve dependencies via `request.diScope.cradle` — never import the DB or repository directly.
- **The repository** (`src/repositories/todo.repository.ts`) is the *only* module that knows SQL, snake_case column names, or the 0/1 `completed` encoding. Its `toDomain` mapper is the single casing crossover. Factories are named for what they produce (`todoRepository`, no `create` prefix).
- **Routes stay thin.** Route schemas `$ref` the shared contracts (registered by `$id` in `plugins/swagger.ts`), enforce the contract at the boundary, and feed OpenAPI (`/docs`). A route's async fn *is* the handler when the orchestration is purely transport-level; extract a handler/service factory only when a real domain decision appears (see the clean-architecture skill).
- **Errors**: `plugins/error-handler.ts` emits the uniform envelope `{ error: { code, message, details? } }` on every non-2xx. 5xx bodies never leak messages or stacks (real error goes to pino). Domain 404s are decided in handlers, not the plugin.
- Ajv runs with `removeAdditional: false`: closed body schemas (e.g. `PatchTodoBody`) reject unknown fields with 400 instead of silently stripping.
- Registration order matters in `buildServer`: helmet → cradle → swagger (collects schemas via onRoute) → error handler → routes → static (prod only, last so API routes win).

### Contract enforcement on both sides

`@tlf/contracts` TypeBox schemas are the single source of truth. The server validates/serializes against them; the web client runtime-validates every parsed 2xx body via `apps/web/src/api/validateContract.ts` (`Check` from `@sinclair/typebox/value` — named import, not the `Value` facade, to keep the bundle small). Never hand-roll a shape guard that duplicates a contract.

### Web

- One TanStack Query hook per operation in `src/hooks/` (`useTodos`, `useCreateTodo`, `useToggleTodo`, `useDeleteTodo`, …); fetch functions live in `src/api/todos.ts`. Todo `id`s are client-generated UUIDv7 — POST is idempotent on id (existing id → 200 with the existing Todo), which makes retries safe.
- List order is owned by the API (`incomplete first, newest-updated first`); the frontend must not re-sort.
- UI primitives (`Button`, `TextInput`, `Checkbox`, `LiveRegion`) live in `src/components/primitives/` with CSS Modules. All styling flows through design tokens in `src/styles/tokens.css` — the stylelint gate rejects literal colors and off-scale px values.

### Single origin, two ways

- **Dev**: Vite proxies `/todos` and `/health` to Fastify (`apps/web/vite.config.ts`), so the browser fetches relative URLs with no CORS. `PORT` (default 3001) must match on both sides — set env vars in the shell; dev scripts do **not** load `.env` files.
- **Prod**: one Docker image (root `Dockerfile`) — Fastify serves the built SPA via `@fastify/static` alongside the API. No proxy, no CORS anywhere.

### E2E harness

Two Playwright projects in one root config: `api` (`*.api.spec.ts`, no browser) and `chromium` (everything else). Import `test`/`expect` from `e2e/support/api-fixtures.ts` or `e2e/support/ui-fixtures.ts` to match; test data comes from `e2e/support/factories/todo-factory.ts`. Tag tests `@p0`/`@p1` for the priority-filtered runs. Unit/integration tests stay in their apps under Vitest — this harness is only for cross-stack E2E and API/service tests.

## BMAD workflow

The project is developed story-by-story with the BMAD method. `docs/prd.md` is the PRD; `_bmad-output/` holds planning artifacts, per-story implementation files (`_bmad-output/implementation-artifacts/*.md`), retros, `deferred-work.md`, and `sprint-status.yaml` (current epic/story state). The `bmad-*` skills in `.claude/skills/` drive story creation, dev, review, and retros. When implementing, check the current story file for acceptance criteria — code comments frequently cite them (e.g. "AC 7", "Story 1.8").
