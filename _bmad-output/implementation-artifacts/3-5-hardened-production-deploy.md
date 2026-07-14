---
baseline_commit: fb7d1f2
---

<!-- Powered by BMAD-CORE™ -->

# Story 3.5: Hardened production deploy

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer on the team,
I want the production container hardened, observable, and proven durable under failure,
So that the app can be operated and recovered safely in production.

## Acceptance Criteria

1. **Given** the production image, **When** it serves the static frontend, **Then** `@fastify/helmet` baseline security headers (and CSP appropriate to the static layer) are applied at the static-serving layer, not just the API. [Source: epics.md line 476; Story 1.11 AC 4 deferred exactly this here]
2. **Given** the container with a mounted `DATABASE_PATH` volume, **When** it is stopped and restarted, **Then** all previously confirmed todos are still present. [Source: epics.md line 477; architecture.md line 208 (FR-9 volume dependency)]
3. **Given** a `POST /todos` in flight, **When** the process is killed (SIGKILL) mid-write and then restarted, **Then** the database recovers via WAL — the committed row is present or the uncommitted write is cleanly dropped, with no corruption. [Source: epics.md line 478; epic note 20 (line 158) explicitly commissions this test; PRD NFR-6]
4. **Given** the running service, **When** requests are handled, **Then** pino emits structured JSON logs with a request id and per-request latency (never logging full payloads), at the committed levels (info lifecycle, warn recoverable, error 500s). [Source: epics.md line 479; architecture.md line 279 (the committed level table)]
5. **Given** an orchestrator, **When** it probes `GET /health`, **Then** it receives a 200 liveness response suitable for readiness/liveness checks. [Source: epics.md line 480; architecture.md line 190]

