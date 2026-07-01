---
baseline_commit: 1ee65e00ae5e20bf6d29107e32c97ed731441182
---

# Story 1.11: Thin container deploy

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer on the team,
I want the app packaged as a single runnable container that serves the built frontend and persists data to a file,
so that the usable list can actually run outside a dev laptop and container-persistence issues surface early.

## Acceptance Criteria

1. **Multi-stage image, one origin.** Given the repo, when `docker build -t the-long-finger .` runs from the repo root, then a **multi-stage** `Dockerfile` (a) builds `apps/web` (Vite → `apps/web/dist`) and prepares `apps/api`, and (b) in the final stage runs Fastify serving the built static frontend via `@fastify/static` so the SPA and the four API routes are reachable from **one origin / one port**. The build must succeed with no host `node_modules` copied in (native deps built/installed inside the image for the container arch). [Source: epics.md#Story-1.11 (line 343); architecture.md#Infrastructure-&-Deployment (line 207); AR-7 (line 54)]

2. **Env-var config, SQLite at `DATABASE_PATH`.** Given the container runs, when configured, then it reads `PORT` and `DATABASE_PATH` from environment variables (the existing `index.ts` readers — do NOT re-implement) and writes the SQLite file at `DATABASE_PATH`. The image ships sane container defaults (`PORT`, `DATABASE_PATH` pointing at a mountable directory, e.g. `/data/todos.db`) and `index.ts` binds `0.0.0.0` (already does). [Source: epics.md#Story-1.11 (line 344); architecture.md#Config (line 208); apps/api/src/index.ts lines 3-20]

3. **End-to-end against the packaged backend.** Given the running container, when I open `http://localhost:<PORT>` in a browser, then I can **view, add, and complete/uncomplete** tasks end-to-end against the packaged backend — the web app's relative `fetch('/todos')` / `fetch('/health')` calls resolve same-origin (no Vite proxy, no CORS in prod). `GET /` returns the built `index.html`; hashed `/assets/*` load; `GET /todos`, `POST /todos`, `PATCH /todos/:id` still return JSON (the static layer must NOT shadow the API routes or swallow API 404s — they keep returning the uniform error envelope). [Source: epics.md#Story-1.11 (line 345); apps/web/src/api/todos.ts (relative paths); architecture.md#Integration-Points (line 442)]

4. **Baseline hardening at the API layer.** Given the API, when requests are served, then `@fastify/helmet` baseline security headers and an explicit body-size limit are applied. **CSP is left relaxed/disabled for v1** (hardened static-serving headers — strict CSP, COEP/CORP tuning — are explicitly deferred to Epic 3 Story 3.5); registering helmet's default CSP would risk breaking the served SPA. [Source: epics.md#Story-1.11 (line 346); architecture.md AR-8 (line 55); #Hardening-lightweight (line 177)]

5. **Persistence across restart.** Given the container is stopped and restarted with the **same mounted path/volume**, when it comes back up, then previously created tasks are still present (FR-9). The volume mounts the directory holding `DATABASE_PATH`; `db/connection.ts` already `mkdir`s the parent dir, so a fresh volume initialises cleanly and a reused volume retains data (including the `*.db-wal`/`*.db-shm` WAL sidecar files). [Source: epics.md#Story-1.11 (line 347); FR-9 (line 32); architecture.md (line 227, 435); apps/api/src/db/connection.ts line 13]

6. **No regressions.** Given the existing suite, when CI runs under **Node 24**, then `typecheck`, the full Vitest suite (api unit + integration, web), `lint`, `lint:css`, `contrast:check`, and `size:check` all stay green. The integration test harness (`buildServer({ databasePath, logger: false })` with **no** static root) must continue to build the app unchanged — the static plugin is registered **only** when a static root is supplied, so tests never try to serve a non-existent dist directory. [Source: apps/api/test/integration/helpers/build-test-app.ts; 1-10 Gates pattern]

## Tasks / Subtasks

- [x] **API: add `@fastify/helmet` + explicit body limit in `buildServer`** (AC 4, 6) — `apps/api/src/server.ts`, `apps/api/package.json`
  - [x] Add dependency `@fastify/helmet` (Fastify v5-compatible major; pick the version whose peer range includes `fastify@^5` — verify against the installed `fastify` v5 before pinning) to `apps/api/package.json` `dependencies`. Run `npm install` so `package-lock.json` updates.
  - [x] In `buildServer`, register helmet **at the root app** (covers API + static layer) BEFORE the routes: `await app.register(helmet, { contentSecurityPolicy: false })`. Add a comment that CSP/COEP hardening is deferred to Epic 3 Story 3.5 (AC 4). Do NOT enable the default CSP — it can block the bundled SPA.
  - [x] Add an explicit body-size limit on the Fastify factory options: extend the existing `Fastify({ logger, ajv: {...} })` call (server.ts line 31) with `bodyLimit: 64 * 1024` (64 KiB — generous for a ≤200-char todo, bounded vs the 1 MB default). Keep the existing `ajv.customOptions.removeAdditional: false` (load-bearing for Story 1.8 — do not drop it).
  - [x] These two changes apply in tests too (harmless headers + limit); they make AC 4 assertable via an integration test.

- [x] **API: conditional `@fastify/static` plugin** (AC 1, 3, 6) — NEW `apps/api/src/plugins/static.ts`, edits to `server.ts` + `BuildServerOptions`, `apps/api/package.json`
  - [x] Add dependency `@fastify/static` (Fastify v5-compatible major; verify peer range includes `fastify@^5`) to `apps/api/package.json`. `npm install` to refresh the lockfile.
  - [x] Extend `BuildServerOptions` (server.ts lines 8-13) with an OPTIONAL field: `staticRoot?: string` — absolute path to the built web dir. Document it: "When provided, serve the built SPA from this directory; omitted in tests so the API runs headless."
  - [x] Create `plugins/static.ts` exporting `registerStatic(app, { staticRoot })`: `await app.register(fastifyStatic, { root: staticRoot, wildcard: false })`. Use `wildcard: false` (globs the built files at startup and serves them by exact path + `index.html` at `/`) so the static layer does NOT add a `/*` catch-all that could shadow `/todos`, `/health`, `/docs` or swallow API 404s. The app has **no client-side router** (architecture: "no router"), so no SPA deep-link fallback is needed. Mirror the existing plugin style (`registerSwagger`/`registerErrorHandler`, `.js` ESM import extensions, NodeNext).
  - [x] In `buildServer`, register static **only when `staticRoot` is provided**, AFTER swagger + error-handler + the API routes (so the explicit API/docs routes win): `if (staticRoot) { await registerStatic(app, { staticRoot }); }`. Registering after routes also guarantees `GET /` resolves to the SPA index without clobbering `/health` etc.
  - [x] Do NOT register static unconditionally — the integration harness calls `buildServer` with no `staticRoot`; `@fastify/static` throws at registration if `root` is missing/nonexistent, which would break every integration test (AC 6).

- [x] **API: wire the static root in the entrypoint** (AC 1, 3) — `apps/api/src/index.ts`
  - [x] Resolve the web build dir relative to the api source: `const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));` (from `apps/api/src/index.ts` → `apps/web/dist`). Import `fileURLToPath` from `node:url`.
  - [x] Pass it to `buildServer` ONLY when it exists, so a local `npm run start --workspace apps/api` without a web build still boots headless: `const staticRoot = existsSync(webDist) ? webDist : undefined;` (`existsSync` from `node:fs`) then `await buildServer({ databasePath, staticRoot });`. Keep the existing `readPort`/`readDatabasePath` and the `0.0.0.0` listen untouched.

- [x] **Dockerfile: multi-stage build** (AC 1, 2, 3, 5) — NEW `Dockerfile` at repo root
  - [x] **Base image:** `node:24-slim` (Debian/glibc) for BOTH stages — better-sqlite3 v12 ships prebuilt N-API binaries for Node 24 on glibc, so `npm ci` needs no C++ toolchain. (If a prebuilt binary is ever unavailable for the build arch, add `python3 make g++` in the builder stage; do NOT use Alpine/musl, which lacks matching prebuilds.) Same base in both stages so the native `better-sqlite3` binary copied across stages is ABI/arch-compatible.
  - [x] **Stage 1 `builder`:** `WORKDIR /app`. Copy `package.json`, `package-lock.json`, and each workspace's `package.json` (`apps/api/package.json`, `apps/web/package.json`, `packages/contracts/package.json`) first, then `RUN npm ci` (full install — dev deps included, since runtime needs `tsx`/Vite-built output). Then copy the rest of the repo and `RUN npm run build --workspace apps/web` (produces `apps/web/dist`). Rely on `.dockerignore` (already excludes `node_modules`, `dist`, `*.db`, `.git`, `_bmad*`, `.env`) so no host artifacts leak in.
  - [x] **Stage 2 `runner`:** `WORKDIR /app`. Copy from `builder`: `node_modules` (native binary built for the container arch), `package.json`/`package-lock.json`, `packages/contracts` (TS source — consumed directly), `apps/api` (TS source — run via tsx), and `apps/web/dist` (the only web artifact needed). Set `ENV NODE_ENV=production`, `ENV PORT=8080`, `ENV DATABASE_PATH=/data/todos.db`. `EXPOSE 8080`. Declare `VOLUME ["/data"]` for SQLite durability (AC 5). `CMD ["npm","run","start","--workspace","apps/api"]` (= `tsx src/index.ts`) — or equivalently `npx tsx apps/api/src/index.ts`.
  - [x] **Why tsx, not tsc:** `apps/api/tsconfig.json` has `noEmit: true` and `@tlf/contracts` exports `.ts` source (no build step), so there is no compiled `dist/` for the api and a plain `tsc` build would not resolve the contracts package at runtime. Running the existing `start` script (`tsx src/index.ts`) is the consistent, working path — tsx executes the TS source and resolves the workspace contracts. (A future tsc/esbuild bundle that also compiles contracts is an Epic-3 optimisation, NOT this story.)

- [x] **`.env.example` + docs: container run instructions** (AC 2, 5) — `.env.example` (exists), NEW `docs` snippet or `README` section
  - [x] `.env.example` already documents `PORT` and `DATABASE_PATH`; add a brief comment block (or a `## Running the container` section in the root `README.md` if present, else a short `DEPLOY.md`) with the canonical run command, e.g.:
    `docker build -t the-long-finger . && docker run -p 8080:8080 -e PORT=8080 -e DATABASE_PATH=/data/todos.db -v tlf-data:/data the-long-finger`
  - [x] Document the AC 5 manual check: create a task → `docker stop` → `docker start` (same `-v tlf-data:/data`) → task still present.

- [x] **Tests** (AC 3, 4, 6)
  - [x] **Integration (headers + body limit, AC 4):** extend `apps/api/test/integration/` — assert a response carries representative helmet headers (e.g. `x-content-type-options: nosniff`, `x-dns-prefetch-control`) and that an oversized body (> `bodyLimit`) is rejected with 413. Use the existing `buildTestApp()` harness (no `staticRoot`).
  - [x] **Integration (static serving, AC 3) — optional but recommended:** a focused test that calls `buildServer({ databasePath, logger: false, staticRoot: <fixture-or-built-dist> })` and asserts `GET /` returns `200` + `text/html`, that `GET /todos` STILL returns the JSON array (static did not shadow it), and that an unknown API path still returns the uniform error envelope (static `wildcard:false` did not add a catch-all). Prefer a tiny temp fixture dir containing an `index.html` over depending on a prior web build, so the test is hermetic and order-independent. Skip/guard if you point at `apps/web/dist` (would require building web first).
  - [x] **Do NOT** add a Docker-build test to the per-PR gate (image build belongs to AR-9 / Epic 3 CI hardening). AC 1/5 are verified by the documented manual `docker build`/`docker run`/restart procedure recorded in Completion Notes.

- [x] **Gates** (all ACs) — run under **Node 24** (`nvm use 24`; the api native binding requires it):
  - [x] `npm run typecheck`, `npm test` (api unit+integration + web), `npm run lint --workspace apps/web`, `npm run lint:css --workspace apps/web`, `npm run contrast:check --workspace apps/web`, `npm run build --workspace apps/web`, `npm run size:check --workspace apps/web`.
  - [x] **Manual deploy verification** (AC 1,2,3,5): runtime path verified locally (Fastify via `tsx` serving the real built `apps/web/dist` same-origin; env-var `PORT`/`DATABASE_PATH`; create task → restart against same DB path → task persists with WAL sidecars). **`docker build`/`docker run` itself could not be executed — no Docker daemon in the dev environment.** Dockerfile validated structurally (all COPY paths exist, `.dockerignore` correct). See Completion Notes for the exact local results and the one remaining manual `docker build`/`docker run` step.

### Review Findings

- [x] [Review][Patch] README persistence restart command implies `docker start` accepts volume flags [README.md:106]
- [x] [Review][Patch] Hardening test cleanup dereferences `ctx` when setup fails [apps/api/test/integration/hardening.test.ts:16]

## Dev Notes

### This is a packaging/DevOps story — the app already works; you are wrapping it

Epics 1.1–1.10 shipped the full single-screen app (list, capture-and-confirm create, complete/uncomplete, failed-create recovery, unread indicator) plus the four API routes + `/health`, SQLite persistence, and the uniform error envelope. **Do not re-implement, re-route, or refactor any of that.** This story adds exactly: (a) `@fastify/helmet` + a body limit in `buildServer`, (b) a conditional `@fastify/static` plugin + a `staticRoot` option, (c) the entrypoint wiring to find the web build, (d) a multi-stage `Dockerfile`, (e) run/persistence docs, and (f) tests for the new API behavior. No contract, schema, repository, domain, hook, or component changes. [Source: sprint-status.yaml (1-1…1-10 done); architecture.md Decision Impact Sequence step 6 (line 221)]

### Current bootstrap — exact state you are extending (verified)

- **`apps/api/src/server.ts`** — `buildServer({ databasePath, logger = true })` creates `Fastify({ logger, ajv: { customOptions: { removeAdditional: false } } })` then registers, in order: `registerContainer` (awilix), `registerSwagger` (`/docs`), `registerErrorHandler`, `healthRoute` (`GET /health`), `todosRoute` (`/todos` CRUD). It does **not** call `listen()`. **No `@fastify/static`, no `@fastify/helmet`, no explicit `bodyLimit` exist yet.** You extend the factory options (add `bodyLimit`), register helmet, add the optional `staticRoot` field + conditional static registration. [Source: apps/api/src/server.ts lines 8-45]
- **`apps/api/src/index.ts`** — reads `PORT` (default 3001, validated 1–65535) and `DATABASE_PATH` (default `./data/todos.db`), `await buildServer({ databasePath })`, `app.listen({ port, host: '0.0.0.0' })`. Already container-friendly (binds `0.0.0.0`). You add only the `webDist` resolution + `existsSync` gate + pass `staticRoot`. Keep the readers and the listen block. [Source: apps/api/src/index.ts lines 1-29]
- **`apps/api/src/db/connection.ts`** — `databaseConnection({ databasePath })` does `mkdirSync(dirname(databasePath), { recursive: true })` (line 13) then opens the DB and sets WAL + pragmas. So pointing `DATABASE_PATH` at `/data/todos.db` on an empty volume just works — the parent dir is created. WAL produces `*.db-wal`/`*.db-shm` sidecars in the same dir; the volume retains them. **No change needed here.** [Source: apps/api/src/db/connection.ts]
- **Integration harness** — `apps/api/test/integration/helpers/build-test-app.ts` calls `buildServer({ databasePath, logger: false })` against a temp-file SQLite, no `staticRoot`. This is exactly why static MUST be option-gated (AC 6). [Source: build-test-app.ts]

### The one architectural reconciliation: tsx vs tsc (read this before the Dockerfile)

Architecture AR-7 (line 54) and the Infrastructure section (line 207) say "compile `apps/api` (tsc)". The **implemented reality supersedes this**:

- `apps/api/tsconfig.json` sets `noEmit: true` (line 8) — `tsc` only type-checks, emits nothing.
- `@tlf/contracts` ships **TS source only** — `main`/`types`/`exports` all point at `./src/index.ts`; there is **no build script**. A plain `tsc`-compiled api would emit `import … from '@tlf/contracts'` that Node cannot resolve at runtime (it would land on a `.ts` file).
- `apps/api/package.json` `start` is already `tsx src/index.ts`.

**Therefore the container runs the api via `tsx` (the existing `start` script).** tsx executes the TS source directly and resolves the workspace contracts TS, with no build step for either the api or contracts. This keeps the image faithful to how the app actually runs. A proper tsc/esbuild bundle (compiling contracts too, dropping dev deps for a genuinely "thin" image) is a reasonable Epic-3 hardening but is **out of scope here** — don't invent it. [Source: apps/api/tsconfig.json; packages/contracts/package.json; apps/api/package.json]

### `@fastify/static` registration — order and `wildcard:false` matter

- The web app has **no client-side router** (architecture: "no router; refetch-on-focus for multi-tab"). It needs `/` → `index.html` and `/assets/*` only — **not** an SPA deep-link catch-all.
- Register static with `wildcard: false` so it globs the built files at boot and serves them by exact path + `index.html` at `/`, WITHOUT adding a `GET /*` route. A `/*` catch-all risks shadowing `/todos`, `/health`, `/docs` and converting API 404s into HTML, breaking the FR-8 error-envelope contract (AC 3). [Source: @fastify/static docs — wildcard option; architecture.md (line 53, 442)]
- Register static **after** the API + swagger routes and **only** when `staticRoot` is set. Same-origin relative `fetch('/todos')` from the web app then resolves to the real API route, not a static file. [Source: apps/web/src/api/todos.ts]

### `@fastify/helmet` — disable CSP for v1

Register helmet with `contentSecurityPolicy: false`. Helmet's **default CSP** (`default-src 'self'`, `script-src 'self'`, etc.) can block the bundled Vite SPA (and would block the swagger-ui `/docs` assets). AC 4 explicitly scopes this story to **baseline** headers and **defers hardened static-serving headers (strict CSP, COEP/CORP) to Epic 3 Story 3.5**. Baseline helmet (X-Content-Type-Options, X-DNS-Prefetch-Control, Referrer-Policy, etc.) + an explicit `bodyLimit` is the whole ask. Do not gold-plate a CSP now. [Source: epics.md#Story-1.11 (line 346 — "hardened static-serving headers are deferred to Epic 3"); architecture.md AR-8 (line 55)]

### Docker specifics (verified facts)

- Package manager is **npm** with a root `package-lock.json` (lockfileVersion 3) → use `npm ci` (not `npm install`) in the builder for reproducibility. Workspaces hoist deps to the **root** `node_modules`, so copy the root `node_modules` across stages. [Source: package-lock.json; root package.json workspaces]
- **Never copy host `node_modules`** into the image (native `better-sqlite3` is arch-specific). `.dockerignore` already excludes it — keep that. Build the native module inside the image via `npm ci`. [Source: web research — better-sqlite3 native module must match container arch]
- `node:24-slim` matches `.nvmrc`/`engines: >=24` and gets better-sqlite3 v12 Node-24 prebuilds (no compiler needed in the common case). [Source: web research — better-sqlite3 v12 added Node 24 prebuilt support; .nvmrc=24]
- The web build output is `apps/web/dist` (no custom `outDir`, no `base` path), so assets serve from `/assets/*` at the root origin — compatible with same-origin serving with no extra Vite config. [Source: apps/web/vite.config.ts — no `base`/`build.outDir` overrides]

### Testing standards

- Vitest; api integration tests live in `apps/api/test/integration/` and use the `buildTestApp()` helper (temp-file SQLite, `logger: false`). Add header/body-limit assertions there; keep the unit/integration project split intact (`apps/api/vitest.config.ts`). [Source: apps/api/test/integration/helpers/build-test-app.ts; vitest.config.ts]
- For the optional static test, prefer a **temp fixture dir** with a minimal `index.html` over depending on a real web build, so the test is hermetic. Assert: `GET /` → 200 `text/html`; `GET /todos` → JSON (not shadowed); unknown API path → uniform error envelope.
- Run the full workspace suite under **Node 24** (`nvm use 24`) — the api better-sqlite3 ABI requires it (recurring note from 1.7–1.10).
- The Dockerfile / image build is verified **manually** (build + run + browser + restart-persistence); it is intentionally NOT added to the per-PR CI gate (Epic 3 / AR-9 owns CI expansion).

### Previous story intelligence

- **1.7–1.10 discipline:** small, additive changes; no new dependency unless justified; `size:check` rebaselined only when deliberate (this story is api-only — it should NOT move the web bundle size, so `size:check` stays green with no rebaseline). [Source: 1-10-unread-error-indicator.md Completion Notes]
- **Story-file frontmatter** carries `baseline_commit` (the HEAD the story branches from) — set above to `1ee65e0`. [Source: 1-10 frontmatter]
- **Node-24 gate** is a standing requirement for any run that touches `apps/api`. [Source: api-tests-need-node-24 memory; 1-9/1-10 environment notes]

### Scope boundaries (do NOT implement here)

- **Strict CSP / hardened static headers / COEP-CORP tuning** → Epic 3 Story 3.5. v1 helmet is baseline-only with CSP off.
- **Expanded CI quality gates (Playwright in CI, bundle-size gate enforcement, k6 latency)** → Epic 3 (Story 3.4 / 3.5). Do not add a Docker-build CI job here.
- **Delete (DELETE route + UI)** → Epic 2. The container still won't have delete; that's expected. Do not anticipate it. (`apps/api` has no `delete-todo.handler` / DELETE route yet — do not add one.)
- **tsc/esbuild compile of api + contracts for a genuinely slim image** → deferred Epic-3 optimisation; run via tsx now.
- **Reverse proxy / TLS / orchestration (compose, k8s) / non-root user hardening** → not in this story's ACs (Epic 3 hardens the deploy). A single `Dockerfile` + documented `docker run` is the deliverable.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.11 ACs (lines 335–347); FR-9 (line 32); FR-8 (line 31); Epic 3 Story 3.5 hardened deploy (line ~]
- [Source: _bmad-output/planning-artifacts/architecture.md — Infrastructure & Deployment (lines 205–211); AR-7 packaging (line 54); AR-8 hardening (line 55); Hardening-lightweight (line 177); proposed structure Dockerfile/static.ts (lines 337, 363); Integration Points dev-vs-prod origin (line 442); FR→structure FR-9 (line 435)]
- [Source: apps/api/src/server.ts; apps/api/src/index.ts; apps/api/src/db/connection.ts; apps/api/src/plugins/{awilix,swagger,error-handler}.ts; apps/api/test/integration/helpers/build-test-app.ts; apps/api/tsconfig.json; apps/api/package.json]
- [Source: apps/web/vite.config.ts; apps/web/src/api/todos.ts; apps/web/package.json (build → apps/web/dist)]
- [Source: packages/contracts/package.json (TS-source exports, no build)]
- [Source: root package.json (workspaces, scripts); package-lock.json; .nvmrc=24; .dockerignore; .env.example; .gitignore]
- [Source: web research — better-sqlite3 v12 Node-24 prebuilds + multi-stage native-module discipline; @fastify/static SPA/wildcard behavior]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

All gates run under Node 24 (`nvm use 24`) per the standing api requirement.

- `npm run test:integration` → 3 files, 27 tests pass (incl. new `hardening` + `static-serving`).
- `npm test` (all workspaces) → api 43 pass, web 131 pass.
- `npm run typecheck` → clean across api / web / contracts.
- `npm run lint`, `lint:css`, `contrast:check` (7/7 pairs) → green.
- `npm run build --workspace apps/web` → `dist/` built.
- `npm run size:check` → 76986 B gz ≤ 76983 B baseline +512 B tolerance → OK (no rebaseline; api-only story).

### Completion Notes List

Packaging-only story — the app (Stories 1.1–1.10) was wrapped, not changed. No contract, schema, repository, domain, hook, or component edits.

**What was added**
- `@fastify/helmet@^13` + `bodyLimit: 64 * 1024` registered at the root app in `buildServer` (helmet before routes). CSP **disabled** (`contentSecurityPolicy: false`) for v1 — strict CSP / COEP-CORP deferred to Epic 3 Story 3.5 (AC 4).
- New `plugins/static.ts` (`registerStatic`, `wildcard: false`) + optional `staticRoot` on `BuildServerOptions`. Registered **only when `staticRoot` is set** and **after** the API/swagger routes, so the API wins and unknown API paths still return the uniform 404 envelope (AC 1, 3, 6).
- `index.ts` resolves `../../web/dist` via `fileURLToPath` and gates on `existsSync`, so the container serves the SPA while a headless local run still boots (AC 1, 3).
- Multi-stage `Dockerfile` (`node:24-slim` both stages): builder `npm ci` + builds web; runner copies `node_modules` (container-arch native better-sqlite3), `packages/contracts` (TS source), `apps/api` (TS source), `apps/web/dist`; `ENV PORT=8080 DATABASE_PATH=/data/todos.db`, `VOLUME ["/data"]`, `CMD npm run start` (= `tsx src/index.ts`). Runs via **tsx** (not tsc) because `apps/api` is `noEmit` and `@tlf/contracts` ships TS source — reconciles AR-7's "tsc" with implemented reality (AC 1, 2, 5).
- README "Running the container" section + `.env.example` container-defaults note (AC 2, 5).
- New integration tests: `hardening.test.ts` (helmet headers present, CSP absent, 413 on >64 KiB body) and `static-serving.test.ts` (hermetic temp `index.html`: `GET /` → 200 html, `/todos` still JSON, unknown path → `NOT_FOUND` envelope).

**Manual deploy verification (AC 1, 2, 3, 5)** — Docker daemon is **not available in this dev environment**, so `docker build`/`docker run` could not be executed here. Instead the exact runtime path the container uses (Fastify via `tsx` serving the real built `apps/web/dist`) was verified locally with `PORT=8080` + a temp `DATABASE_PATH`:

- `GET /health` → `{"status":"ok"}`; `GET /` → 200 `text/html` with the real built `index.html` (`<div id="root">`); hashed `GET /assets/index-*.js` → 200 `application/javascript`.
- `POST /todos` → 201; `GET /todos` returns the task; `GET /nope` → 404 `{"error":{"code":"NOT_FOUND",…}}` (static did not add a catch-all).
- Security headers present: `X-Content-Type-Options: nosniff`, `X-DNS-Prefetch-Control: off`; no `Content-Security-Policy`.
- **Persistence:** stopped the process and restarted it against the **same** `DATABASE_PATH` → the task was still present (`todos.db` + `todos.db-wal` + `todos.db-shm` sidecars retained). This is the app-level equivalent of the `docker stop`/`docker start` volume restart.
- Dockerfile validated structurally: every `COPY` source path exists; `.dockerignore` excludes `node_modules`/`dist`/`*.db*`/`.git`.

> **Remaining manual step for the reviewer (Docker-capable machine):**
> `docker build -t the-long-finger .` then
> `docker run -p 8080:8080 -e PORT=8080 -e DATABASE_PATH=/data/todos.db -v tlf-data:/data the-long-finger`,
> open `http://localhost:8080`, add + complete/uncomplete a task, then `docker stop`/`docker start` with the same `-v tlf-data:/data` to confirm persistence. (Intentionally NOT a per-PR CI gate — CI expansion is Epic 3 / AR-9.)

### File List

- `apps/api/package.json` (modified — `@fastify/helmet`, `@fastify/static` deps)
- `package-lock.json` (modified — lockfile refresh)
- `apps/api/src/server.ts` (modified — helmet + bodyLimit + conditional static + `staticRoot` option)
- `apps/api/src/plugins/static.ts` (new — `registerStatic`, `wildcard: false`)
- `apps/api/src/index.ts` (modified — resolve + gate `staticRoot`)
- `apps/api/test/integration/hardening.test.ts` (new — helmet headers + 413 body limit)
- `apps/api/test/integration/static-serving.test.ts` (new — static serving alongside API)
- `Dockerfile` (new — multi-stage build at repo root)
- `.env.example` (modified — container-defaults note)
- `README.md` (modified — "Running the container" section)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — 1-11 status transitions)

## Change Log

| Date       | Change                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-30 | Story 1.11 created — multi-stage Dockerfile serving the built SPA via conditional `@fastify/static`, `@fastify/helmet` baseline + body limit (CSP deferred to Epic 3), env-var config, SQLite volume persistence. Run via `tsx` (reconciles AR-7's "tsc" against `noEmit`+TS-source contracts). Status → ready-for-dev. |
| 2026-06-30 | Story 1.11 implemented — helmet + 64 KiB body limit, conditional `@fastify/static` (`wildcard:false`) + `staticRoot` option, entrypoint wiring, multi-stage `Dockerfile`, README/`.env.example` docs, and new `hardening`/`static-serving` integration tests. All gates green under Node 24; runtime path verified locally (Docker daemon unavailable — image build is a documented manual step). Status → review. |
