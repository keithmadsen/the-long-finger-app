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

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request: install → type-check → Vitest `unit` project → Vitest `integration` project. Any failure blocks merge.