*Sequencing note: this story is created while Story 3.4 is still backlog (parallel track, Keith's call). Nothing here depends on 3.4, and nothing here may land 3.4's work: no new CI jobs, no gate rework, no k6. The new integration tests in this story run inside the EXISTING `npm run test:integration` CI step (ci.yml line 55) — that is not a new job.*

*Ownership note: this is a hardening + verification story. Most of the substrate already exists and verified fine at each epic's end. The story closes four real gaps: (1) the strict CSP that 1.11 explicitly deferred here, (2) warn-level logging for recoverable 4xx (the one committed log level that is missing), (3) the SIGKILL/WAL crash-recovery proof, (4) graceful shutdown so `docker stop` is a clean close instead of a 10s timeout kill. Everything else is verify + lock + record.*

### What is already built and COMPLIES (verify + cite — do NOT rebuild)

- **Helmet baseline at the root app (AC 1, first half)** — `server.ts:49-55`: `await app.register(helmet, { contentSecurityPolicy: false })`, registered BEFORE routes so it covers API + static. Locked by `test/integration/hardening.test.ts` (nosniff, x-dns-prefetch-control, 413 body limit). The `contentSecurityPolicy: false` escape hatch exists solely because this story hadn't landed — the code comment names Story 3.5.
- **Baseline headers already emitted today** (helmet 8.2 defaults minus CSP): `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Origin-Agent-Cluster`, `Referrer-Policy: no-referrer`, HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 0`, etc. (verified by executing installed helmet 8.2.0 with defaults, 2026-07-14). COEP is NOT in helmet's defaults — see Dev Notes "COEP/COOP/CORP posture".
- **Static SPA serving (AC 1 substrate)** — `plugins/static.ts` with load-bearing `wildcard: false` (no catch-all; API routes + uniform 404 envelope win). Locked by `test/integration/static-serving.test.ts` with a hermetic temp `index.html` fixture — extend that harness, don't invent a new one.
- **WAL + pragmas (AC 3 substrate)** — `db/connection.ts:16-22`: `journal_mode = WAL` (persisted in the DB file), `synchronous = NORMAL` (corruption-safe under WAL), `busy_timeout = 5000`, `foreign_keys = ON`, applied BEFORE `applySchema`. Plus `mkdirSync(dirname(databasePath), { recursive: true })` — a fresh, empty volume initialises cleanly (Dockerfile comment lines 53-55 documents exactly this).
- **Container + volume (AC 2 substrate)** — root `Dockerfile`: multi-stage node:24-slim, `ENV DATABASE_PATH=/data/todos.db`, `VOLUME ["/data"]`, `EXPOSE 8080`. Image verified end-to-end 2026-07-01 (epic-1 retro: `docker build`/`docker run`, create → restart → persist). Keith's machine runs Docker Desktop — daemon is not auto-started, `open -a Docker` first.
- **Pino info lifecycle + request id + latency (AC 4, most of it)** — Fastify `logger: true` (`server.ts:43-47` + comment :30-32): every request logs `reqId` and the response line carries `responseTime` (ms). Request bodies are never logged by Fastify's serializers (req serializer logs method/url/host/remoteAddress only). 5xx: `error-handler.ts:40-43` logs the real error at `error` level and never leaks it into the response body.
- **`GET /health` (AC 5)** — `routes/health.route.ts`: `app.get('/health', async () => ({ status: 'ok' }))`, exercised by `hardening.test.ts:20`. It does no I/O and cannot hang on the DB — precisely what a liveness probe wants. `index.ts` listens on `0.0.0.0` so an orchestrator can reach it.
- **Env-var config** — `index.ts`: `PORT` (validated, default 3001; container sets 8080) and `DATABASE_PATH` (default `./data/todos.db`; container sets `/data/todos.db`); `staticRoot` auto-detected from the built `apps/web/dist` via `import.meta.url` (cwd-independent).

### The gaps this story closes (the actual work)

1. **AC 1 — CSP is OFF.** `hardening.test.ts:26` currently asserts `content-security-policy` is **undefined** (v1 behavior). Enable a strict CSP tightened for THIS app (Vite build emits no inline scripts/styles; system fonts only — tokens.css:43-45; zero external origins in `apps/web/src`; favicon served from `public/`). The one complication is swagger-ui at `/docs`: solve with `@fastify/swagger-ui`'s `staticCSP: true` (installed 5.2.6 supports it — verified in node_modules), which overrides the header on its own routes via an encapsulated `onSend` hook. Directive set + mechanism in Dev Notes.
2. **AC 4 — recoverable 4xx are not logged at `warn`.** The committed level table (architecture.md:279) is info lifecycle / warn recoverable (validation, 404) / error 500s. Today the error handler logs ONLY ≥500. Add `warn` for the 4xx branch and the not-found handler — WITHOUT logging validation `details` or any payload content (details can embed the submitted description). This is a runtime change in `plugins/error-handler.ts`.
3. **AC 3 — no crash-recovery proof exists anywhere.** SIGKILL requires a real separate process (better-sqlite3 is in-process; you cannot SIGKILL the vitest worker). New integration test spawns the actual server (`tsx src/index.ts`) as a child process against a temp-dir DB, POSTs, SIGKILLs with WAL un-checkpointed, restarts, asserts `PRAGMA integrity_check` = ok and confirmed-row semantics.
4. **AC 2 — container-level stop/restart durability was verified once manually (epic-1 retro) but never scripted.** Commit a repeatable verification script (docker build → run with named volume → create todo → `docker stop`/`docker start` → todo persists → `docker kill` variant → `/health` probe) and record a real run in completion notes. No CI docker job (see Out of scope).
5. **Graceful shutdown (default IN — Open Question 2).** `index.ts` registers no signal handlers, and the container's `CMD ["npm", "run", "start", ...]` makes npm PID 1 — npm's signal forwarding is unreliable, so `docker stop` tends to hit the 10s timeout and SIGKILL. WAL makes that *safe* (AC 3 proves it), but "operated safely in production" wants the clean path: `SIGTERM/SIGINT → app.close()` (which via `disposeOnClose` runs the awilix `db.close()` disposer — better-sqlite3 checkpoints the WAL on close) + an exec-form direct CMD so signals reach node.

### Explicitly OUT of scope (do NOT build here)

- **k6 latency sign-off, slow-3G TTI, WCAG gate matrix, contrast-matrix rework, absolute bundle budget, the CI `e2e` job, any new CI jobs or gate rework** → Story 3.4. This story's new tests must run inside the existing `test:integration` step untouched. [Source: epics.md Story 3.4 lines 453-466; deferred-work.md lines 9, 14]
- **A Docker-build CI job** — 1.11 explicitly declined it ("do not add a Docker-build CI job here", 1-11 story line 131) and no Epic 3 AC commissions one. Container verification stays scripted + manually recorded (Open Question 3).
- **NVDA/VoiceOver recorded smoke runs** → release-candidate gates per Keith's 3.2 decision. Untouched.
- **Auth, rate limiting, encryption-at-rest, CORS config** — architecture.md lines 174-178: no auth in v1, rate limiting deferred, CORS not required (same-origin prod). Do not add.
- **tsc/esbuild compile of api for a slimmer image** — 1.11 deferred this as an optional Epic-3 optimisation; it is NOT commissioned by any 3.5 AC. Runtime stays tsx. Do not gold-plate.
- **New npm packages** — zero. helmet 13.0.2 (helmet 8.2.0), swagger-ui 5.2.6, better-sqlite3 12 already cover everything.
- **Metrics/alerting/error-tracker integration** — architecture.md line 210/475: log-level observability only; error tracking stays "a documented hook".

## Tasks / Subtasks

- [x] **A. Strict CSP at the static-serving layer (AC 1)**
  - [x] A1. In `server.ts`, replace `{ contentSecurityPolicy: false }` with an explicit directive set (table in Dev Notes — start from helmet's defaults, tightened: no `'unsafe-inline'` in style-src, no `https:` wildcards, no `upgrade-insecure-requests`). Keep helmet registered at the root app BEFORE routes (registration order is load-bearing: helmet → cradle → swagger → error-handler → routes → static).
  - [x] A2. In `plugins/swagger.ts`, add `staticCSP: true` to the `fastifySwaggerUi` registration so `/docs` static assets get swagger-ui's own self-contained CSP (its encapsulated `onSend` hook overwrites helmet's header on those routes only — verified against installed 5.2.6 source, lib/routes.js:14-43). Do NOT loosen the global CSP for swagger's sake.
  - [x] A3. Flip and extend the tests: `hardening.test.ts:26` now asserts the CSP header IS present with the committed directives (assert on the parsed directive set, not one brittle full-string equality); add an assertion in `static-serving.test.ts` that `GET /` (the static index.html response) carries the same CSP; add a `/docs` case asserting the swagger-ui-owned CSP header is present there (and differs from the global one).
  - [x] A4. Verify against the REAL artifacts, not just fixtures: `npm run build --workspace apps/web`, run the API with `staticRoot` pointing at the real dist, open it in a browser — zero CSP violations in the console for the app; then open `/docs` and confirm swagger-ui renders and can execute a try-it-out request. (jsdom/inject can't evaluate CSP — only a browser enforces it. This is the 3.1/3.3 live-verification lesson applied to headers.) If the Vite build turns out to inline any asset as a `data:` URI, widen only the specific directive (`img-src 'self' data:`) and record it; do not reach for `'unsafe-inline'` for any reason.
- [x] **B. Committed log levels + never-log-payloads lock (AC 4)**
  - [x] B1. In `plugins/error-handler.ts`: log recoverable 4xx at `warn` — in the error handler's <500 branch and in the not-found handler. Log ONLY safe fields (e.g. `{ statusCode, code }` + message); NEVER log `error.validation` (it embeds submitted values — the response envelope may carry `details` to the CLIENT, but the log must not) and never the request body. The ≥500 `request.log.error(error)` branch stays as-is.
  - [x] B2. New integration test (e.g. `test/integration/logging.test.ts`): build the app with a captured pino destination — `buildServer({ databasePath, logger: { stream: captureStream } })` (Fastify's logger option accepts pino options incl. a custom stream; keep `level: 'info'`). Drive one success request, one validation 400, one 404, one forced 500 if cheaply reachable. Assert: every line parses as JSON; the response line for the success request has `reqId` and numeric `responseTime`; the 400/404 produced a `level: 40` (warn) line; a unique sentinel description POSTed in a body appears in ZERO log lines (both the success path and a validation-failure path carrying the sentinel in the offending payload).
  - [x] B3. AC 5 rides along: assert `/health` returns 200 `{ status: "ok" }` and that it emits only lifecycle logs — already implicitly covered; make the liveness claim explicit in one assertion rather than a new suite.
- [x] **C. SIGKILL / WAL crash-recovery proof (AC 3)**
  - [x] C1. New integration test `test/integration/crash-recovery.test.ts` that spawns the real server as a child process: `spawn(process.execPath, [tsxCli, 'src/index.ts'], { env: { ...process.env, PORT: String(port), DATABASE_PATH: tmpDbPath } })` where `tsxCli` resolves via `createRequire(import.meta.url).resolve('tsx/cli')`. Poll `GET /health` until ready (generous timeout — real process boot). Vitest cwd is `apps/api`, matching `src/index.ts`.
  - [x] C2. The kill choreography: create a baseline todo and await its 201 (this row is CONFIRMED). Then fire a burst of POSTs and SIGKILL the child while they are in flight (do not await them all) — an exact mid-`INSERT` kill is not externally schedulable (better-sqlite3 writes are synchronous and microsecond-fast); in-flight-at-kill is the honest, falsifiable version of "mid-write", and the WAL sidecars (`-wal`/`-shm`) are guaranteed un-checkpointed because SIGKILL skips `db.close()`.
  - [x] C3. Recovery assertions, both layers: (a) open the temp DB file directly with better-sqlite3 in the test and assert `PRAGMA integrity_check` returns `ok`; (b) restart the same command against the same `DATABASE_PATH`, poll `/health`, `GET /todos` → parses as a valid list, the confirmed baseline row IS present, and every burst POST that returned 201 before the kill is present (unanswered ones may be present or cleanly absent — assert no torn/partial row either way).
  - [x] C4. Hygiene: temp dir per run (`mkdtemp`), always `kill()` + await child exit in `afterEach`/finally (no orphaned processes when assertions throw), no fixed sleeps — poll with deadline. This test runs in the existing `test:integration` project/CI step; keep total runtime a few seconds.
- [x] **D. Container verification script + recorded run (AC 2, container-level 3 & 5)**
  - [x] D1. New `scripts/verify-container.sh` (repo root; the repo's first `scripts/` entry — keep it POSIX-y and self-cleaning): build the image → run with a named volume mounted at `/data` and a mapped port → wait for `curl /health` = 200 (the AC 5 orchestrator-probe shape) → `POST /todos` → `docker stop` + `docker start` → assert the todo is still returned → `docker kill` (SIGKILL, the AC 3 path at container level) + restart → assert list intact → cleanup (container + volume) with a `--keep` escape hatch.
  - [x] D2. Run it for real on Keith's machine (`open -a Docker` first; daemon is not auto-started) and record the full transcript summary in the Completion Notes — the 1.11/3.3 convention of recorded manual verification. Also eyeball the running container's headers once: `curl -sI localhost:<port>/ | grep -i content-security` matches A1's policy.
- [x] **E. Graceful shutdown + signal-correct CMD (default IN — Open Question 2)**
  - [x] E1. In `index.ts`: on `SIGTERM`/`SIGINT`, log, `await app.close()`, `process.exit(0)`. `app.close()` triggers `@fastify/awilix` `disposeOnClose` → the registered `db.close()` disposer (`plugins/awilix.ts:29-32`) → better-sqlite3 checkpoints the WAL on close. Register the handlers once, guard against double-fire.
  - [x] E2. In `Dockerfile`: replace `CMD ["npm", "run", "start", "--workspace", "apps/api"]` with an exec-form direct invocation so PID 1 is node, not npm (npm does not reliably forward signals): `CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]` (tsx v4's documented Node ≥20 loader form; `index.ts` is cwd-independent — webDist resolves via `import.meta.url` and `DATABASE_PATH` is absolute). Update the adjacent comment block; verify with the D-script that `docker stop` now exits promptly (well under the 10s timeout) and cleanly.
  - [x] E3. Keep AC 3 honest: the crash test (C) must keep using SIGKILL — do not let the new SIGTERM handler turn the crash test into a clean shutdown.
- [x] **F. Full-gate verification (all ACs)**
  - [x] F1. Under Node 24 (`nvm use 24`; fresh worktree needs `npm install` first): `npm run typecheck`, `npm run test:unit` + `npm run test:integration` for apps/api (baseline 49 tests, all green + new logging/crash suites), `npm run test --workspace apps/web` (baseline 243 — should be untouched by this story), `lint:css` + selftest, `contrast:check` (7/7), `npm run build --workspace apps/web` + `size:check` (baseline 92,498 B gz ≤ 92,295+512 budget; this story adds zero web bytes — if the gate trips, something is wrong, investigate rather than rebaseline).
  - [x] F2. `npm run test:e2e` — all 13 existing tests green twice consecutively (the 3.1/3.2/3.3 flake convention). This story should not touch the e2e layer; the run proves no regression (dev server has no helmet, so CSP cannot affect it — the assertion is "nothing else broke").
  - [x] F3. The A4 browser pass + D2 container run are part of done — do not mark review with the CSP unverified in a real browser or the container script unrun (the 3.3 lesson: the specs are the repeatable gate, the live pass catches what assertions didn't think to ask).

## Dev Notes

### CSP design (AC 1) — the directive set and why

Start from helmet 8.2's default CSP and tighten for this app. The app is CSP-friendly by construction: the Vite build emits `index.html` referencing hashed external JS/CSS only (no inline scripts/styles), fonts are system-stack only (`tokens.css:43-45` — "zero font payload"), there are no external origins anywhere in `apps/web/src` (grep-verified 2026-07-14), and the favicon is a real file in `public/`.

| Directive | Value | vs helmet default | Why |
|---|---|---|---|
| `default-src` | `'self'` | same | Baseline deny. |
| `script-src` | `'self'` | same | Vite emits external hashed scripts only. |
| `script-src-attr` | `'none'` | same | No inline handlers. |
| `style-src` | `'self'` | **tightened** (default adds `https: 'unsafe-inline'`) | CSS Modules compile to external stylesheets; no inline styles in the SPA. |
| `font-src` | `'self'` | **tightened** (default adds `https: data:`) | System fonts only. |
| `img-src` | `'self'` | **tightened** (default adds `data:`) | Favicon is a file; the check glyph is a CSS `::before` text char, not an image. If A4's real-build check finds Vite inlined a small asset as `data:`, widen to `'self' data:` and record it. |
| `connect-src` | `'self'` | (covered by default-src) | All fetches are same-origin relative (`/todos`, `/health`). State explicitly for self-documentation. |
| `object-src` | `'none'` | same | — |
| `base-uri` | `'self'` | same | — |
| `form-action` | `'self'` | same | — |
| `frame-ancestors` | `'none'` | **tightened** (default `'self'`) | Nothing embeds this app. If you set `'none'`, align frameguard: `xFrameOptions: { action: 'deny' }` so XFO and CSP agree. |
| `upgrade-insecure-requests` | **omit** | **removed** | The container serves plain HTTP (TLS termination is upstream/undefined at v1; local use is `http://localhost`). The directive is for https-transition sites and risks breakage on an http origin; it has no value here. |

