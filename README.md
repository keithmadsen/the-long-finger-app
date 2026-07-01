# The Long Finger

A minimal to-do application. This repository is a **workspace monorepo** with two apps and one shared package:

- `apps/api` — Fastify (v5) backend, clean-architecture layering, `better-sqlite3` persistence behind a repository, dependency injection via an awilix cradle.
- `apps/web` — React + Vite frontend.
- `packages/contracts` — shared API contract types (`@tlf/contracts`).

> **Status:** Story 1.1 — *walking skeleton*. One thin vertical slice (`browser → Vite proxy → Fastify → awilix cradle → repository → on-disk SQLite → back`) is wired end-to-end to prove the architecture. No features beyond that slice exist yet.

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

## Running the container

The app ships as a single multi-stage image (`Dockerfile` at the repo root). The
builder stage installs dependencies and builds the web SPA; the runner stage
serves both the built SPA and the four API routes from **one origin / one port**
via Fastify + `@fastify/static`. There is no Vite proxy and no CORS in
production — the web app's relative `fetch('/todos')` calls resolve same-origin.

Build and run, mounting a named volume so the SQLite database survives restarts:

```bash
docker build -t the-long-finger .
docker run -p 8080:8080 -e PORT=8080 -e DATABASE_PATH=/data/todos.db -v tlf-data:/data the-long-finger
```

Then open `http://localhost:8080` to view, add, and complete/uncomplete tasks.
`GET /health` returns `{"status":"ok"}` and `/docs` serves the OpenAPI UI.

**Config:** the image reads `PORT` and `DATABASE_PATH` from the environment and
ships container defaults (`PORT=8080`, `DATABASE_PATH=/data/todos.db`). `/data`
is declared as a volume; the API creates the parent directory on first boot, so
a fresh volume initialises cleanly.

**Persistence check:** create a task, then stop and restart the container with
the **same** volume — the task is still present:

```bash
docker stop <container>
docker start <container>   # restarts the same container, which already has tlf-data mounted
```

> **Security headers:** the API applies `@fastify/helmet` baseline headers and a
> 64 KiB request-body limit. A strict Content-Security-Policy and hardened
> static-serving headers (COEP/CORP) are intentionally deferred to Epic 3
> Story 3.5 — enabling helmet's default CSP now would break the bundled SPA.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request: install → type-check → Vitest `unit` project → Vitest `integration` project. Any failure blocks merge.

The Docker image build is verified manually (build + run + browser + restart-persistence); it is intentionally **not** part of the per-PR CI gate (CI expansion is owned by Epic 3).
