# The Long Finger

A minimal to-do application. This repository is a **workspace monorepo** with two apps and one shared package:

- `apps/api` — Fastify (v5) backend, clean-architecture layering, `better-sqlite3` persistence behind a repository, dependency injection via an awilix cradle.
- `apps/web` — React + Vite frontend.
- `packages/contracts` — shared API contract types (`@tlf/contracts`).

> **Status:** Feature-complete. Three epics delivered story-by-story with the BMAD method
> (capture/view/complete → safe delete → production readiness): full CRUD with optimistic
> UI and retry-safe idempotent creates, WCAG 2.2 AA conformance with CI-enforced gates,
> and a hardened single-image production deploy. See `_bmad-output/` for the full
> planning and implementation record.

## Prerequisites

- **Node.js 24** (Active LTS) and npm.

## Install

From the repository root:

```bash
npm install
```

This installs every workspace and links them together (no per-workspace install needed).

## Configure

The defaults work without any local configuration:

- `PORT` defaults to `3001`, which is also the port the Vite dev proxy targets.
- `DATABASE_PATH` defaults to `./data/todos.db`, relative to `apps/api`.

To override them, set environment variables in the shell that starts the app:

```bash
PORT=3001 DATABASE_PATH=./data/todos.db npm run dev
```

`.env.example` documents the available variables, but the dev scripts do not load `.env` files automatically. Shell environment variables are inherited by both the API and Vite dev server, keeping the API port and proxy target aligned.

## Run (development)

Start the API and the web dev server together from the root:

```bash
npm run dev
```

This runs two processes in parallel:

- **API** (`apps/api`) — `tsx watch` on `http://localhost:3001`, exposing `GET /health` and `GET /todos`.
- **Web** (`apps/web`) — the Vite dev server (default `http://localhost:5173`).

**The proxy:** the Vite dev server is configured (`apps/web/vite.config.ts`) to proxy `/todos` and `/health` to the Fastify process. This makes both apps a single logical origin in development, so the browser can `fetch('/todos')` with no CORS configuration. Open the web URL and the page fetches and renders the (empty) to-do list — confirming the full round-trip.

Run a single app instead:

```bash
npm run dev:api    # API only
npm run dev:web    # web only
```

## Run (production, Docker Compose)

One image serves the API and the built SPA from a single origin:

```bash
docker compose up -d --build    # http://localhost:8080  (override host port: PORT=9090 docker compose up -d)
docker compose logs -f app      # structured pino logs
docker compose down             # todos persist in the tlf-data volume; add -v to reset
```

An ephemeral instance for testing (tmpfs storage, port 18080):

```bash
docker compose --profile test up -d app-test
docker compose --profile test down
```

The container runs as the non-root `node` user, reports liveness via a Docker
`HEALTHCHECK` against `/health`, and shuts down gracefully on SIGTERM (WAL
checkpoint included). `./scripts/verify-container.sh` proves all of this plus
data durability across stop/start and SIGKILL.

Once healthy, `http://localhost:8080` serves the app; `GET /health` returns
`{"status":"ok"}` and `/docs` serves the OpenAPI UI. A strict
Content-Security-Policy, `@fastify/helmet` baseline headers, and
COEP/CORP-hardened static serving are enforced on every response (Story 3.5)
— see [`docs/security-review.md`](docs/security-review.md) for the full
write-up.

## Test

```bash
npm test                 # all workspace tests
npm run test:unit        # apps/api Vitest "unit" project
npm run test:integration # apps/api Vitest "integration" project
```

The integration test builds the Fastify app against a real temp-file SQLite database (not in-memory) and asserts `GET /todos → 200 []` and `GET /health → 200`.

## Type-check

```bash
npm run typecheck        # tsc --noEmit across all workspaces
```

## Continuous integration

`.github/workflows/ci.yml` runs three parallel jobs on every pull request, each merge-blocking: **`verify`** (type-check → CSS token lint + its self-test → web tests with delete-path coverage thresholds → contrast-regression gate → web build → bundle-size ceiling → API unit → API integration with coverage thresholds), **`e2e`** (the full unfiltered Playwright suite, including the real-browser axe gate and the WCAG forced-colors / reduced-motion / zoom / responsive emulation gates), and **`k6-smoke`** (a loosened-threshold POST-latency tripwire that builds and runs the production Docker image — so the container is exercised on every PR).

## Project documentation

- [Training brief](docs/instructions.md) — the original assignment this project implements
- [PRD](docs/prd.md) · [BMAD implementation narrative](docs/bmad-implementation-narrative.md) · full artifact record in `_bmad-output/`
- [AI integration log](docs/ai-integration-log.md)
- QA reports: [coverage](docs/coverage-report.md) · [security review](docs/security-review.md) · [WCAG conformance matrix](docs/wcag-conformance-matrix.md) · [screen-reader smoke test](docs/screen-reader-smoke-test.md) · [k6 latency sign-off](docs/k6-latency-signoff.md)
