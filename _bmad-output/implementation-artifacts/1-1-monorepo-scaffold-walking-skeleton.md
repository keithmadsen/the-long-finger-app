# Story 1.1: Monorepo scaffold & walking skeleton

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer on the team,
I want a workspace monorepo with one thin vertical slice wired through every layer,
so that the architecture's wiring (DI, dev proxy, SQLite connection, build, CI) is proven correct before any feature is built on it.

## Acceptance Criteria

1. **Given** a clean checkout, **When** I run the documented install and dev commands, **Then** `apps/web` (Vite `react-ts`) and `apps/api` (Fastify) both start **And** the Vite dev server proxies `/todos` and `/health` to the Fastify process. [Source: epics.md#Story-1.1]
2. **Given** the api is running, **When** I request `GET /health`, **Then** it returns 200 with a liveness payload. [Source: epics.md#Story-1.1; architecture.md#API-&-Communication-Patterns]
3. **Given** the api is running, **When** I request `GET /todos`, **Then** it returns 200 with `[]` read from a real on-disk SQLite file (not in-memory) via a repository constructed through the awilix cradle. [Source: epics.md#Story-1.1]
4. **Given** the web app is open in a browser, **When** the page renders, **Then** it fetches `GET /todos` and displays the (empty) result — confirming the full client → proxy → Fastify → repository → SQLite → client round-trip. [Source: epics.md#Story-1.1]
5. **Given** a pull request, **When** CI runs, **Then** it executes type-check and the Vitest unit + integration project wiring and blocks merge on failure. [Source: epics.md#Story-1.1; architecture.md#Infrastructure-&-Deployment]
6. **Given** the workspace, **When** inspected, **Then** it matches AR-1/AR-10 (`apps/web`, `apps/api` with `routes/handlers/services/domains/repositories`, `packages/contracts`, `tsconfig.base.json`, root workspaces manifest) **And** contains no feature code beyond this skeleton slice. [Source: epics.md#Story-1.1, #AR-1, #AR-10]
7. **Given** the repository is constructed with an injectable database-file path, **When** the integration test supplies a temp-dir path, **Then** it uses that file without swapping the repository implementation. *(Architectural AC carried forward from Note A.4 — proving it here is what makes the later FR-9 durability test honest.)* [Source: epics.md#Notes A.4]

## Tasks / Subtasks

- [x] **Task 1 — Monorepo root scaffold (AC: 1, 6)**
  - [x] Scaffold **in the existing repo root** (`the-long-finger-app/`). Do NOT run the literal `mkdir the-long-finger && cd` from the architecture's init command — that command assumes an empty directory; we are already inside the project repo alongside `docs/`, `_bmad/`, `_bmad-output/`.
  - [x] Root `package.json` with `"private": true` and `"workspaces": ["apps/*", "packages/*"]`; add an `"engines": { "node": ">=24" }` field (Node 24 Active LTS).
  - [x] `tsconfig.base.json` with shared strict compiler options (`strict: true`, `moduleResolution` aligned with the bundler/node setups), extended by each workspace's `tsconfig.json`.
  - [x] Extend the existing `.gitignore` (already tracked, currently modified) to cover `node_modules/`, `dist/`, build output, `*.db`/`*.db-wal`/`*.db-shm`, and `.env` (keep `.env.example` tracked). Do not clobber existing BMad entries.
  - [x] `.dockerignore` (node_modules, build artifacts, `_bmad*`, `docs`, `.git`) — file present for the later Docker story; minimal is fine.
  - [x] `.env.example` documenting `PORT` and `DATABASE_PATH`. [Source: architecture.md#Infrastructure-&-Deployment; epics.md#AR-7]
  - [x] `README.md` with the documented install + dev commands (root `npm install`, how to start api + web, what `proxy` does). AC 1 hinges on these commands being accurate.
- [x] **Task 2 — `packages/contracts` workspace stub (AC: 6)**
  - [x] `packages/contracts/package.json` (`"name": "@tlf/contracts"`), `tsconfig.json` extending the base, `src/index.ts`.
  - [x] Stub only — a placeholder export so the package builds and is importable. **The full TypeBox schemas (`todoSchema`, `createTodoBody`, `patchTodoBody`, `errorEnvelope`) are Story 1.2's job — do NOT author them here** (Note B.9: skeleton is "one endpoint, one rendered value… and nothing else"). Epics.md's "complete `@tlf/contracts` surface up front" (Note A.3) means *up front in Epic 1* — it is realized by Story 1.2's AC, not this story; 1.1 ships only the buildable placeholder so the workspace wiring is provable. [Source: epics.md#Notes A.3, B.9]
- [x] **Task 3 — `apps/api` Fastify clean-arch skeleton (AC: 2, 3, 7)**
  - [x] `npm init` the workspace; install runtime deps `fastify@^5`, `@fastify/awilix`, `awilix`, `better-sqlite3@^12`; dev deps `typescript`, `@types/node`, `@types/better-sqlite3`, `vitest`, `tsx`. [Source: architecture.md#Starter-Template-Evaluation; epics.md#AR-2]
  - [x] Create the clean-arch directory layout so AC 6 passes: `src/{index.ts,server.ts}`, `src/plugins/awilix.ts`, `src/routes/{todos.route.ts,health.route.ts}`, `src/handlers/`, `src/services/`, `src/domains/`, `src/repositories/todo.repository.ts`, `src/db/{connection.ts,schema.ts}`, `src/types/cradle.ts`. Empty layer dirs that hold no skeleton code still get a `.gitkeep` so the structure is inspectable. [Source: architecture.md#Complete-Project-Directory-Structure]
  - [x] `db/connection.ts` — open a `better-sqlite3` connection at `DATABASE_PATH` (real on-disk file). Minimal is fine for the skeleton; **WAL + the full pragma set are refined in Story 1.2.**
  - [x] `db/schema.ts` — run a **minimal** `CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY)` at startup so the skeleton `SELECT` succeeds against a fresh file. *(Resolves implementation-readiness minor item #2: the skeleton reads SQLite before the schema story. The full column set / WAL / pragmas land in Story 1.2, which must explicitly handle transition from this id-only skeleton table because SQLite will not add missing columns through a later `CREATE TABLE IF NOT EXISTS` statement.)* [Source: implementation-readiness-report-2026-06-15.md#item-2; architecture.md#Data-Architecture]
  - [x] `repositories/todo.repository.ts` — factory function `todoRepository({ db })` (named for output, **no `create` prefix**) exposing `listTodos()` that runs `SELECT * FROM todos` and returns the rows. For the skeleton this returns `[]`; the snake↔camel mapper + canonical-order query are Story 1.2. [Source: architecture.md#Naming-Patterns, #Pattern-Examples]
  - [x] `plugins/awilix.ts` — register the cradle via `@fastify/awilix`: register the db connection and `todoRepository` as factories. The DB-file path must be **injectable** (read from config/env, overridable per-construction) so a test can point at a temp file **without swapping the repository implementation** (AC 7, Note A.4).
  - [x] `types/cradle.ts` — declare the `Dependencies` (Awilix Cradle) type.
  - [x] `routes/health.route.ts` — `GET /health` → 200 liveness payload (e.g. `{ status: 'ok' }`).
  - [x] `routes/todos.route.ts` — `GET /todos` → resolve `todoRepository` from the cradle and return `listTodos()` as JSON (`200 []`). Route stays thin. POST/PATCH/DELETE are NOT in scope.
  - [x] `server.ts` — `buildServer()` that registers the awilix plugin + routes and is **reused by tests** (do not bind `listen()` inside it). `index.ts` — entrypoint that calls `buildServer()` and listens on `PORT`.
  - [x] Enable Fastify's built-in **pino** logger with a per-request id and per-request latency from the first endpoint — logging exists from the first endpoint, and this story builds it. This is **logging only, not a CI gate**: the NFR-1 latency *assertion* lands on the POST path in Story 1.7, and k6 sign-off is Epic 3. Log request id + latency; never log full payloads. [Source: epics.md#AR-9, #Notes 15; architecture.md#Infrastructure-&-Deployment]
  - [x] Do NOT add `plugins/swagger.ts`, `plugins/static.ts`, `plugins/error-handler.ts`, or any create/toggle/delete handler — those belong to later stories (Swagger/error-envelope → API story 1.2/contracts; `@fastify/static` → Story 1.11). [Source: epics.md#Notes B.9, B.13]
- [x] **Task 4 — `apps/web` Vite react-ts skeleton (AC: 1, 4)**
  - [x] Scaffold via `npm create vite@latest apps/web -- --template react-ts`. [Source: architecture.md#Starter-Template-Evaluation]
  - [x] **Strip the template demo** (counter state, logos, demo CSS) so AC 6 "no feature code" holds. `App.tsx` should do exactly one thing: `fetch('/todos')` on mount and render the (empty) result — a plain `fetch` is correct here. **Do NOT add TanStack Query, hooks, primitives, recipes, or design tokens** — those are Stories 1.3–1.7. [Source: epics.md#Notes B.9; architecture.md#Frontend-Architecture]
  - [x] `vite.config.ts` — configure `server.proxy` so `/todos` and `/health` proxy to the Fastify process (e.g. `http://localhost:${PORT}`). This is the dev-origin bridge in AC 1. [Source: architecture.md#Integration-Points-&-Data-Flow]
  - [x] `tsconfig.json` extends `tsconfig.base.json`.
- [x] **Task 5 — Test wiring: Vitest unit + integration projects (AC: 3, 5, 7)**
  - [x] `apps/api/vitest.config.ts` — define the **two projects** (`unit`, `integration`) so CI runs them independently. Unit = co-located `src/**/*.test.ts`; integration = `test/integration/**/*.test.ts`. Use whichever projects API the installed (June-2026-verified) Vitest documents — `projects: ['unit', 'integration']` is the intent, not a guaranteed literal API shape. [Source: architecture.md#Structure-Patterns; epics.md#AR-10]
  - [x] One **integration** test (`test/integration/todos.routes.test.ts` + `test/integration/helpers/build-test-app.ts`): build the app against a **real temp-file SQLite path** (use a temp dir; assert it is not in-memory), call `GET /todos` → `200 []` and `GET /health` → `200`. This proves AC 3 + AC 7 (injectable path). [Source: architecture.md#Structure-Patterns; epics.md#Notes A.4]
  - [x] One trivial **unit** test (co-located, e.g. `src/repositories/todo.repository.test.ts`) so the `unit` project is real and CI exercises both projects.
  - [x] Web test frameworks (Vitest for components, Playwright for E2E) are **out of scope here** — they arrive with the first web-component story (tokens/primitives) and the list view. Do not scaffold `apps/web/vitest.config.ts` / `playwright.config.ts` in this story.
  - [x] The **first-interactive-element CI tripwire (Note A.8)** is NOT asserted here — there is no capture input yet. It is introduced in Story 1.7. "From Epic 1" in A.8 means the invariant begins once the capture element exists, not in this skeleton. [Source: epics.md#Notes A.8]
- [x] **Task 6 — CI pipeline (AC: 5)**
  - [x] `.github/workflows/ci.yml` on pull requests: install, **type-check** (`tsc --noEmit` across workspaces), `vitest` **unit** project, `vitest` **integration** project. Each step must fail the build (block merge) on failure. [Source: architecture.md#Infrastructure-&-Deployment; epics.md#AR-9]
  - [x] Do NOT add Playwright, contrast-regression, axe-core, or bundle-size gates yet — those are sequenced after the first `apps/web` build/UI exists (Notes C.14). Keep CI to typecheck + the two Vitest projects. [Source: epics.md#Notes C.14]
- [x] **Task 7 — Verify the full round-trip (AC: 1–4)**
  - [x] Run the documented dev commands; confirm both processes start, the proxy works, `GET /health` and `GET /todos` return as specified, and the browser renders the empty result. Confirm data is read from a real on-disk file (delete the file → table re-created empty → still `200 []`).

### Review Findings

- [x] [Review][Patch] Documented `.env` setup is not honored by the API or Vite proxy [README.md:27]
- [x] [Review][Patch] API startup does not validate invalid or empty environment values [apps/api/src/index.ts:4]
- [x] [Review][Patch] Schema comments/story notes incorrectly imply `CREATE TABLE IF NOT EXISTS` can add future columns [apps/api/src/db/schema.ts:5]
- [x] [Review][Patch] Web workspace root `tsconfig.json` does not extend the shared base config [apps/web/tsconfig.json:1]
- [x] [Review][Patch] Web app trusts `/todos` JSON shape without checking it is an array [apps/web/src/App.tsx:20]
- [x] [Review][Patch] `apps/web/README.md` still contains generic Vite template guidance [apps/web/README.md:1]

## Dev Notes

### Scope guardrail (read first)
This is a **walking skeleton**: one thin vertical slice (`client → Vite proxy → Fastify → awilix cradle → repository → on-disk SQLite → back`) plus the build/test/CI plumbing — and **nothing else**. Its entire purpose is to debug DI scoping, the dev proxy, the SQLite connection, the build, and CI **in isolation**, before any feature lands on top (epics.md Note B.9). AC 6 explicitly forbids feature code beyond the slice. The biggest failure mode for this story is an agent over-building — pulling in TanStack Query, the design-token system, the four primitives, the full contract schemas, Swagger, static-serving, or the Docker image. **All of those are later stories.** When in doubt, do less.

### Tech stack & pinned versions (architecture-authoritative, verified June 2026)
The architecture doc verified these in June 2026 — newer than the training cutoff, so treat the doc as the source of truth; do not "upgrade" or substitute.
- **Runtime:** Node.js 24 Active LTS (also the eventual Docker base). [Source: epics.md#AR-2; architecture.md#Starter-Template-Evaluation]
- **Backend:** Fastify **v5** (latest verified 5.8.5), `@fastify/awilix` + `awilix` for cradle DI, `better-sqlite3` **v12+**. TypeScript via `tsx` for `tsx watch` dev. [Source: architecture.md#Starter-Template-Evaluation]
- **Frontend:** React + Vite (official `react-ts` template). TanStack Query v5 and `uuid` v7 are listed deps for `apps/web` in the full architecture but are **not used in this story** — add them when the consuming story (1.6 list / 1.7 create) needs them, to keep the skeleton bundle honest. [Source: architecture.md#Frontend-Architecture]
- **Testing:** Vitest (unit/integration) now; Playwright later. [Source: architecture.md#Starter-Template-Evaluation]

### Backend layer rules (clean-architecture skill is AUTHORITATIVE)
Before writing any backend code, consult the `clean-architecture` skill — the architecture doc names it the authoritative backend pattern (architecture.md#Enforcement-Guidelines; Implementation Handoff). It is installed at `clean-architecture:clean-architecture` (nearform-skills plugin). Key rules that already bite in the skeleton:
- **Factory functions are named for what they produce — no `create` prefix.** `todoRepository`, not `createTodoRepository`. [Source: architecture.md#Naming-Patterns]
- **Layer direction is strictly inward:** `routes → handlers → (services) → domains / repositories`. Repositories do data access only; domains hold no I/O; handlers stay thin. The skeleton's `GET /todos` is a read, so a thin route resolving the repository from the cradle is acceptable — but keep the layer dirs present and don't put logic in the route. [Source: architecture.md#Architectural-Boundaries]
- **The repository is the ONLY module that imports `better-sqlite3` or knows snake_case.** (Mapper logic itself is Story 1.2; just don't leak DB knowledge upward now.) [Source: architecture.md#Architectural-Boundaries]
- **Backend file naming:** kebab-case with role suffix — `todo.repository.ts`, `health.route.ts`, `todos.route.ts`. Frontend components PascalCase. [Source: architecture.md#Naming-Patterns; epics.md#AR-10]

### Project structure (the skeleton subset of the full tree)
Build the directory shape from architecture.md#Complete-Project-Directory-Structure, but only populate the skeleton slice. Present-but-stubbed: `packages/contracts/src/index.ts`, `apps/api/src/{handlers,services,domains}` (`.gitkeep`). Real in this story: root manifest + `tsconfig.base.json`, `apps/web` (proxy + minimal App), `apps/api` (`server.ts`/`index.ts`/`routes`/`plugins/awilix.ts`/`repositories/todo.repository.ts`/`db/`/`types/cradle.ts`), the two Vitest projects, `ci.yml`. Explicitly deferred: `plugins/{swagger,static,error-handler}.ts`, all command handlers, `apps/web` hooks/primitives/recipes/styles, `playwright.config.ts`, `Dockerfile`.

### The SQLite-before-schema seam (resolved here)
Story 1.2 owns the real `todos` schema (full columns, WAL, pragmas, canonical-order query, mapper). But this skeleton must `SELECT` from a real file to satisfy AC 3. The implementation-readiness report flagged this ordering (minor item #2). **Resolution adopted:** the skeleton runs a minimal `CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY)` at startup. Story 1.2 must explicitly handle transition from this id-only table because SQLite will not add missing columns through a later `CREATE TABLE IF NOT EXISTS` statement. Do not add `description`/`completed`/timestamps now; that is 1.2's contract work. [Source: implementation-readiness-report-2026-06-15.md#item-2]

### Injectable DB path (AC 7) — why it matters now
Note A.4 makes the injectable DB-file path an architectural AC of the persistence work, and the cheapest honest place to prove it is here. The awilix registration must read the path from config/env and allow a test to construct the repository against a temp-dir file **without** swapping the implementation (no in-memory fake). This is what lets the later FR-9 durability test (Story 1.2: stop process → restart → data persists) be trustworthy. [Source: epics.md#Notes A.4; architecture.md#Data-Architecture]

### Dev vs. prod origin
**Dev:** two processes — Fastify (`tsx watch`, on `PORT`) and the Vite dev server, bridged by Vite's `server.proxy` for `/todos` and `/health` (one logical origin). **Prod:** later, one container where Fastify serves the built static frontend via `@fastify/static` (Story 1.11). This story only wires the **dev** proxy. **No CORS config is needed** — Vite's `server.proxy` makes dev requests same-origin, so do NOT add `@fastify/cors`. AR-8's dev-only CORS only applies to a non-proxied cross-origin dev setup, which this story does not use. [Source: architecture.md#Integration-Points-&-Data-Flow, #Infrastructure-&-Deployment; epics.md#AR-8]

### Testing standards summary
- Unit tests co-located as `src/**/*.test.ts`; integration tests in `apps/api/test/integration/**/*.test.ts`; a Vitest workspace exposes separate `unit` and `integration` projects run independently by CI. [Source: architecture.md#Structure-Patterns]
- The integration test builds the app via the reusable `buildServer()` (don't `listen()`), points it at a real temp-file SQLite path, and asserts `GET /todos → 200 []` and `GET /health → 200`. This simultaneously proves the cradle wiring (AC 3) and the injectable path (AC 7).
- CI gate for this story = typecheck + both Vitest projects only. Accessibility/contrast/bundle/Playwright gates are deliberately deferred (Notes C.14).

### Project Structure Notes
- **Scaffold in place.** The repo already exists (`docs/`, `_bmad/`, `_bmad-output/`, a tracked `.gitignore`). Adapt the architecture's init command: skip the `mkdir the-long-finger && cd`, target `npm create vite@latest apps/web`, and **extend** rather than overwrite `.gitignore`.
- Root `package.json` `"name"` can be `the-long-finger` (project name) even though the working directory is `the-long-finger-app` — cosmetic, not load-bearing.
- No conflicts detected between the architecture's directory tree and the existing repo; BMad folders (`_bmad`, `_bmad-output`) sit alongside `apps/`/`packages/` and should be added to `.dockerignore`.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.1] — story statement, the 6 base ACs.
- [Source: _bmad-output/planning-artifacts/epics.md#Notes-carried-into-story-creation] — A.3 (contracts surface), A.4 (injectable DB path), B.9 (skeleton is its own first story, nothing else), B.13 (Docker is last in Epic 1), C.14 (defer gates until a web build exists).
- [Source: _bmad-output/planning-artifacts/epics.md#AR-1] / [#AR-10] — workspace + code-organization/testing-layout requirements (AC 6).
- [Source: _bmad-output/planning-artifacts/architecture.md#Starter-Template-Evaluation] — initialization command, selected starter, pinned versions.
- [Source: _bmad-output/planning-artifacts/architecture.md#Core-Architectural-Decisions] — Data Architecture (ID/schema), API patterns (endpoints/health), Frontend Architecture (plain fetch acceptable here), Infrastructure & Deployment (env vars, CI).
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation-Patterns-&-Consistency-Rules] — naming, structure, test placement, layer boundaries.
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete-Project-Directory-Structure] — the full tree this story scaffolds a subset of.
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-06-15.md#item-2] — SQLite-before-schema ordering resolution.
- **Authoritative backend pattern:** `clean-architecture` skill (`clean-architecture:clean-architecture`, nearform-skills plugin) — consult before writing handlers/services/domains/repositories.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8, 1M context)

### Debug Log References

- Integration test initially failed on `existsSync(databasePath)`: awilix singletons are **lazy**, so the `db` connection had not opened the temp file at the time the first assertion ran. Resolved by eagerly resolving `app.diContainer.cradle.db` in `build-test-app.ts` after `app.ready()` — which also makes the AC-7 proof stronger (the injected path is actually opened).
- Local toolchain runs Node v22.20.0 while `engines.node` is set to `>=24` per the story. The field is advisory (npm emits `EBADENGINE` warning only); install, typecheck, all tests, and the live round-trip all pass on Node 22. CI pins Node 24 via `actions/setup-node`.

### Completion Notes List

- **Walking skeleton complete and verified end-to-end.** All 7 ACs satisfied; scope guardrail respected — no feature code beyond the single read slice.
- **Round-trip proven live:** `GET /health` → `200 {"status":"ok"}`, `GET /todos` → `200 []` both directly (port 3001) and through the Vite dev proxy (port 5173). The DB file is a real on-disk `SQLite 3.x` file; deleting it and restarting re-creates the table via `CREATE TABLE IF NOT EXISTS` and still returns `200 []` (AC 1–4).
- **Versions resolved to the architecture's June-2026 set:** fastify 5.8.5, @fastify/awilix 7, awilix 12.1.1, better-sqlite3 12.11.1, vitest 3.2.6, Vite 8 / React 19 (create-vite template).
- **AC 7 (injectable DB path):** the integration test builds the production app against a temp-dir SQLite file via `buildServer({ databasePath })` — no implementation swap, no in-memory fake. `databasePath` is an awilix value; the `db` factory reads it from the cradle.
- **Clean-architecture rules honored:** `todoRepository` factory (no `create` prefix), repository is the only module importing `better-sqlite3`, thin routes resolve from the cradle, empty `handlers/`/`services/`/`domains/` carry `.gitkeep` so the layer structure is inspectable (AC 6).
- **Logging (AR-9):** Fastify/pino logs per-request `reqId` + `responseTime` from the first endpoint; no payloads logged. This is logging only — not a CI gate (latency assertion lands in Story 1.7).
- **CI gate set:** `.github/workflows/ci.yml` runs typecheck + Vitest `unit` + Vitest `integration` on PRs (Node 24, `npm ci`). Playwright/axe/contrast/bundle gates deliberately deferred (Notes C.14).
- **Deliberately NOT built (later stories):** TypeBox contract schemas (1.2), WAL/full pragmas/full columns (1.2), TanStack Query / tokens / primitives / recipes (1.3–1.7), Swagger/static/error-handler plugins, command handlers, Dockerfile, web Vitest/Playwright configs.
- **Stack-in-place adaptations:** scaffolded inside the existing repo (no `mkdir && cd`), extended the tracked `.gitignore` rather than clobbering BMad entries, scaffolded web via `npm create vite@latest apps/web -- --template react-ts` then stripped the demo.

### File List

**Root / monorepo**
- `package.json` (new) — private root workspace manifest, `workspaces: [apps/*, packages/*]`, `engines.node >=24`, dev/test/typecheck scripts
- `package-lock.json` (new) — lockfile (required by CI `npm ci`)
- `tsconfig.base.json` (new) — shared strict compiler options
- `.gitignore` (modified) — added node_modules/build/`*.db*`/`.env` (kept BMad entries + `.env.example`)
- `.dockerignore` (new)
- `.env.example` (new) — documents `PORT`, `DATABASE_PATH`
- `README.md` (new) — install + dev + test + CI commands
- `.github/workflows/ci.yml` (new) — typecheck + Vitest unit + integration

**packages/contracts (`@tlf/contracts`)**
- `packages/contracts/package.json` (new)
- `packages/contracts/tsconfig.json` (new)
- `packages/contracts/src/index.ts` (new) — buildable placeholder export only

**apps/api (`@tlf/api`)**
- `apps/api/package.json` (new)
- `apps/api/tsconfig.json` (new)
- `apps/api/vitest.config.ts` (new) — `unit` + `integration` projects
- `apps/api/src/index.ts` (new) — entrypoint, listen on `PORT`
- `apps/api/src/server.ts` (new) — `buildServer()` (reused by tests, no `listen()`)
- `apps/api/src/plugins/awilix.ts` (new) — cradle wiring, injectable DB path
- `apps/api/src/routes/health.route.ts` (new)
- `apps/api/src/routes/todos.route.ts` (new)
- `apps/api/src/repositories/todo.repository.ts` (new) — `todoRepository` factory, `listTodos()`
- `apps/api/src/repositories/todo.repository.test.ts` (new) — unit test
- `apps/api/src/db/connection.ts` (new) — open on-disk SQLite at injected path
- `apps/api/src/db/schema.ts` (new) — `CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY)`
- `apps/api/src/types/cradle.ts` (new) — `Dependencies` cradle type + `@fastify/awilix` augmentation
- `apps/api/src/handlers/.gitkeep`, `apps/api/src/services/.gitkeep`, `apps/api/src/domains/.gitkeep` (new) — empty layer dirs
- `apps/api/test/integration/todos.routes.test.ts` (new) — round-trip against real temp-file SQLite
- `apps/api/test/integration/helpers/build-test-app.ts` (new)

**apps/web (`@tlf/web`)**
- `apps/web/package.json` (modified) — renamed `@tlf/web`, added `typecheck` script
- `apps/web/vite.config.ts` (modified) — `server.proxy` for `/todos` + `/health`
- `apps/web/src/App.tsx` (modified) — stripped demo; fetches `/todos` on mount, renders empty result
- `apps/web/src/index.css` (modified) — minimal system-font reset
- `apps/web/index.html` (modified) — title "The Long Finger"
- `apps/web/tsconfig.app.json`, `apps/web/tsconfig.node.json` (modified) — extend `tsconfig.base.json`
- `apps/web/{tsconfig.json,main.tsx,eslint.config.js,README.md,public/favicon.svg,.gitignore}` (new, from create-vite template)
- Removed demo assets: `src/App.css`, `src/assets/{react.svg,vite.svg,hero.png}`, `public/icons.svg`

## Change Log

| Date       | Change                                                                 |
|------------|------------------------------------------------------------------------|
| 2026-06-16 | Story 1.1 implemented — monorepo scaffold & walking skeleton. All 7 ACs verified; status → review. |