Implementation shape: `app.register(helmet, { contentSecurityPolicy: { useDefaults: false, directives: { ... } }, xFrameOptions: { action: 'deny' } })` — an explicit `useDefaults: false` + full table keeps the test assertion and the policy in one visible place (helmet merges confusingly with `useDefaults: true`). Everything else helmet does stays at defaults.

**Apply unconditionally** (not prod-gated): helmet already registers unconditionally in `buildServer`, so the integration tests inherit the CSP for free; API JSON responses carrying CSP are harmless; dev-mode browsing goes through Vite's server, which Fastify's headers never touch. No env-var switch — one behavior, one test surface.

### The swagger-ui `/docs` seam (AC 1's one complication)

Swagger UI's assets need their own policy (its default recommends `font-src https: data:`, `img-src validator.swagger.io`, style hashes). Installed `@fastify/swagger-ui` 5.2.6 handles this itself: `staticCSP: true` computes a policy from its bundled `static/csp.json` hash file and sets it in an `onSend` hook **registered inside the plugin's encapsulation context** — it fires only for `/docs*` routes and, because `onSend` runs after helmet's `onRequest`, its header value wins there. The global strict CSP stays intact everywhere else. (Verified against installed source: `lib/routes.js:14-43`; its `static/index.html` uses external `<script src>` tags only, no inline scripts.)

