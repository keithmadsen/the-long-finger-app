---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-06-15'
amendedAt: '2026-06-15'
amendmentNote: 'Frontend mutation model changed from optimistic-UI to honest-pending (UX-DR15) to resolve a conflict with the UX spec, surfaced during epic/story planning. TanStack Query machinery (onMutate/snapshot/onError rollback/onSettled invalidate, client-generated UUIDv7) is unchanged — only the rendered semantics of the in-flight state differ (pending, not done). See Frontend Architecture, Process Patterns, and Enforcement Guidelines.'
inputDocuments:
  - docs/prd.md
  - _bmad-output/planning-artifacts/prds/prd-the-long-finger-2026-05-25/validation-report.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
workflowType: 'architecture'
project_name: 'the long finger'
user_name: 'Keith'
date: '2026-06-13'
---

# Architecture Decision Document

## Project Context Analysis

### Requirements Overview

**Functional Requirements (10).** The PRD specifies a single-domain CRUD-style API and view layer:

- **FR-1, FR-2, FR-7:** View / distinguish status / loading state — the list view and its empty / loading variants.
- **FR-3:** Create with 1–200 character validation.
- **FR-4, FR-5:** Toggle complete / uncomplete via PATCH.
- **FR-6:** Hard delete (no soft-delete per NG-6).
- **FR-8:** Recoverable error states for initial load and all mutations.
- **FR-9:** Durable persistence across refresh and restart.
- **FR-10:** Four REST endpoints: `GET /todos`, `POST /todos`, `PATCH /todos/{id}`, `DELETE /todos/{id}`.

**Non-Functional Requirements (6).** Several are tightened by the UX spec:

- **NFR-1 (Responsiveness ≤300 ms after backend response):** UX spec adds p50 submit latency ≤100 ms and p95 ≤800 ms — this binds backend choice, deployment region, and middleware.
- **NFR-2 (Initial load <1 s for up to 100 items):** UX spec adds TTI ≤1 s on slow 3G — binds frontend payload (no webfonts, no heavy libraries) and backend cold-start behaviour.
- **NFR-3 (Accessibility):** WCAG 2.2 Level AA target (UX spec). Mostly frontend concern; backend needs only deterministic responses.
- **NFR-4 (Responsive layout 320 px–desktop):** Frontend concern; single 640 px breakpoint per UX spec.
- **NFR-5 (Maintainability):** Frontend, backend, and persistence separated so API can be tested independently from UI. Clean-architecture layering (handlers → services → domain → repositories) aligns naturally; the project includes a `clean-architecture` skill suggesting this pattern is preferred.
- **NFR-6 (Reliability):** No data loss or corruption on failed operations. Durable storage with atomic writes per item.

**Non-Goals (7).** All seven reduce architecture complexity:

- NG-1 / NG-2: no auth, no multi-user → no identity layer, no session management, no per-user data partitioning.
- NG-3: no due dates / priorities / notifications → no scheduling, no push infrastructure.
- NG-4: no search / filter / sort → no search index, no full-text capability.
- NG-5: no offline / cross-device sync → no service worker, no conflict resolution.
- NG-6: no undo / soft-delete → DELETE is permanent; no `deletedAt` field.
- NG-7: no edit-after-create → `description` is write-once at create time; PATCH endpoint only updates `completed`.

### Scale and Complexity

| Dimension | Assessment |
|---|---|
| **Complexity level** | **Low.** Single entity, no auth, no multi-user, single screen, ~100 items per user. |
| **Primary technical domain** | **Full-stack web** — frontend (browser) + thin backend (4 endpoints) + persistence (single table or collection). |
| **Component count (rough)** | Frontend: 4 primitives + 8 recipes (per the UX spec). Backend: ~4 handlers + 1 service + 1 repository. Persistence: 1 table or equivalent. |
| **Cross-cutting concerns** | Latency (p50/p95 budgets bind backend choice), accessibility (frontend), reliability (durable writes), maintainability (clean layering per NFR-5). |
| **Concurrency** | Burst-capture concurrent POSTs supported per UX spec. No backend-side concurrency complexity beyond standard request handling. |
| **Multi-tenancy** | None in v1. PRD §4 explicitly defers, but says "architecture should not block future authentication or multi-user support" — minimal extensibility requirement is to keep persistence behind a small API boundary so future ownership fields can be added without replacing the whole app. |

### Technical Constraints and Dependencies

**Constraints derived from UX work that bind architecture choices:**