Fallback ONLY if A4's browser check shows swagger-ui broken under its own staticCSP (not expected): pass an explicit `staticCSP: "<string>"` per its README rather than weakening the global policy. Disabling `/docs` in prod is NOT the default — AR-4 commits OpenAPI docs; record a decision if you end up there.

### COEP/COOP/CORP posture (the 1.11 deferral's second half)

Helmet 8.2 defaults already emit `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin` (in production today — only CSP was disabled). COEP (`Cross-Origin-Embedder-Policy`) is NOT in helmet's defaults and stays off: it exists to enable cross-origin isolation (SharedArrayBuffer et al.), which nothing here needs, and it adds embedding friction for zero benefit at v1. Decision: keep helmet defaults (COOP/CORP on, COEP off) and record this as the resolved "COEP/CORP tuning" from 1.11 AC 4. Optionally assert COOP/CORP presence in A3's header test to lock the posture.

### Crash-recovery test design (AC 3) — constraints that matter

- **Why a child process:** better-sqlite3 runs in-process; SIGKILL semantics require killing a real OS process that has the DB open with un-checkpointed WAL. `app.inject()` cannot express this.
- **Spawn shape:** `spawn(process.execPath, [tsxCli, 'src/index.ts'], ...)` with `tsxCli = createRequire(import.meta.url).resolve('tsx/cli')` — avoids PATH/npx flakiness and works in the workspace layout (tsx is an apps/api dependency). Vitest's cwd for this project is `apps/api`.
- **Port:** pick a high random port per run (collision-retry or derive from PID) — `index.ts` has no port-0 support and adding it is out of scope.
- **Readiness:** poll `GET /health` with a deadline (the AC 5 probe doubles as the test's readiness check). Never fixed sleeps.
- **"Mid-write" honesty:** you cannot schedule a kill inside a synchronous better-sqlite3 `INSERT` from outside the process. The falsifiable version: confirmed rows (201 received) MUST survive; in-flight rows may be present or absent but never torn; `PRAGMA integrity_check` = `ok`. That is exactly the AC's "committed row present or uncommitted write cleanly dropped, no corruption".
- **`synchronous = NORMAL` nuance (know, don't "fix"):** under WAL, NORMAL is corruption-safe by design (connection.ts:19 comment is correct); the durability window it leaves is against OS/power failure, not process SIGKILL — a SIGKILLed process's completed WAL frames are on disk and recovered on reopen. The test asserts app-level process-crash semantics; do not escalate the pragma to FULL.
- **Cleanup discipline:** `mkdtemp` per run; kill + await exit in a finally; the restarted child also gets killed. Orphaned tsx processes on a failed assertion are the flake you'll chase for a week.

### Logging test design (AC 4)

- `buildServer`'s `logger` option is passed through to Fastify verbatim (`FastifyServerOptions['logger']`) — Fastify accepts pino options including `{ stream }`. Capture lines in an array via a tiny writable stream (`write(chunk)` → push), parse each as JSON.
- What "lifecycle at info" already looks like: `{"level":30,...,"reqId":"req-1","msg":"incoming request"}` then `{"level":30,...,"reqId":"req-1","responseTime":<ms>,"msg":"request completed"}`. Assert `reqId` presence + numeric `responseTime` on the completion line.
- The warn change (B1) must not leak data: `error.validation` embeds the offending VALUE (e.g. an over-long description). The response envelope keeps sending `details` to the client (contract unchanged — `errorEnvelope` allows it); the LOG line logs only statusCode/code/message. The never-log-payloads assertion (unique sentinel in zero log lines) is the lock.
- Fastify logs 4xx replies' completion line at info already; the added `warn` is the level-appropriate signal for "recoverable" — one warn line per handled 4xx, not a re-log of the whole error object.

### Where the pieces live (current state → change)

| Concern | File | Change |
|---|---|---|
| Helmet registration / CSP | `apps/api/src/server.ts:49-55` (UPDATE) | A1: explicit directives replace `contentSecurityPolicy: false`; update the comment block (it currently says CSP deferred to 3.5 — that lands now) |
| Swagger UI CSP | `apps/api/src/plugins/swagger.ts:37-39` (UPDATE) | A2: `staticCSP: true` |
| 4xx warn logging | `apps/api/src/plugins/error-handler.ts` (UPDATE) | B1: warn in <500 branch + not-found handler; ≥500 branch untouched; envelope shape untouched |
| Signal handling | `apps/api/src/index.ts` (UPDATE) | E1: SIGTERM/SIGINT → `app.close()` |
| Container CMD | `Dockerfile:58-61` (UPDATE) | E2: exec-form `node --import tsx`; comment update |
| Header tests | `apps/api/test/integration/hardening.test.ts` (UPDATE), `static-serving.test.ts` (UPDATE) | A3: flip CSP expectation; `/` + `/docs` header assertions |
| Logging test | `apps/api/test/integration/logging.test.ts` (NEW) | B2/B3 |
| Crash test | `apps/api/test/integration/crash-recovery.test.ts` (NEW) | C |
| Container script | `scripts/verify-container.sh` (NEW) | D1 |
| Deferral bookkeeping | `_bmad-output/implementation-artifacts/deferred-work.md` (UPDATE if needed) | No 3.5 items are listed there today; add closure notes only if you consume one |
| Sprint status | `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE) | status transitions |
| **NOT touched** | `apps/web/**`, `packages/contracts/**`, `e2e/**`, `.github/workflows/ci.yml`, `db/connection.ts`, `plugins/static.ts`, `routes/*` | Zero web bytes; no CI edits (3.4); WAL pragmas and static serving are correct as-is |

### Project Structure Notes

- Integration tests live in `apps/api/test/integration/**` (the `integration` vitest project — `apps/api/vitest.config.ts`); they reuse `buildTestApp` from `test/integration/helpers/build-test-app.ts` where an in-process app suffices (logging test), but the crash test necessarily spawns `src/index.ts` instead. Both run in the existing `npm run test:integration` CI step — no CI file changes.
- `scripts/` at repo root does not exist yet — this story creates it for `verify-container.sh`. Keep it out of any workspace's package.json; it's an operator script, not a build step.
- Registration order in `buildServer` is load-bearing and unchanged: helmet → cradle → swagger (onRoute schema collection) → error-handler → routes → static (prod only, last so API routes win). A1/A2 slot into the existing calls; nothing moves.
- Node 24 required for apps/api tests (better-sqlite3 ABI): `nvm use 24`. Fresh worktree: run `npm install` first (module resolution silently walks up to the main checkout otherwise — 3.2 lesson).
- Docker on Keith's machine: works, but `open -a Docker` first (daemon not auto-started).

### References

- [Source: epics.md#Story 3.5 lines 468-480] — the 5 ACs verbatim; epic-3 preamble line 406 ("hardened Docker packaging, durable-volume + crash-recovery verification"); notes 20 (SIGKILL-mid-POST WAL test), 21 (hardened static-serving headers are 3.5's slice of Epic 3), 22 (the static-layer helmet AC deliberately waited for this story), 13 (Epic 1 ships thin deploy, "Epic 3 *hardens* it (security headers, CSP)").
- [Source: architecture.md lines 172-178] — security posture: no auth v1, validation as primary defense, no CORS in prod, "hardening (lightweight)" names helmet on the static-serving layer; line 190 (`GET /health` liveness); lines 205-211 (packaging, `PORT`/`DATABASE_PATH` env config, pino observability, single instance); line 279 (the committed log-level table: info lifecycle / warn recoverable / error 500s; always request id + latency; never full payloads); line 475 (observability is log-level only; metrics/alerting = documented post-MVP hook).
- [Source: docs/prd.md line 207] — NFR-6: failed backend operations must not corrupt the persisted list or silently discard confirmed changes — AC 3's requirement source.
- [Source: 1-11-thin-container-deploy.md] — AC 4 + line 106 + line 130: baseline helmet with CSP OFF, "strict CSP / COEP-CORP tuning → Epic 3 Story 3.5"; line 131 (no Docker-build CI job); line 168 (helmet@13 + 64 KiB bodyLimit as shipped); the Dockerfile design rationale (node:24-slim both stages, tsx runtime, prebuilt better-sqlite3).
- [Source: apps/api/src/server.ts:30-55] — logger comment (reqId/responseTime, bodies never logged), helmet comment naming this story, registration-order comment.
- [Source: apps/api/src/db/connection.ts:16-22] — WAL/NORMAL/busy_timeout/foreign_keys pragmas + mkdir; Dockerfile:53-56 (VOLUME comment: WAL sidecars on the volume).
- [Source: apps/api/src/plugins/awilix.ts:22-32] — `disposeOnClose: true` + `db.close()` disposer: the E-task's graceful-close path already exists below `app.close()`.
- [Source: installed packages, verified 2026-07-14] — `@fastify/helmet` 13.0.2 wrapping helmet 8.2.0 (default header set dumped by executing it — see "What is already built"); `@fastify/swagger-ui` 5.2.6 `staticCSP` mechanism (lib/routes.js:14-43, static/csp.json, no inline scripts in its index.html).
- Code precedents to mirror: `test/integration/hardening.test.ts` + `static-serving.test.ts` (header/serving assertion style, hermetic temp fixtures), `build-test-app.ts` helper, `db/connection.test.ts` (temp-dir DB discipline).

## Previous Story Intelligence (Story 3.3 → 3.5)

- **3.3 merged to main (PR #24)** with review patches. Green baselines this story must keep: web **243 tests / 20 files**, api **49**, e2e **13/13 (5 spec files)**, bundle **92,498 B gz** vs 92,295+512 budget (~309 B headroom — this story must add zero web bytes), contrast 7/7.
- **The recurring live-verification lesson (3.1 → 3.3, now three-for-three):** every story that verified in a real browser before review caught something no test saw (3.3: the `::after` width-reservation defeat). This story's equivalents are A4 (CSP only enforces in a browser) and D2 (docker behavior only exists in docker). Do them BEFORE marking review.
- **Verify the mechanism, not the intention:** 3.3 found a "width reservation" that had never worked because a flex default defeated it. Same class of risk here: a CSP that's present-but-wrong (blocking the app silently), or a CMD that's exec-form but still doesn't get signals — assert observed behavior (console clean, `docker stop` exit time), not config presence.
- **Twice-consecutive e2e runs** before declaring green (parallel workers + shared DB flake convention).
- **Worktree gotcha:** fresh worktree has no `node_modules` — `npm install` under Node 24 first, or module resolution silently walks up to the main checkout.
- **Web `tsc -b` build is stricter than root typecheck** (`noUncheckedIndexedAccess`) — irrelevant unless you touch web (don't), but the same discipline applies to new api test files: run the full gate list, not just `typecheck`.
- **Don't assert what the layer can't observe** (3.2/3.3 lesson generalised): `app.inject()` sees headers but cannot enforce CSP; only A4's browser pass proves the policy doesn't break the app. Split assertions accordingly: header shape in integration tests, enforcement in the live pass.

## Git Intelligence Summary

Recent main: PR #24 (3.3 — a11y-modes e2e gates, reduced-motion min-hold, delete-width CSS fix), PR #23 (3.2 — SR contract, LiveRegion nonce), PR #21 (3.1 — roving tabindex), PR #20 (Playwright harness). No dependency changes since the harness. Branch pattern all of Epic 3: feature branch (`story/3-5-hardened-production-deploy`) → story-file commit → implementation commit(s) → review-fix commit → squash-merge PR. Working from worktree `dev-3-5`, branched at current main (fb7d1f2). Note: Story 3.4 may land on main in parallel — its surface (ci.yml, k6, e2e/CI wiring, web gates) is disjoint from this story's (apps/api, Dockerfile, scripts/), so merge conflicts are not expected; rebase normally if 3.4 merges first.

## Latest Tech Information

Stack fixed and current (July 2026); **zero new dependencies**. Story-relevant specifics, verified against the installed packages 2026-07-14:

- **helmet 8.2.0 default emissions** (via `@fastify/helmet` 13.0.2): CSP (when enabled) `default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' https: 'unsafe-inline'; upgrade-insecure-requests`, plus COOP/CORP `same-origin`, `Origin-Agent-Cluster: ?1`, `Referrer-Policy: no-referrer`, HSTS 1y, nosniff, XFO `SAMEORIGIN`, `X-XSS-Protection: 0`. COEP not emitted by default. The A1 table tightens style/font/img and drops `upgrade-insecure-requests`.
- **`@fastify/swagger-ui` 5.2.6 `staticCSP`:** `true` → builds a policy string from bundled `static/csp.json` script/style hashes and sets `content-security-policy` in a plugin-scoped `onSend` hook (`lib/routes.js:14-43`) — overrides helmet on `/docs*` only. Also accepts a string or directive object; `transformStaticCSP(header)` available for surgical edits. Its `static/index.html` loads three external scripts, no inline.
- **tsx v4 loader form:** `node --import tsx <file.ts>` is the documented Node ≥20 single-process invocation (the `tsx` bin itself spawns node as a child — another reason E2 prefers the loader form for PID-1 signal correctness). `createRequire(import.meta.url).resolve('tsx/cli')` is the stable way to locate the CLI for the C-task spawn.
- **SQLite WAL crash semantics:** on reopen after SIGKILL, committed WAL frames are replayed, uncommitted frames discarded; `PRAGMA integrity_check` returning `ok` is the corruption oracle. `journal_mode=WAL` persists in the DB file; `synchronous=NORMAL` under WAL is process-crash-safe (its residual window is power/OS failure only).
- **npm as Docker PID 1** is a long-standing anti-pattern: npm intercepts but does not reliably forward SIGTERM, so `docker stop` waits the full grace period then SIGKILLs. Exec-form CMD with node as PID 1 + an explicit SIGTERM handler is the standard fix (node as PID 1 ignores default-terminate semantics for SIGTERM unless a handler exists — E1 provides it).

## Project Context Reference

- Config: `_bmad/bmm/config.yaml` absent in this repo — paths per CLAUDE.md/BMAD convention: planning artifacts `_bmad-output/planning-artifacts`, implementation artifacts `_bmad-output/implementation-artifacts`, docs `docs/`.
- No `project-context.md` in the repo — epics.md + architecture.md + prd.md + stories 1-11/3-1..3-3 + deferred-work.md are the authoritative context, cited inline above.
- Project memory: **api tests need Node 24** (`nvm use 24` first — better-sqlite3 ABI); **Docker Desktop present but daemon not auto-started** (`open -a Docker`; the 1.11 image was verified end-to-end 2026-07-01); **code review is run externally by Keith** — mark review and stop, don't self-review.

## Story Completion Status

Ultimate context engine analysis completed — comprehensive developer guide created. Status: ready-for-dev.

### Open questions / scope confirmations for Keith (non-blocking — sensible defaults chosen)

1. **`/docs` stays enabled in prod under its own swagger-ui `staticCSP`** (the global CSP stays strict; swagger-ui's encapsulated hook owns its routes). Alternatives — hand-written static policy string, or disabling `/docs` in prod — only if the browser pass finds breakage. Flag if you'd rather kill `/docs` in the production image outright.
2. **Graceful shutdown is IN by default** (SIGTERM handler + exec-form `node --import tsx` CMD): no AC names it, but "operated and recovered safely" + `docker stop` currently hitting the 10s SIGKILL path makes it the spirit of the story, and it's ~10 lines. Flag to drop it if you want the story strictly AC-literal.
3. **Container verification stays a committed script + recorded manual run** (`scripts/verify-container.sh`), not a CI job — consistent with 1.11's explicit "no Docker CI job" and with 3.4 owning all CI changes. Flag if you want a docker smoke job added to CI (then it should be specified into 3.4, not built here).
4. **CSP applies unconditionally** (all environments, not prod-gated) so integration tests inherit it — one behavior, one test surface. Flag if you want it prod-only.

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5) via Claude Code, 2026-07-14.

### Debug Log References

- **Crash-test spawn shape corrected mid-story (the one real bug found):** the story-suggested `spawn(node, [tsx/cli, 'src/index.ts'])` makes the tsx bin re-spawn node as a *grandchild*, so SIGKILL killed only the wrapper — the real server survived, kept the port, and answered the "restarted" health probe, silently voiding the whole crash test (observed live: 3 orphaned servers after green runs). Fixed to the single-process loader form `spawn(node, ['--import', <resolved tsx loader URL>, <abs index.ts>])` — the same invocation shape as the new Dockerfile CMD — plus a `waitForDown()` guard assertion that `/health` actually stops answering after the kill, so this failure mode can never pass silently again.
- Entrypoint path in the spawn is resolved absolutely via `import.meta.url` so the test passes both under `npm run test:integration` (cwd `apps/api`, the CI shape) and `npx vitest --root apps/api` from the repo root.

### Completion Notes List

- **AC 1 (strict CSP)** — `server.ts` helmet now registers the full explicit directive table (`useDefaults: false`) from Dev Notes: everything `'self'`, `script-src-attr`/`object-src` `'none'`, `frame-ancestors 'none'` with `xFrameOptions: { action: 'deny' }` aligned, no `upgrade-insecure-requests`. Applied unconditionally. `plugins/swagger.ts` adds `staticCSP: true` so `/docs` gets swagger-ui's own policy via its encapsulated onSend hook. Tests assert the parsed directive set on `/health` (hardening) and on the static `GET /` (static-serving), plus a `/docs` differs-from-global case and a COOP/CORP-on/COEP-off posture lock (the resolved 1.11 "COEP/CORP tuning": helmet defaults kept, COEP stays off — nothing needs cross-origin isolation).
- **AC 1 browser pass (A4)** — real `apps/web` build served by the API, opened in Chromium: app renders, todo create works, **zero console messages** — no CSP violations, and no `data:` URI widening was needed. `/docs`: swagger-ui **renders fully and try-it-out executes** (GET /health → 200 `{"status":"ok"}`). One console error on /docs only: the swagger-ui bundle injects an inline `<style>` whose hash is not in 5.2.6's shipped `csp.json` (upstream ships empty hash arrays). Functionally intact → per the story's decision rule ("fallback ONLY if broken"), `staticCSP: true` stands; recorded as a known cosmetic upstream artifact, revisit only if a swagger-ui upgrade regresses further.
- **AC 4 (committed log levels)** — `error-handler.ts` logs recoverable 4xx at `warn` with safe fields only (`{ statusCode, code }` + message; never `error.validation`, never the body) in both the error handler's <500 branch and the not-found handler; the ≥500 `request.log.error(error)` branch is untouched. New `logging.test.ts` builds the app with a captured pino stream and locks: every line parses as JSON; lifecycle completion line carries `reqId` + numeric `responseTime`; validation-400 and 404 each emit exactly one level-40 line; forced 500 emits level-50; a sentinel description POSTed in a body (success path AND validation-failure path) appears in **zero** log lines.
- **AC 5** — `/health` 200 `{status:"ok"}` liveness asserted explicitly in logging.test.ts (lifecycle-only logs, no warn/error), doubles as the readiness poll in the crash test and the orchestrator-probe shape in the container script.
- **AC 3 (SIGKILL/WAL proof)** — `crash-recovery.test.ts` spawns the real `src/index.ts`, confirms a baseline 201, fires a 20-POST burst, SIGKILLs with the WAL sidecar asserted present (un-checkpointed), then proves both layers: direct better-sqlite3 reopen → `PRAGMA integrity_check` = ok; full restart on the same `DATABASE_PATH` → list valid, baseline + every pre-kill-201 row present, all rows shape-intact (no torn rows). Hygiene: `mkdtemp` per run, kill+await in `afterEach`, deadline polling (no fixed sleeps), verified no orphaned processes; whole suite adds ~1s to `test:integration`.
- **AC 2 (scripted container verification)** — new `scripts/verify-container.sh` (POSIX sh, self-cleaning, `--keep` escape hatch). **Recorded real run 2026-07-14 (Keith's machine, Docker Desktop):** image built (sha256:e27a23b2…); `/health` 200; container-served CSP matched A1's policy exactly (`curl -sI` spot-check inside the script); POST → `docker stop` → `docker start` → todo persisted; `docker kill` (SIGKILL) → restart → list intact; **`docker stop` took 0s** (graceful path — pre-E2 this hit the 10s grace-period SIGKILL). ALL CHECKS PASSED.
- **E (graceful shutdown, default-IN confirmed built)** — `index.ts` registers SIGTERM/SIGINT → `app.close()` → awilix `db.close()` disposer checkpoints the WAL → `exit(0)`, double-fire-guarded. Dockerfile CMD is now exec-form `["node", "--import", "tsx", "apps/api/src/index.ts"]` so PID 1 is node (npm never reliably forwarded signals). New SIGTERM integration test locks exit-code-0 + row-durable behavior; the crash test keeps SIGKILL (E3) — uncatchable by design, verified still green after the handler landed.
- **Full gates (F)** — Node 24: typecheck ✓; api unit 18 ✓; api integration **42** ✓ (was 31; +11: 3 CSP + 1 static-CSP + 5 logging + 2 crash/sigterm); web **243** ✓ untouched; lint:css ✓ + selftest 14/14 ✓; contrast 7/7 ✓; web build + size gate ✓ **92,498 B gz** (identical to 3.3 baseline — zero web bytes added); e2e **13/13 twice consecutively** ✓; no orphaned test processes.
- **Open questions resolved as defaulted (none flagged):** /docs stays enabled under its own staticCSP; graceful shutdown shipped; container verification stays scripted+manual (no CI job); CSP unconditional. No deferred-work.md items consumed or added.

### File List

- apps/api/src/server.ts (modified — helmet strict CSP directive table + xFrameOptions deny)
- apps/api/src/plugins/swagger.ts (modified — staticCSP: true)
- apps/api/src/plugins/error-handler.ts (modified — warn-level 4xx logging, safe fields only)
- apps/api/src/index.ts (modified — SIGTERM/SIGINT graceful shutdown)
- Dockerfile (modified — exec-form `node --import tsx` CMD + comment)
- apps/api/test/integration/hardening.test.ts (modified — CSP directive set, XFO, COOP/CORP/COEP posture, /docs override)
- apps/api/test/integration/static-serving.test.ts (modified — static `GET /` carries the strict CSP)
- apps/api/test/integration/helpers/csp.ts (new — shared parseCsp + committed directive set)
- apps/api/test/integration/logging.test.ts (new — committed levels + never-log-payloads lock, AC 4/5)
- apps/api/test/integration/crash-recovery.test.ts (new — SIGKILL/WAL proof + SIGTERM graceful-exit test, AC 3/E)
- scripts/verify-container.sh (new — scripted container durability/CSP/probe verification, AC 2)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — status transitions)
- _bmad-output/implementation-artifacts/3-5-hardened-production-deploy.md (modified — this file)

## Change Log

- 2026-07-14: Story 3.5 implemented (dev-story). Strict CSP landed at the static-serving layer (explicit helmet directive table, swagger-ui staticCSP owns /docs; verified in a real browser — zero app CSP violations, /docs functional); recoverable 4xx now log at warn with a never-log-payloads integration lock; SIGKILL/WAL crash-recovery proven via a real child-process integration test (spawn shape corrected from tsx/cli wrapper to single-process `node --import tsx` after the wrapper form was caught passing vacuously); graceful shutdown (SIGTERM/SIGINT → app.close) + exec-form Dockerfile CMD shipped and container-verified (`docker stop` 0s, was 10s-timeout kill); `scripts/verify-container.sh` committed with a recorded passing run. All gates green (api 18+42, web 243, e2e 13/13 ×2, size gate unchanged at 92,498 B gz). Status → review.
- 2026-07-14: Story 3.5 created (create-story). Scope: hardening + verification — strict CSP at the static-serving layer (helmet directive table + swagger-ui staticCSP for /docs; the 1.11 deferral lands), warn-level logging for recoverable 4xx + never-log-payloads integration lock, SIGKILL/WAL crash-recovery child-process integration test (epic note 20), scripted docker volume stop/restart verification, graceful shutdown (SIGTERM → app.close) + exec-form CMD (default-in, flagged). No CI changes (3.4 owns all CI work; new tests ride the existing test:integration step). Created out of order while 3.4 remains backlog (parallel track, Keith's call). Status → ready-for-dev.