- **Backend response p50 ≤100 ms, p95 ≤800 ms** (submit) — eliminates cold-start-prone serverless without warm pools; eliminates cross-region deploys for the v1 target user.
- **TTI ≤1 s on slow 3G** — bounds frontend bundle size and rules out heavy frameworks at the UI layer; the UX spec already committed system fonts + CSS Modules / Tailwind + CSS custom property tokens + no headless library in v1.
- **DELETE idempotency:** backend must return 200/204 for already-deleted items (or the client must treat 404 as success — both acceptable; documenting the contract is the architectural commitment).
- **Concurrent POST tolerance:** backend must accept multiple concurrent creates without serialization that could blow latency budgets.
- **Multi-tab fence:** no server-push (websockets, SSE, polling) in v1. Stale reconciliation is GET-only.
- **No client-side persistence beyond browser session memory:** rules out service-worker offline cache and IndexedDB queueing for v1.

**Constraints carried forward from prior workflow steps:**

- **Stack at the UI layer (per the UX spec):** native HTML + CSS Modules (or Tailwind, developer's choice) + CSS custom property tokens + Radix UI as the named future library (not adopted in v1).
- **Component layer is terminal at v1 scope (per the UX spec):** 4 primitives + 8 recipes; no new components in v1 without explicit architectural decision.
- **Backend has a `clean-architecture` skill in the repo** establishing factory-based clean-architecture layering as the team's preferred backend pattern — adopted (see Starter Template and Core Architectural Decisions).

### PRD Ripples Inherited from UX Work

Two amendments to the PRD were flagged in the UX spec and should be picked up by whoever owns the PRD before story creation begins:

- **FR-5 amendment for hybrid placement:** *"Completed items are visually de-emphasised in place during a session, and sorted below active items on next page load. The canonical order is `completed` first (false before true), then `updatedAt` descending."*
- **FR-3 ripple for visible character limit:** the practical visible character limit (2-line truncation, ~60–90 characters depending on viewport) is shorter than the enforced 200-character submit limit. The PRD should either accept this discrepancy or tighten the submit limit to match the visible threshold.

These are not architecture decisions in themselves but are inputs the architecture should be aware of (the 200-char limit is what the backend validates; the 60–90-char display limit is what the frontend renders).

## Starter Template Evaluation

### Primary Technology Domain

**Full-stack web** — React/Vite SPA frontend + Fastify TypeScript API + SQLite persistence, packaged as a single Docker image. Low complexity: single entity, single screen, ~100 items, no multi-user.

### Starter Options Considered

| Option | What it gives | Why not (as sole starter) |
|---|---|---|
| **Vite `react-ts` template** (official) | React + TypeScript + Vite dev server/build, HMR, `tsconfig`, minimal app shell | ✅ **Adopted for the frontend.** Covers UI layer only — no backend, no DB. |
| **fastify-cli `fastify generate`** | Basic Fastify app skeleton, plugin autoload, `npm test` wiring | Generates a plugin-style app, **not** the handlers→services→domains→repositories CQRS/cradle pattern the repo's `clean-architecture` skill mandates. Would be re-shaped immediately. |
| **T3 / RedwoodJS / Next.js full-stack** | Batteries-included full-stack | Pull in Next/tRPC/Prisma conventions that conflict with the chosen Fastify clean-arch + plain SQLite + REST contract (FR-10). Over-scoped for 4 endpoints. |
| **AWS Lambda starter (cradle)** | The skill's other named shape | Rejected — cold starts threaten NFR-1 (p95 ≤800 ms). |

**Conclusion:** No single template fits. We adopt the **official Vite `react-ts` template for the frontend** and **hand-scaffold the Fastify backend** to the `clean-architecture` skill's pattern. The two live in a workspace-based monorepo.

### Selected Starter: Vite `react-ts` (frontend) + hand-scaffolded Fastify clean-arch (backend)

**Rationale for Selection:** Maximizes alignment with prior decisions — the Vite template is the canonical, maintained React+TS scaffold, while the backend pattern is already specified by the in-repo `clean-architecture` skill, so generating from a mismatched template would cost more than it saves.

**Initialization Command** (versions verified June 2026):

```bash
# --- Monorepo root ---
mkdir the-long-finger && cd the-long-finger
npm init -y                       # root workspace manifest (set "workspaces": ["apps/*"])

# --- Frontend: official Vite React + TypeScript template ---
npm create vite@latest apps/web -- --template react-ts

# --- Backend: hand-scaffolded Fastify + TS (no generator imposes clean-arch) ---
mkdir -p apps/api && cd apps/api
npm init -y
npm install fastify@^5 @fastify/awilix awilix better-sqlite3@^12
npm install -D typescript @types/node vitest tsx
cd ../..
```

**What the scaffold establishes** (rationale detailed in Core Architectural Decisions):

| Dimension | Choice |
|---|---|
| Language & runtime | TypeScript both layers; Node.js 24 Active LTS (runtime + Docker base) |
| Backend | Fastify v5, CQRS-style handlers, `@fastify/awilix` cradle DI |
| Persistence | `better-sqlite3` v12+ behind a repository boundary |
| Frontend | React + Vite; system fonts + CSS custom-property tokens + CSS Modules |
| Testing | Vitest (unit/integration) + Playwright (E2E + contrast gate) |
| Code organization | Workspace monorepo — `apps/web` + `apps/api`; backend layers `routes/ handlers/ services/ domains/ repositories/` |
| Dev experience | Vite HMR (web) + `tsx watch` (api); single `docker build` → API serves built static frontend |

**Note:** Repo initialization is the first implementation story.

**Versions verified (June 2026):** [Vite Getting Started](https://vite.dev/guide/), [create-vite react-ts template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts), [Fastify releases (v5.8.5)](https://github.com/fastify/fastify/releases), [@fastify/awilix](https://www.npmjs.com/package/@fastify/awilix), [better-sqlite3](https://www.npmjs.com/package/better-sqlite3), [node:sqlite background](https://zenn.dev/hiruno_tarte/articles/node-builtin-sqlite?locale=en), [Node.js 24 LTS](https://nodejs.org/en/blog/release/v24.14.0).

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):** Validation library (TypeBox), entity ID strategy (UUIDv7), persistence schema + access pattern, API contract (endpoints, status codes, error envelope, DELETE idempotency), frontend server-state library (TanStack Query v5).

**Important Decisions (Shape Architecture):** Honest-pending UI with rollback machinery (supersedes the earlier optimistic-UI decision — see Frontend Architecture), client-generated IDs, structured logging/observability, CI test gates, container build shape.

**Deferred Decisions (Post-MVP):** Authentication/authorization (NG-1/NG-2 — boundary kept open via repository + ownership-ready schema), `node:sqlite` swap (await stable), rate limiting (not required at single-user scale), CDN asset delivery, multi-instance scaling.

### Data Architecture

**Entity — `todo` (single table):**

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (PK) | **UUIDv7**, client-generated via `uuid` pkg `v7()`. Time-sortable; enables idempotent create + the honest-pending row carrying its final id. |
| `description` | TEXT | 1–200 chars (FR-3), validated at API boundary. Write-once (NG-7). |
| `completed` | INTEGER (0/1) | Boolean; only mutable field via PATCH (NG-7). |
| `created_at` | TEXT | ISO-8601, server-set. |
| `updated_at` | TEXT | ISO-8601, server-set on every write. |

- **ID strategy: UUIDv7**, generated client-side and sent in the POST body. Benefits: stable pending-create id (no id swap on reconcile), idempotent retries (same id ⇒ no duplicate), future multi-instance safety. Server still validates format.
- **Validation: TypeBox** — one schema set emits both Ajv-compiled runtime validation (Fastify-native) *and* TypeScript types *and* the OpenAPI document. ~22× faster than Zod in benchmarks; no adapter needed.
- **Migrations:** startup `CREATE TABLE IF NOT EXISTS` (one table, no migration tool warranted in v1). A migrations directory is left as the documented extension point if the schema grows.
- **Caching:** none — SQLite local reads meet NFR-1/NFR-2 directly; a cache would add staleness risk for no latency gain.
- **Canonical ordering** (per PRD FR-5 amendment): repository returns rows ordered `completed ASC` (active before completed), then `updated_at DESC`.

### Authentication & Security

- **No authentication / authorization in v1** (NG-1, NG-2). Extensibility preserved: repository boundary + room for an `owner_id` column means auth can be layered without restructuring.
- **Primary defense = input validation** at the API boundary via TypeBox/Ajv (rejects malformed/oversized payloads; 200-char cap enforced server-side per FR-3).
- **CORS:** not required in production (frontend + API served same-origin from one container). Dev-only permissive CORS for the Vite dev server origin.
- **Hardening (lightweight):** sensible Fastify defaults — body size limit, `@fastify/helmet` for baseline security headers on the static-serving layer.
- **Rate limiting / encryption-at-rest:** deferred — no untrusted multi-tenant exposure at v1 scale.

### API & Communication Patterns

**Style:** REST, four endpoints (FR-10). OpenAPI generated from TypeBox schemas via `@fastify/swagger`.

| Endpoint | Success | Body / Notes |
|---|---|---|
| `GET /todos` | 200 | `Todo[]` in canonical order. |
| `POST /todos` | 201 | Body `{ id: uuidv7, description }` → returns created `Todo`. Idempotent on `id`. |
| `PATCH /todos/{id}` | 200 | Body `{ completed: boolean }` only (NG-7). 404 if absent. |
| `DELETE /todos/{id}` | 204 | **Idempotent** — returns 204 whether or not the row existed. |
| `GET /health` | 200 | Liveness probe for container orchestration. |

- **Error envelope:** uniform shape (defined in Implementation Patterns › Format Patterns). Status codes: 400 validation (with field `details`), 404 not-found (PATCH on missing id), 500 unexpected. Maps to FR-8 recoverable client states.
- **Concurrent POST tolerance:** stateless handlers + per-statement SQLite writes; client-generated ids avoid create contention.
- **No server push** (NG-5): multi-tab staleness reconciled by TanStack Query refetch-on-focus (GET-only).

### Frontend Architecture

- **Server state: TanStack Query v5** — `useQuery` for the list, `useMutation` for create/toggle/delete. Provides retry, error surfaces (FR-8), and refetch-on-focus for multi-tab reconciliation out of the box. ~13 KB gzip — within the TTI ≤1 s / slow-3G budget given the otherwise-lean bundle (no webfonts, no headless lib).
- **Honest-pending with rollback machinery (NOT optimistic):** create, toggle, and delete write a *pending* state to the cache immediately (`aria-busy` at t=0, visual pending cue delayed to the ~150 ms flicker threshold per UX-DR15) and roll back on error — the item is shown as **pending, not as done**, until the backend confirms. This supersedes the earlier optimistic-UI decision: the UX spec commits honest-pending as non-negotiable for v1, and the PRD requires the backend to persist before the UI treats an item as confirmed (FR-3). The TanStack Query machinery is unchanged; only the *visual semantics* of the cache write differ (pending vs. done). Client-generated UUIDv7 still gives the pending row its final id (no temporary-id reconciliation). Perceived responsiveness comes from the sub-150 ms settle backed by the p50 ≤100 ms latency budget — not from rendering unconfirmed state as confirmed.
- **Local UI state:** React `useState`/`useReducer` for form input + transient view state (e.g. in-session completed de-emphasis per FR-5 amendment). No global state library needed.
- **Routing:** none — single screen (no router dependency, smaller bundle).
- **Component architecture:** the 4 primitives + 8 recipes fixed by the UX spec; no new components in v1 without an explicit decision.
- **Performance:** Vite code-split is unnecessary at this size; ship one small bundle, system fonts, CSS-token theming.

### Infrastructure & Deployment

- **Packaging:** single multi-stage Docker image (Node 24 LTS base). Stage 1 builds `apps/web` (Vite) and compiles `apps/api` (tsc); final stage runs Fastify, which **serves the built static frontend** via `@fastify/static`. One origin, one deployable.
- **Config:** environment variables — `PORT`, `DATABASE_PATH` (SQLite file on a mounted volume for durability across container restarts, satisfying FR-9).
- **CI/CD:** GitHub Actions — type-check, Vitest (unit/integration), Playwright (E2E + contrast-regression gate committed in the UX spec) on every PR.
- **Observability:** Fastify's built-in **pino** structured logging; per-request latency logged so the NFR-1 p50/p95 budgets can be validated against real traffic. Health endpoint for liveness. Error tracking integration left as a documented hook.
- **Scaling:** single instance (v1 single-user). Horizontal scaling is out of scope but not blocked — would require moving SQLite to a networked DB (the repository boundary makes this a contained change).

### Decision Impact Analysis

**Implementation Sequence:**
1. Repo init (monorepo + Vite template + Fastify scaffold) — *first story*.
2. SQLite schema + repository (TypeBox `Todo` schema, `CREATE TABLE IF NOT EXISTS`, canonical-order query).
3. API layer — 4 endpoints + health, error envelope, OpenAPI, DELETE idempotency.
4. Frontend shell — TanStack Query client, list view, loading/empty/error states.
5. Mutations — honest-pending create/toggle/delete with rollback.
6. Docker multi-stage image + GitHub Actions gates.

**Cross-Component Dependencies:**
- **UUIDv7 spans client + server** — same `uuid` pkg `v7()` on both; the POST contract accepts the client id, enabling both the honest-pending create (the pending row already has its final id) *and* idempotent retry.
- **TypeBox schemas are the single source of truth** — runtime validation, TS types (shared client/server contract types), and OpenAPI all derive from them.
- **TanStack Query rollback depends on the uniform error envelope** — consistent error shape lets one mutation-error handler drive all FR-8 recovery states (the honest-pending rollback uses the same machinery as an optimistic one would).
- **SQLite file persistence depends on a mounted Docker volume** — FR-9 durability is a deployment-config dependency, not just a code one.

**Versions verified (June 2026):** [TanStack Query v5 (5.101.0)](https://www.npmjs.com/package/@tanstack/react-query), [TypeBox vs Zod for Fastify](https://www.pkgpulse.com/guides/zod-vs-typebox-2026), [uuid package v7 generator](https://www.npmjs.com/package/uuid).

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 6 areas where AI agents could otherwise diverge — JSON casing, layer placement, file naming, test location/separation, error/loading handling, and honest-pending-mutation flow. Most backend conventions are inherited verbatim from the repo's `clean-architecture` skill (the canonical source for layer rules).

### Naming Patterns

**Database (SQLite):**
- Tables: plural snake_case — `todos`.
- Columns: snake_case — `created_at`, `updated_at`, `completed`.
- Primary key: `id` (TEXT, UUIDv7).

**API:**
- Resource paths: plural — `/todos`, `/todos/:id` (Fastify route param syntax `:id`).
- JSON payload fields: **camelCase** — `createdAt`, `updatedAt`. Translation to/from snake_case happens **only** in the repository mapper (clean-arch "mapper delegation"); no casing logic leaks into services, domains, or handlers.
- Headers: standard `Kebab-Case` (`Content-Type`); no custom headers in v1.

**Code:**
- Backend files: kebab-case with role suffix per the skill — `todo.route.ts`, `create-todo.handler.ts`, `todo.service.ts`, `todo.domain.ts`, `todo.repository.ts`.
- Frontend component files: PascalCase — `TodoList.tsx`, `TodoItem.tsx`; hooks camelCase — `useTodos.ts`.
- Functions/variables: camelCase. Types/interfaces: PascalCase. TypeBox schemas: `todoSchema`, derived type `Todo`.
- No `create`-prefix on factory function names (skill rule) — the factory is named for what it produces (`todoService`, not `createTodoService`).

### Structure Patterns

**Project organization:** workspace monorepo — `apps/web` (React/Vite), `apps/api` (Fastify clean-arch). Backend layers in sibling dirs: `routes/ handlers/ services/ domains/ repositories/`.

**Test placement (resolved):**
- Unit: co-located `src/**/*.test.ts`.
- Integration: `apps/api/test/integration/**/*.test.ts`.
- E2E: `apps/web/e2e/**/*.spec.ts` (Playwright).
- A Vitest workspace defines separate `unit` and `integration` projects so CI runs them independently.

**Shared contract types:** TypeBox schemas + derived types live in a shared location (`packages/contracts` or `apps/api/src/contracts`) importable by both apps — one source of truth for request/response shapes.

### Format Patterns

- **No response envelope on success** — endpoints return the resource directly (`Todo` / `Todo[]`), not `{ data: ... }`. Keeps the contract minimal (FR-10).
- **Error envelope (uniform):** `{ "error": { "code": string, "message": string, "details"?: object } }` — the *only* error shape, on every non-2xx.
- **Dates:** ISO-8601 UTC strings in all JSON. Booleans: JSON `true`/`false` (stored as `0`/`1`, converted in the mapper only).
- **Null vs absent:** omit absent optional fields rather than sending `null`.

### Communication Patterns

- **Command/event naming (Fastify CQRS):** commands `createTodoCommand`, events `createTodoEvent` (verb-noun + suffix), per the skill's handler shape.
- **Frontend state updates:** immutable only — never mutate TanStack Query cache objects directly; use `setQueryData` with new references.
- **Query keys:** stable, array-form — `['todos']` for the list. All mutations pending-update then invalidate this single key.
- **Logging:** pino structured JSON. Levels — `info` request lifecycle, `warn` recoverable (validation/404), `error` unexpected 500s. Always log request id + latency; never log full payloads.

### Process Patterns

- **Validation timing:** at the API boundary only, via TypeBox/Ajv. Domains/services trust their inputs (already validated). No re-validation downstream.
- **Honest-pending mutation flow (mandatory shape, all three mutations):** `onMutate` → cancel in-flight queries → snapshot → apply a **pending-state** cache update (the row/field renders as pending with `aria-busy="true"`, *not* as already-done) → `onError` roll back to snapshot → `onSettled` invalidate `['todos']`. Client generates the UUIDv7 for create so the pending row already has its final id. (This is the honest-pending model of UX-DR15; it replaces the previously-specified optimistic update. The flow shape and error-envelope dependency are identical — only the rendered semantics of the in-flight state change.)
- **Loading states:** TanStack Query `isPending` / `isError` drive UI; per-view local state, no global spinner. Each of the three FR-8 surfaces (initial-load error, mutation error, empty) is an explicit branch.
- **Error boundary:** one React error boundary at the app root for render-time faults; expected API errors are handled inline via query/mutation state (not thrown to the boundary).

### Enforcement Guidelines

**All AI Agents MUST:**
- Place logic in the correct layer per the `clean-architecture` skill (domains decide/compute, services orchestrate I/O, repositories do data access only, handlers stay thin) — the skill is authoritative; consult it before writing backend code.
- Derive every request/response type from the shared TypeBox schema — never hand-write a parallel type.
- Confine snake_case ↔ camelCase translation to the repository mapper.
- Follow the mandatory honest-pending mutation shape above for all mutations (pending-state cache write, not optimistic; see Process Patterns).
- Co-locate unit tests; put integration tests in `test/integration/`.

**Layer-ownership seams (pinned during story planning — resolve these consistently):**
- **PATCH not-found → 404 mapping** lives in the **handler** orchestration: the repository reports absence (e.g. returns null / zero rows), and the handler maps that to a 404 via the error envelope. It is NOT a repository throw and NOT a domain decision.
- **Timestamp stamping** (`created_at` on insert, `updated_at` on every write) is done **server-side in the repository** (or a service), never via `Date.now()` inside a domain function (domains stay pure — see the anti-pattern example above). Client-supplied timestamps are ignored.
- **Canonical-order authority** is the **repository SQL query** (`completed ASC, updated_at DESC`). Any in-memory `canonicalOrder()` helper and the frontend `<TodoList>` render are *derivative* — they trust the query order and must not re-implement a competing sort.
- **`POST /todos` idempotency:** a request whose client-generated UUIDv7 already exists returns **200 with the existing `Todo`** (not a duplicate, not an error). This makes client retry (including the failed-create Retry path) safe.
- **`DELETE /todos/{id}` returns 204 with no body**, so it is the one endpoint with no representation in `@tlf/contracts` — this asymmetry is intentional; do not invent a delete-response schema.
- **Per-row in-flight mutation arbitration** (queueing/blocking a second mutation on a row already mutating; reconciling a delete-vs-toggle race on the same row) lives entirely in the **frontend hooks + `<TodoItem>` state machine**. The synchronous `better-sqlite3` backend is intentionally ignorant of it; no story may claim parallel backend execution.

**Pattern Enforcement:** ESLint + `tsc` in CI; the clean-architecture skill is the review reference; pattern violations are corrected in-PR, and any intentional deviation is recorded as an amendment to this section.

### Pattern Examples

**Good — repository owns the mapping:**
```ts
// todo.repository.ts — the ONLY place casing crosses over
const toDomain = (row) => ({ id: row.id, description: row.description,
  completed: !!row.completed, createdAt: row.created_at, updatedAt: row.updated_at });
```
**Anti-pattern — casing/`completed` coercion leaking into a handler or service** (must live in the mapper).

**Good — domain stays pure:**
```ts
// todo.domain.ts — decision/computation, no I/O
function canonicalOrder(todos) { /* completed asc, updatedAt desc */ }
```
**Anti-pattern — a domain function calling the repository or doing `Date.now()` side effects.**

## Project Structure & Boundaries

### Complete Project Directory Structure

```
the-long-finger/
├── README.md
├── package.json                       # root: { "workspaces": ["apps/*", "packages/*"] }
├── package-lock.json
├── tsconfig.base.json                 # shared compiler options, extended by each workspace
├── .gitignore
├── .dockerignore
├── .env.example                       # PORT, DATABASE_PATH
├── Dockerfile                         # multi-stage: build web + api → run api serving static
├── .github/
│   └── workflows/
│       └── ci.yml                     # typecheck · vitest:unit · vitest:integration · playwright
│
├── packages/
│   └── contracts/                     # single source of truth for the API contract
│       ├── package.json               # name: @tlf/contracts
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── todo.schema.ts         # todoSchema, createTodoBodySchema, patchTodoBodySchema
│           └── error.schema.ts        # errorEnvelopeSchema  → type ErrorEnvelope
│                                       # derived types: Todo, CreateTodoBody, PatchTodoBody
│
├── apps/
│   ├── api/                           # Fastify clean-architecture backend
│   │   ├── package.json               # fastify, @fastify/awilix, awilix, better-sqlite3, uuid, @tlf/contracts
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts           # workspace: { projects: ['unit', 'integration'] }
│   │   ├── src/
│   │   │   ├── index.ts               # entrypoint — listen on PORT
│   │   │   ├── server.ts              # buildServer(): register plugins + routes (reused by tests)
│   │   │   ├── plugins/
│   │   │   │   ├── awilix.ts          # Cradle wiring (repos/services/domains as factories)
│   │   │   │   ├── swagger.ts         # @fastify/swagger from TypeBox schemas
│   │   │   │   ├── static.ts          # @fastify/static → serves apps/web build in prod
│   │   │   │   └── error-handler.ts   # setErrorHandler → uniform error envelope
│   │   │   ├── routes/
│   │   │   │   ├── todos.route.ts      # GET/POST /todos, PATCH/DELETE /todos/:id
│   │   │   │   └── health.route.ts     # GET /health
│   │   │   ├── handlers/
│   │   │   │   ├── create-todo.handler.ts
│   │   │   │   ├── toggle-todo.handler.ts
│   │   │   │   └── delete-todo.handler.ts
│   │   │   ├── domains/
│   │   │   │   ├── todo.domain.ts      # canonicalOrder(), timestamp/string normalization (pure)
│   │   │   │   └── todo.domain.test.ts
│   │   │   ├── repositories/
│   │   │   │   ├── todo.repository.ts  # better-sqlite3 CRUD + snake↔camel mapper
│   │   │   │   └── todo.repository.test.ts
│   │   │   ├── db/
│   │   │   │   ├── connection.ts        # open DB, set WAL + pragmas
│   │   │   │   └── schema.ts            # CREATE TABLE IF NOT EXISTS todos (...)
│   │   │   └── types/
│   │   │       └── cradle.ts            # `Dependencies` (Awilix Cradle) declaration
│   │   └── test/
│   │       └── integration/
│   │           ├── todos.routes.test.ts # routes against real temp-file SQLite
│   │           └── helpers/build-test-app.ts
│   │
│   └── web/                           # React + Vite frontend
│       ├── package.json               # react, @tanstack/react-query, uuid, @tlf/contracts
│       ├── index.html
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── vitest.config.ts
│       ├── playwright.config.ts
│       ├── public/
│       └── src/
│           ├── main.tsx               # root: QueryClientProvider + AppErrorBoundary
│           ├── App.tsx                # single screen (FR-1)
│           ├── lib/queryClient.ts     # QueryClient config (refetchOnWindowFocus on)
│           ├── api/todos.ts           # typed fetch wrappers (@tlf/contracts types)
│           ├── hooks/
│           │   ├── useTodos.ts         # useQuery(['todos'])               (FR-1/2/7)
│           │   ├── useCreateTodo.ts    # honest-pending + client UUIDv7    (FR-3)
│           │   ├── useToggleTodo.ts    # honest-pending toggle             (FR-4/5)
│           │   └── useDeleteTodo.ts    # honest-pending delete             (FR-6)
│           ├── components/
│           │   ├── primitives/         # 4 primitives (per UX spec)
│           │   └── recipes/            # 8 recipes (per UX spec)
│           └── styles/
│               ├── tokens.css          # CSS custom-property tokens
│               └── global.css          # system-font stack, reset
│       └── e2e/
│           └── todos.spec.ts           # Playwright + contrast-regression gate
```

### Architectural Boundaries

**API boundary:** the four REST endpoints (FR-10) + `/health`. Request/response shapes are owned exclusively by `@tlf/contracts`; both apps import from it. No other process touches the SQLite file.

**Layer boundary (backend, per clean-arch skill):** `routes → handlers → (services) → domains / repositories`. Direction is strictly inward: handlers call domains/repos via the Cradle; domains never call repos; repos never hold business logic. Services appear only where a handler would otherwise exceed thin orchestration (likely just `create`/`toggle` if at all).

**Data boundary:** `repositories/todo.repository.ts` is the *only* module that imports `better-sqlite3` or knows snake_case. Swapping to `node:sqlite`/Postgres later touches this file + `db/` only.

**Component boundary (frontend):** primitives know nothing of data; recipes compose primitives; only hooks (`useTodos`, `use*Todo`) touch the network via `api/todos.ts`. State flows down via props, mutations up via the hooks.

### Requirements → Structure Mapping

| FR | Lives in |
|---|---|
| FR-1, FR-2, FR-7 (view / status / loading) | `web/src/App.tsx` + `components/recipes/` + `hooks/useTodos.ts` |
| FR-3 (create, 1–200 validation) | `hooks/useCreateTodo.ts` + `routes/todos.route.ts` (POST) + `contracts/todo.schema.ts` |
| FR-4, FR-5 (toggle / ordering) | `hooks/useToggleTodo.ts` + `handlers/toggle-todo.handler.ts` + `domains/todo.domain.ts` (canonicalOrder) |
| FR-6 (hard delete) | `hooks/useDeleteTodo.ts` + `handlers/delete-todo.handler.ts` (idempotent 204) |
| FR-8 (recoverable errors) | `plugins/error-handler.ts` (envelope) + per-hook `onError` + `AppErrorBoundary` |
| FR-9 (durable persistence) | `db/connection.ts` + `db/schema.ts` + Docker volume on `DATABASE_PATH` |
| FR-10 (4 endpoints) | `routes/todos.route.ts` |

**Cross-cutting:** validation → `@tlf/contracts` (TypeBox) at the route boundary · observability → pino (Fastify default) + `/health` · API docs → `plugins/swagger.ts`.

### Integration Points & Data Flow

- **Dev:** Vite dev server (`apps/web`) proxies `/todos`,`/health` to the Fastify process (`apps/api`) on `tsx watch`. Two processes, one logical origin via proxy.
- **Data flow (mutation):** component → hook `onMutate` (pending-state cache write) → `api/todos.ts` fetch → route → handler → domain/repository → SQLite; `onError` rolls back, `onSettled` invalidates `['todos']`.

(Prod packaging and the Dockerfile build stages are specified in Core Architectural Decisions › Infrastructure & Deployment.)

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** The full dependency set is mutually compatible at verified versions — Fastify v5 (Node 20+) on Node 24 LTS, `better-sqlite3` v12 (Node 24 prebuilts), TypeBox (native Fastify/Ajv), `@fastify/awilix`, `@fastify/swagger`, `@fastify/static`, `@fastify/helmet` on the frontend-serving layer; React + Vite + TanStack Query v5 + `uuid` v7. No version or runtime conflicts.

**Pattern Consistency:** Patterns reinforce the decisions — camelCase↔snake_case confined to the repository mapper supports the clean-arch boundary; TypeBox-as-single-source aligns validation + types + OpenAPI; the mandatory honest-pending mutation shape is consistent with the client-generated-UUIDv7 decision (the client id lets the pending row carry its final identity); query-key `['todos']` unifies all mutation invalidation.

**Structure Alignment:** The tree realizes every decision — `repositories/todo.repository.ts` is the sole DB-aware module (data boundary), `@tlf/contracts` gives both apps one contract source without cross-app coupling, and the layer directories match the skill's `routes→handlers→services→domains→repositories` flow.

### Requirements Coverage Validation ✅

**FRs (10/10):** all mapped in the Requirements → Structure table; their architectural homes are specified in the Data Architecture, API, and Frontend sections. **NFRs (6/6) and Non-Goals (7/7):** satisfied as documented in their respective Decisions sections. The one coverage caveat is NFR-2 — the TTI/3G bundle budget is met by design but not yet enforced as a CI gate (see Gap Analysis).

### Implementation Readiness Validation ✅

**Decision Completeness:** All critical decisions documented with verified versions and rationale. **Structure Completeness:** complete, specific tree — no placeholders; all integration points (dev proxy, prod static-serve, build stages) specified. **Pattern Completeness:** all six identified conflict points have rules + good/anti-pattern examples; `clean-architecture` skill named as the authoritative backend reference.

### Gap Analysis Results

**Critical Gaps:** None — nothing blocks implementation.

**Important Gaps (recommend addressing, non-blocking):**
1. **PRD ratification of two architecture-introduced contract points** — (a) `POST /todos` accepts a *client-generated* UUIDv7 in the body (enables honest-pending create + idempotent retry); (b) `DELETE` returns 204 even when the row is absent. Both should be reflected back into the PRD/contract by its owner before story creation. *(Coordination item, not an architecture defect.)*
2. **NFR-2 bundle budget is asserted but not enforced** — add a `size-limit`/bundlesize check to `ci.yml` so the TTI budget can't silently regress.

**Minor Gaps (optional):**
3. `better-sqlite3` is synchronous — burst-concurrent POSTs briefly block the event loop; negligible at single-user/~100-item scale, but note WAL + fast single-row writes keep it well inside budget.
4. Observability is log-level only (pino latency + `/health`); metrics/alerting left as a documented post-MVP hook.
5. Schema management is `CREATE TABLE IF NOT EXISTS` with no versioning — fine for one table; `db/` is the documented extension point if it grows.

### Validation Issues Addressed

The two Important items are recorded as handoff/coordination notes (PRD ratification, CI budget gate) rather than reworked here — they don't change any architectural decision, only ratify or enforce existing ones. No decision was found contradictory or incompatible.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION (all 16 checklist items confirmed; no Critical Gaps — the two Important items are coordination/enforcement, not blockers)

**Confidence Level:** High — low-complexity, single-entity scope with verified, mutually compatible choices and a strong in-repo pattern reference.

**Key Strengths:** clean-arch layering with a single DB-aware module; one contract source (TypeBox→validation+types+OpenAPI); honest-pending UX backed by client-generated time-sortable ids; single-container simplicity meeting the latency budget; CI test separation (unit/integration/E2E).

**Areas for Future Enhancement:** auth/multi-user (boundary preserved), `node:sqlite` swap when stable, metrics/alerting, bundle-budget gate, schema-migration tooling if the model grows.

### Implementation Handoff

**AI Agent Guidelines:** follow documented decisions exactly; apply patterns consistently; respect layer/component/data boundaries; treat the `clean-architecture` skill as authoritative for backend code; derive all contract types from `@tlf/contracts`.

**First Implementation Priority:** repo initialization (see Starter Template › Initialization Command and Decision Impact › Implementation Sequence).
