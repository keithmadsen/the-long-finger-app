# Story 1.2: Todo contracts, schema & repository (real read path)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer on the team,
I want the complete shared Todo contract, the SQLite schema, and a repository that returns todos in canonical order from durable storage,
so that both apps share one source of truth and the read path is correct and persistent before any UI consumes it.

## Acceptance Criteria

1. **Given** `@tlf/contracts`, **When** built, **Then** it exports TypeBox schemas `todoSchema`, `createTodoBody`, `patchTodoBody`, `errorEnvelope` and their derived types, importable by both apps (the full surface is defined now even though PATCH/DELETE wire up later). [Source: epics.md#Story-1.2; #Notes-A.3; architecture.md#API-&-Communication-Patterns (AR-4)]
2. **Given** app startup, **When** the database opens, **Then** `CREATE TABLE IF NOT EXISTS todos (...)` runs with `id` TEXT PK, `description` TEXT, `completed` INTEGER, `created_at` TEXT, `updated_at` TEXT **And** WAL + pragmas are set. [Source: epics.md#Story-1.2; architecture.md#Data-Architecture (AR-3)]
3. **Given** todos with mixed completion and update times, **When** the repository lists them, **Then** rows return in canonical order `completed ASC, updated_at DESC`. [Source: epics.md#Story-1.2; #Notes-A.6; architecture.md#Data-Architecture]
4. **Given** the repository, **When** it maps rows, **Then** snake_case↔camelCase translation and the `completed` 0/1↔boolean coercion happen ONLY in the repository mapper, with no leakage into handlers/services/domains. [Source: epics.md#Story-1.2; architecture.md#Architectural-Boundaries, #Naming-Patterns]
5. **Given** `GET /todos`, **When** called, **Then** it returns the canonically-ordered `Todo[]` as camelCase JSON with no success envelope. [Source: epics.md#Story-1.2; architecture.md#Format-Patterns (AR-5)]
6. **Given** the repository is constructed with an injectable database-file path, **When** a test supplies a temp-dir path, **Then** it uses that file without swapping the repository implementation. [Source: epics.md#Story-1.2; #Notes-A.4 — already wired in Story 1.1, must be preserved]
7. **Given** the repository writes a row, **When** it persists, **Then** the server sets `created_at` and `updated_at` (any client-supplied timestamp is ignored) **And** `updated_at` is set on every write. [Source: epics.md#Story-1.2; architecture.md#Process-Patterns, #Data-Architecture]
8. **Given** an `id` that already exists, **When** the repository is asked to insert it again, **Then** it does not create a second row (insert is idempotent on `id`) — the endpoint-level contract for this is asserted in Story 1.7. [Source: epics.md#Story-1.2; architecture.md#Process-Patterns]
9. **Given** todos written to the on-disk file, **When** the api process stops (closing the DB handle / checkpointing WAL) and restarts against the same file, **Then** the todos are still present (FR-9 durability, real file — the handle is closed before the assertion so the read is not served from an in-process cache). [Source: epics.md#Story-1.2; PRD#FR-9; architecture.md#Infrastructure-&-Deployment]
10. **Given** the API, **When** it boots, **Then** `@fastify/swagger` generates an OpenAPI document from the registered TypeBox schemas (the third leg of the AR-4 single-source-of-truth contract) **And** `GET /todos` declares its response as `Todo[]` via `@fastify/type-provider-typebox`, so the schema is enforced at the boundary, not just at compile time. *(Story-added AC, pulling forward Story 1.1's "Swagger → API story 1.2/contracts" note and realizing AR-4's OpenAPI leg now that the contract surface exists.)* [Source: architecture.md#API-&-Communication-Patterns (AR-4); 1-1 story Task 3 note "Swagger/error-envelope → API story 1.2/contracts"]
11. **Given** any request that produces a non-2xx, **When** the API responds, **Then** a single `setErrorHandler` emits the uniform `errorEnvelope` shape `{ error: { code, message, details? } }` (and the not-found path is mapped to the same shape) — verified in-epic by forcing a 500 / hitting an unknown route, since no validation 4xx exists until Story 1.7. *(Story-added AC, pulling forward the error-envelope leg bundled with Swagger in Story 1.1's note; realizes AR-5's "uniform error envelope on every non-2xx" so Stories 1.7/1.8 inherit working machinery.)* [Source: architecture.md#Format-Patterns (AR-5); epics.md#Notes-A.2; #Notes-22]

## Tasks / Subtasks

- [ ] **Task 1 — Author the full `@tlf/contracts` surface (AC: 1)**
  - [ ] Add `@sinclair/typebox@^0.34.49` as a **dependency** of `packages/contracts/package.json` (verified June 2026; see Latest Tech). The package is consumed as **TypeScript source** (`main`/`types`/`exports` all point at `./src/index.ts`, `tsc --noEmit`) — there is no build artifact, so consumers compile the `.ts` directly. Do not add a build step.
  - [ ] Create `packages/contracts/src/todo.schema.ts`: define and export `todoSchema`, `createTodoBody`, `patchTodoBody` as `Type.Object(...)` and their derived types `Todo`, `CreateTodoBody`, `PatchTodoBody` via `Static<typeof ...>`. **Export names must match the AC exactly** (`createTodoBody`/`patchTodoBody`, NOT `…Schema` — the AC text is authoritative over the architecture directory comment). [Source: epics.md#Story-1.2]
    - `todoSchema`: `{ id: string, description: string (minLength 1, maxLength 200), completed: boolean, createdAt: string, updatedAt: string }`. Give it `$id: 'Todo'` so Swagger can register a stable reusable component. `createdAt`/`updatedAt` are ISO-8601 strings. **Do NOT add `format: 'uuid'`/`format: 'date-time'` validation here** — Ajv format keywords need `ajv-formats` registered at the API boundary, which lands with POST validation in Story 1.7. Plain `Type.String()` (with the description length range) is correct for now.
    - `createTodoBody`: `{ id: string, description: string (minLength 1, maxLength 200) }` — client-generated UUIDv7 `id` + the new description. No timestamps, no `completed` (server owns those). [Source: architecture.md#API-&-Communication-Patterns]
    - `patchTodoBody`: `{ completed: boolean }` only — completion is the sole mutable field (NG-7). [Source: architecture.md#API-&-Communication-Patterns]
  - [ ] Create `packages/contracts/src/error.schema.ts`: export `errorEnvelope` = `{ error: { code: string, message: string, details?: unknown } }` and type `ErrorEnvelope`. Give it `$id: 'ErrorEnvelope'` so Swagger can register a stable reusable component. This is the **one and only** error shape (AR-5), and it is both defined and consumed in this story by the error-handler and OpenAPI responses; later mutation endpoints inherit the same shape. [Source: architecture.md#Format-Patterns; epics.md#Notes-A.2]
  - [ ] Rewrite `packages/contracts/src/index.ts` as a barrel that re-exports everything from `./todo.schema.js` and `./error.schema.js`. Remove the `CONTRACTS_PACKAGE` placeholder. Use `.js` extension specifiers in relative imports (the package is `"type": "module"` + `NodeNext`). [Source: packages/contracts/tsconfig.json]
  - [ ] **Prove "importable by both apps" (AC 1):** the API will import `Todo` (repository return type / route). For the web side, type `apps/web/src/App.tsx`'s `todos` state as `Todo[]` instead of `unknown[]` — this is a zero-risk typing change that proves the cross-app import compiles and removes an `unknown`; it is NOT feature work (no rendering change, list UI is Story 1.6). Confirm both `apps/api` and `apps/web` typecheck with the new import. [Source: architecture.md#Architectural-Boundaries — "both apps import from it"]

- [ ] **Task 2 — Real `todos` schema + the skeleton-table migration seam (AC: 2)**
  - [ ] Rewrite `apps/api/src/db/schema.ts` `applySchema(db)` to create the full table:
    ```sql
    CREATE TABLE IF NOT EXISTS todos (
      id          TEXT PRIMARY KEY,
      description TEXT    NOT NULL,
      completed   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    )
    ```
  - [ ] **Handle the id-only → full-table transition explicitly (critical — see Dev Notes "The skeleton-table migration seam").** Story 1.1 shipped `CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY)`. SQLite will **not** add the new columns through `CREATE TABLE IF NOT EXISTS`. Before the `CREATE`, probe `PRAGMA table_info(todos)`; if the table exists **but lacks the `description` column** and its columns are exactly the obsolete skeleton shape (`id` only), `DROP TABLE todos` first, then create the full table. If the table exists with any other unexpected partial shape, throw a clear startup error rather than silently continuing against a corrupt/unknown schema. Do this **only** for the obsolete shape — never drop unconditionally (that would defeat the AC 9 durability test, which writes rows then restarts against the same file). Once the full table exists, the probe finds `description` present and `CREATE TABLE IF NOT EXISTS` is a no-op. [Source: 1-1 story Dev Notes "The SQLite-before-schema seam"; implementation-readiness-report-2026-06-15.md#item-2]
  - [ ] Add a short comment naming `db/` as the documented migration extension point (AR-3); no migration tool in v1.

- [ ] **Task 3 — WAL + pragmas on the connection (AC: 2)**
  - [ ] In `apps/api/src/db/connection.ts`, after opening the `Database` and **before** `applySchema`, set the pragma set via `db.pragma(...)`:
    - `journal_mode = WAL` — concurrent reads during a write; this setting persists in the DB file.
    - `synchronous = NORMAL` — safe from corruption under WAL, faster than FULL (better-sqlite3 even defaults WAL to NORMAL). [Source: Latest Tech]
    - `busy_timeout = 5000` — wait out transient locks instead of erroring.
    - `foreign_keys = ON` — integrity baseline (off by default); cheap to set even though v1 has no FKs.
    - The cache_size / mmap_size / temp_store perf-tuning pragmas are **optional** and not required by any AC — skip unless trivially added; keep the connection minimal for a single-user MVP.
  - [ ] Use `db.pragma('journal_mode = WAL')` (better-sqlite3's pragma API), not `db.exec`. Confirm WAL took effect (e.g. `db.pragma('journal_mode', { simple: true })` returns `'wal'`) in the connection unit/integration coverage.

- [ ] **Task 4 — Repository: canonical list, mapper, idempotent insert, timestamps (AC: 3, 4, 7, 8)**
  - [ ] In `apps/api/src/repositories/todo.repository.ts`, replace the raw `SELECT * FROM todos` skeleton with the real surface. The repository stays the **only** module importing `better-sqlite3` knowledge or touching snake_case. [Source: architecture.md#Architectural-Boundaries]
  - [ ] Add a private `toDomain(row)` mapper — the **single** place casing crosses over and `completed` is coerced: `{ id, description, completed: !!row.completed, createdAt: row.created_at, updatedAt: row.updated_at }`. No mapping logic anywhere else (AC 4). [Source: architecture.md#Pattern-Examples line 310-313]
  - [ ] `listTodos(): Todo[]` — `SELECT * FROM todos ORDER BY completed ASC, updated_at DESC`, map each row via `toDomain`, return `Todo[]`. This is the canonical-order authority; the frontend render and any domain helper are derivative and must not re-sort (AC 3). [Source: epics.md#Notes-A.6; architecture.md#Process-Patterns]
  - [ ] `insertTodo(input: CreateTodoBody): Todo` — **build it now; it is needed for AC 7, AC 8, and to write rows in the AC 9 durability test.** Server stamps `created_at` and `updated_at` to the same `new Date().toISOString()` value; `completed` starts `0`. Any client-supplied timestamp is ignored because `CreateTodoBody` is exactly `{ id, description }`, so there is no field to leak. Idempotent on `id`: `INSERT INTO todos (...) VALUES (...) ON CONFLICT(id) DO NOTHING`, then `SELECT` the row by `id` and return it mapped — so a duplicate insert returns the **existing** row, no second row, no throw (AC 8). [Source: architecture.md#Process-Patterns line 299-301]
  - [ ] **Scope guard:** build the repository methods and unit-test them, but do **NOT** wire `POST`/`PATCH`/`DELETE` routes or handlers — those are Stories 1.7 / 1.8 / 2.x. (Swagger + the error-handler ARE in scope — Tasks 6–7.) The endpoint-level idempotency/timestamp contract (200-with-existing-Todo) is asserted in Story 1.7; here it is a repository unit guarantee. [Source: epics.md#Story-1.2 AC 8; #Notes-B.9]

- [ ] **Task 5 — `GET /todos` returns canonical camelCase Todo[] with a typed response schema (AC: 5, 10)**
  - [ ] `apps/api/src/routes/todos.route.ts` already resolves `todoRepository` from the cradle and returns `listTodos()`. Because the repository now returns mapped, ordered `Todo[]`, the handler body is unchanged — keep it thin (no logic, no DB knowledge, no envelope). Verify the JSON is camelCase and a bare array (no `{ data: ... }`). [Source: architecture.md#Format-Patterns]
  - [ ] Attach the response schema: declare `GET /todos` with `response: { 200: Type.Array(todoSchema) }` so Fastify serializes/validates output against the contract and Swagger can document it. Wire `@fastify/type-provider-typebox@5.2.0` on the instance (`.withTypeProvider<TypeBoxTypeProvider>()`) so the route is typed from the schema. **Caution (Fastify v5):** the type provider split validator/serializer schemas — use the v5-compatible `5.2.0` package because it peers on `@sinclair/typebox >=0.26 <=0.34`; do not install `6.x`, which peers on the different `typebox@^1` package. Response serialization **strips any field not in `todoSchema`**, so the mapper output must match the schema exactly (it does: `id, description, completed, createdAt, updatedAt`). [Source: Latest Tech; architecture.md#API-&-Communication-Patterns]

- [ ] **Task 6 — Error-handler plugin: uniform error envelope (AC: 11)**
  - [ ] Create `apps/api/src/plugins/error-handler.ts`: a plugin calling `app.setErrorHandler(...)` + `app.setNotFoundHandler(...)` to emit the `errorEnvelope` shape from `@tlf/contracts` — `{ error: { code, message, details? } }` — on every non-2xx. Map: validation → 400 with field `details` (wired-but-dormant until a 4xx endpoint exists in 1.7), not-found → 404, else → 500. Log via the existing pino logger; never leak stack traces or payloads in the response body. [Source: architecture.md#Format-Patterns, #Process-Patterns lines 297-305; epics.md#Notes-A.2]
  - [ ] Register the plugin in `server.ts`'s `buildServer()` so it is active for both the live app and tests. Keep it thin — status→envelope mapping is the only logic. The **domain** 404 for *PATCH on a missing id* is owned by the create/toggle handlers later (architecture: "404 mapping lives in the handler orchestration"); this plugin owns only the *transport-level* envelope shape, not domain 404 decisions. [Source: architecture.md#Process-Patterns line 297]

- [ ] **Task 7 — Swagger plugin: OpenAPI from TypeBox (AC: 10)**
  - [ ] Add deps to `apps/api/package.json`: `@fastify/swagger@^9.7.0`, `@fastify/swagger-ui@^5.2.3`, `@fastify/type-provider-typebox@5.2.0`. These are the verified Fastify-5-compatible versions for the selected `@sinclair/typebox@0.34.x` line; do not use `@fastify/type-provider-typebox@6.x` because it peers on the different `typebox@^1` package, and do not drift Swagger UI to a new major inside this story. [Source: Latest Tech]
  - [ ] Create `apps/api/src/plugins/swagger.ts`: register `@fastify/swagger` (OpenAPI 3 doc from route schemas) + optionally `@fastify/swagger-ui` (e.g. served at `/docs` in dev). Register schemas by their `$id` values (`Todo`, `ErrorEnvelope`) so `todoSchema`/`errorEnvelope` appear as reusable components. Register **before** routes in `buildServer()` so route schemas are captured. [Source: architecture.md#API-&-Communication-Patterns; #Complete-Project-Directory-Structure line 362]
  - [ ] Reference `errorEnvelope` as the error response on `GET /todos` so the OpenAPI doc and the Task-6 runtime behavior agree.

- [ ] **Task 8 — Tests (AC: 3, 4, 6, 7, 8, 9, 10, 11)**
  - [ ] **Unit** (`apps/api/src/repositories/todo.repository.test.ts`, co-located): build a repository against an in-process or temp-file DB and assert: canonical ordering with mixed `completed`/`updated_at` fixtures (AC 3); `toDomain` output is camelCase with `completed` as a real boolean and no snake_case keys (AC 4); `insertTodo` stamps `created_at`==`updated_at` and ignores absent client timestamps (AC 7); inserting an existing `id` returns the existing row and leaves the row count unchanged (AC 8). The Story 1.1 trivial unit test in this file should be replaced by these real assertions.
  - [ ] **Integration** (`apps/api/test/integration/todos.routes.test.ts`, extend the existing file): seed rows via the repository, `GET /todos` → `200`, assert the body is canonically ordered camelCase JSON, an array with no envelope (AC 5). Continue building the app via the existing `buildServer({ databasePath })` helper against a **real temp-file** path — do not swap the implementation or use in-memory (AC 6). [Source: apps/api/test/integration/helpers/build-test-app.ts]
  - [ ] **Durability integration test (AC 9 — new):** build the app against a temp-file path, `insertTodo` one or more rows, `await app.close()` (this disposes the awilix cradle → `db.close()` → WAL checkpoint; the handle is closed so no in-process cache serves the read), then build a **fresh** app against the **same** path and `GET /todos` → the rows are present. Assert the file is a real on-disk file, not `:memory:`. [Source: architecture.md#Infrastructure-&-Deployment; epics.md#Notes-A.4]
  - [ ] **OpenAPI assertion (AC 10):** assert the generated OpenAPI doc is reachable (e.g. `app.swagger()` returns a document, or `GET /docs/json` → 200) and that it includes the `GET /todos` path with a `Todo[]` response component. Keep it light — existence + the todos path, not a full snapshot.
  - [ ] **Error-envelope assertion (AC 11):** register a throwing test-only route (or hit an unknown path) and assert the response body is exactly `{ error: { code, message } }` with the right status (500 / 404). This proves the handler in-epic before any real 4xx exists.
  - [ ] Keep the two Vitest projects (`unit`, `integration`) green; this story adds no new CI gates (token-lint/axe/Playwright/bundle remain deferred per Notes C.14). [Source: epics.md#Notes-C.14]

- [ ] **Task 9 — Verify the read path + contract end-to-end**
  - [ ] Run typecheck across all workspaces (contracts, api, web), both Vitest projects, a live `GET /todos` against a seeded DB (canonical order, camelCase, durability across a real process restart), and confirm the OpenAPI doc renders (`/docs`) and a forced error returns the envelope.

## Dev Notes

### Scope guardrail (read first)
This story owns the **read path and the full shared contract — all three legs of AR-4** (TS types, runtime validation, OpenAPI). Deliverables: (1) the complete `@tlf/contracts` TypeBox surface, (2) the real `todos` schema + WAL/pragmas, (3) the repository (canonical list, mapper, idempotent insert, server timestamps), (4) `GET /todos` returning canonical camelCase `Todo[]` with a typed response schema, (5) the FR-9 durability proof, (6) `@fastify/swagger` generating the OpenAPI doc from the TypeBox schemas, (7) the `setErrorHandler` plugin emitting the uniform `errorEnvelope`. **Explicitly NOT in scope:** POST/PATCH/DELETE routes & handlers, TanStack Query, design tokens, primitives, any list/capture UI. Those are Stories 1.3–1.11 / 2.x. The biggest failure mode is over-building the mutation/UI layers — do NOT add command handlers or feature UI. The cross-cutting contract plumbing (Swagger + error-handler) is pulled forward **deliberately** so the mutation stories inherit working machinery (same philosophy as the walking skeleton: stand up plumbing in isolation). When in doubt on the *feature* surface, do less — but the read path + contract must be *correct, durable, and observable*.

### What Story 1.1 left in place (current state of files you will modify)
The walking skeleton is `done`. Read these before editing; they already work end-to-end and must keep working:
- **`packages/contracts/src/index.ts`** — only a `CONTRACTS_PACKAGE` placeholder export. Replace with the real barrel. Package is consumed as **TS source** (no build); `package.json` `exports`/`main`/`types` → `./src/index.ts`, tsconfig is `NodeNext` + `noEmit`. Add `@sinclair/typebox` as a dependency.
- **`apps/api/src/db/schema.ts`** — `CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY)` (id-only skeleton table). The file's own comment warns that 1.2 must handle the column transition. → Task 2.
- **`apps/api/src/db/connection.ts`** — opens a real on-disk `better-sqlite3` DB at the injected `databasePath`, `mkdirSync`s the parent dir, calls `applySchema`. **No pragmas yet.** → Task 3 adds WAL/pragmas before `applySchema`.
- **`apps/api/src/repositories/todo.repository.ts`** — `todoRepository({ db })` factory (no `create` prefix) exposing `listTodos()` that does `SELECT * FROM todos` and returns raw rows as `unknown[]`. → Task 4 makes it real.
- **`apps/api/src/routes/todos.route.ts`** — thin `GET /todos` resolving `todoRepository` from `request.diScope.cradle`, returning `listTodos()`. Body stays the same once the repository returns mapped `Todo[]`.
- **`apps/api/src/plugins/awilix.ts`** — registers `databasePath` (`asValue`), `db` (`asFunction`, SINGLETON, `dispose: (db) => db.close()`), `todoRepository` (`asFunction`, SINGLETON); plugin registered with `disposeOnClose: true`. **This is what makes AC 6 + AC 9 work already** — `app.close()` disposes the cradle and closes the DB handle. Do not change the lifetimes or dispose wiring.
- **`apps/api/src/types/cradle.ts`** — `Dependencies` interface (`databasePath`, `db: Database`, `todoRepository: ReturnType<typeof todoRepository>`) + `@fastify/awilix` `Cradle` augmentation. The `todoRepository` type updates automatically when you add `insertTodo`; no manual edit needed unless you want to tighten `db` typing.
- **`apps/api/test/integration/helpers/build-test-app.ts`** — builds the production app against a temp-file SQLite path and eagerly resolves `app.diContainer.cradle.db` after `app.ready()` (the awilix singleton is lazy, so the file isn't opened until resolved — this also strengthens the AC-6 proof). Reuse this helper; extend the existing `todos.routes.test.ts` rather than duplicating setup.
- **`apps/web/src/App.tsx`** — plain `fetch('/todos')`, state typed `unknown[]`. Re-type to `Todo[]` to prove cross-app import (Task 1); do not add rendering/feature code.

### Backend layer rules (clean-architecture skill is AUTHORITATIVE)
Consult the `clean-architecture` skill (`clean-architecture:clean-architecture`, nearform-skills plugin) before editing the repository — the architecture doc names it the authoritative backend pattern. Rules that bite here:
- **Factory functions named for output, no `create` prefix** (`todoRepository`, not `createTodoRepository`). Methods can be verbs (`listTodos`, `insertTodo`). [Source: architecture.md#Naming-Patterns]
- **The repository is the ONLY module importing `better-sqlite3` or knowing snake_case.** The `toDomain` mapper + `completed` 0/1↔boolean coercion live here and nowhere else (AC 4). No casing/coercion leaks into routes/handlers/services/domains. [Source: architecture.md#Architectural-Boundaries lines 421-423]
- **Layer direction is strictly inward** (`routes → handlers → (services) → domains / repositories`). `GET /todos` is a read, so a thin route resolving the repository from the cradle is acceptable — keep logic out of the route. [Source: architecture.md#Architectural-Boundaries]
- **Server owns timestamps** — `created_at`/`updated_at` are stamped in the repository (or a service), never via `Date.now()` inside a pure domain function. [Source: architecture.md#Process-Patterns line 299]
- **Canonical order authority = the repository SQL query** (`completed ASC, updated_at DESC`). A `canonicalOrder()` domain helper and the frontend `<TodoList>` are derivative and must not re-implement a competing sort. This story does not need the domain helper; the SQL `ORDER BY` is sufficient and authoritative. [Source: architecture.md#Process-Patterns]

### The skeleton-table migration seam (the one real trap in this story)
Story 1.1 deliberately shipped an **id-only** `todos` table so its skeleton `SELECT` would succeed, and flagged (in its Dev Notes and a review fix) that **SQLite will not add columns through a later `CREATE TABLE IF NOT EXISTS`**. Any DB file created by 1.1 (including a developer's local `*.db`) has the id-only table. Your `applySchema` must therefore: probe `PRAGMA table_info(todos)`; if the table exists but has no `description` column, `DROP TABLE todos` then create the full table; otherwise just `CREATE TABLE IF NOT EXISTS`. The drop is safe **only** because the skeleton table never held real data. **Never drop unconditionally** — the AC 9 durability test writes rows then reopens the same file; an unconditional drop on startup would wipe them and fail the AC. `db/` is the documented migration extension point (AR-3); this conditional reset is the v1 stand-in for a migration. [Source: 1-1 story Dev Notes "The SQLite-before-schema seam"; implementation-readiness-report-2026-06-15.md#item-2; architecture.md#Data-Architecture]

### Contract package specifics
- Schemas live in `todo.schema.ts` + `error.schema.ts`, re-exported from `index.ts` (matches architecture's planned file split). [Source: architecture.md#Complete-Project-Directory-Structure lines 342-350]
- Export names are fixed by AC 1: `todoSchema`, `createTodoBody`, `patchTodoBody`, `errorEnvelope` (+ derived `Todo`, `CreateTodoBody`, `PatchTodoBody`, `ErrorEnvelope`). The architecture's directory comment said `…BodySchema`; **the AC names win.**
- `@tlf/contracts` is **append-mostly**: define the full surface now; any later schema revision is an explicit, reviewed event (it also drives the future OpenAPI doc + types). [Source: epics.md#Notes-A.3]
- No success envelope anywhere — endpoints return `Todo`/`Todo[]` directly. The error envelope is the *only* error shape; it is both *defined* (the schema) and *wired* (the `setErrorHandler` plugin, Task 6) here, though its first *validation-4xx* consumer is Story 1.7. [Source: architecture.md#Format-Patterns lines 269-271]

### Swagger + error-handler are pulled forward into this story (decided with Keith, 2026-06-16)
This is the **contracts** story, so it ships **all three legs of AR-4** — TS types, runtime validation, *and* the OpenAPI document — not just the first two. Story 1.1's task list already pointed here ("Swagger/error-envelope → API story 1.2/contracts"); the original draft deferred them, and Keith's call is to pull them forward. Rationale:
- Realizes AR-4's OpenAPI leg now that the schema surface exists, with a real endpoint (`GET /todos`) to document and a typed response to enforce at the boundary.
- The mutation stories (1.7 create, 1.8 toggle) then **inherit working error-envelope + OpenAPI machinery** and only add endpoints — the same "stand up plumbing in isolation" philosophy that justified the walking skeleton.
- Both are **verifiable in-epic** (Note 22): the error handler via a forced 500 / unknown route; the OpenAPI doc via `app.swagger()` / `/docs/json`. No un-testable AC is introduced.
- Scope discipline still holds on the *feature* surface: **no** POST/PATCH/DELETE handlers, no UI. The error-handler's validation-400 branch is wired-but-dormant until 1.7 supplies a body to validate.

### Honest-pending model (context only — no mutation code here)
The architecture was amended (frontmatter `amendmentNote`, 2026-06-15) from optimistic-UI to **honest-pending** (UX-DR15): mutations render *pending*, not done, until the backend confirms; TanStack Query machinery is unchanged. This does **not** touch Story 1.2 (no mutations, no UI) beyond one thing: the contract shapes you define here (`createTodoBody` with client-supplied UUIDv7 `id`, server-owned timestamps/`completed`) are what let the pending row carry its final id later. Define the shapes faithfully; the behavior is Stories 1.7–1.8. [Source: architecture.md frontmatter amendmentNote; #Frontend-Architecture; epics.md#Notes (honest-pending)]

### Testing standards summary
- Unit tests co-located `apps/api/src/**/*.test.ts`; integration in `apps/api/test/integration/**/*.test.ts`; Vitest workspace exposes independent `unit` + `integration` projects (already configured in 1.1). [Source: architecture.md#Structure-Patterns]
- Integration tests build via `buildServer({ databasePath })` against a **real temp-file** SQLite path (never in-memory) using the existing `build-test-app.ts` helper; this is what makes AC 6 + AC 9 honest. [Source: apps/api/test/integration/helpers/build-test-app.ts; epics.md#Notes-A.4]
- This story adds **no new CI gates**. Token-lint / axe / contrast / Playwright / bundle-size remain deferred until the first `apps/web` UI build exists (Notes C.14). [Source: epics.md#Notes-C.14]
- `better-sqlite3` is **synchronous** — writes serialize and are idempotent-on-id; do not write any test or AC claiming *parallel* insert execution. [Source: epics.md#Notes-16]

### Project Structure Notes
- New files: `packages/contracts/src/todo.schema.ts`, `packages/contracts/src/error.schema.ts`, `apps/api/src/plugins/error-handler.ts`, `apps/api/src/plugins/swagger.ts`, plus the AC-9/10/11 test assertions (extend existing integration test or add siblings). All other changes are edits to existing 1.1 files. Paths match `architecture.md#Complete-Project-Directory-Structure` (which already lists `plugins/swagger.ts` and `plugins/error-handler.ts`).
- New deps: `packages/contracts/package.json` → `@sinclair/typebox@^0.34.49`. `apps/api/package.json` → `@fastify/swagger@^9.7.0`, `@fastify/swagger-ui@^5.2.3`, `@fastify/type-provider-typebox@5.2.0`. `apps/api` already has `better-sqlite3 ^12`, `@tlf/contracts *`, `@types/better-sqlite3 ^7`, `vitest ^4`. These pins avoid the incompatible `@fastify/type-provider-typebox@6.x`/`typebox@^1` line and avoid Swagger UI major drift.
- `server.ts`'s `buildServer()` gains two plugin registrations: swagger (before routes) and error-handler. The existing structure (plugins registered, routes registered, `buildServer()` reused by tests, no `listen()`) is preserved.

## Dev Agent Record

### Agent Model Used

### Latest Tech Information (verified June 2026)
- **Dependency pins for this story** — use exactly this compatible set: `@sinclair/typebox@^0.34.49`, `@fastify/swagger@^9.7.0`, `@fastify/swagger-ui@^5.2.3`, `@fastify/type-provider-typebox@5.2.0`. `@fastify/type-provider-typebox@5.2.0` peers on `@sinclair/typebox >=0.26 <=0.34`; `6.x` peers on the different `typebox@^1` package and is not the right line for this story.
- **`@sinclair/typebox`** — latest compatible `0.34.49` (published 2026-03-28). Import shape: `import { Type, type Static } from '@sinclair/typebox'`; define with `Type.Object({...})`, derive types with `Static<typeof Schema>`.
- **`better-sqlite3` pragmas** — recommended production set: `journal_mode = WAL`, `synchronous = NORMAL` (corruption-safe under WAL; better-sqlite3 defaults WAL to NORMAL via `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`), `busy_timeout = 5000`, `foreign_keys = ON`. Optional perf extras (`cache_size = -64000`, `mmap_size`, `temp_store = MEMORY`) are not needed for a single-user MVP. Set via `db.pragma('journal_mode = WAL')`. [Source: https://deepwiki.com/WiseLibs/better-sqlite3/3.4-wal-mode-and-performance-tuning, https://oneuptime.com/blog/post/2026-02-02-sqlite-production-setup/view, https://databaseschool.com/articles/sqlite-recommended-pragmas]
- **Fastify Swagger / type-provider stack (Fastify v5)** — use `app.withTypeProvider<TypeBoxTypeProvider>()` and register `@fastify/swagger` before routes. Fastify v5 split validator/serializer schema types; the `5.2.0` type-provider line is the compatible one for `@sinclair/typebox@0.34.x`. [Source: https://www.npmjs.com/package/@fastify/swagger-ui, https://github.com/fastify/fastify-type-provider-typebox/releases, https://fastify.dev/docs/v5.3.x/Guides/Migration-Guide-V5/]

### Debug Log References

### Completion Notes List

### File List

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.2] — story statement + the 9 ACs.
- [Source: _bmad-output/planning-artifacts/epics.md#Notes] — A.2 (one error taxonomy/envelope), A.3 (complete contracts surface up front, append-mostly), A.4 (injectable DB path → honest FR-9 test), A.6 (canonical order on the read path = FR-1, repository SQL), B.9 (build only what the slice needs), C.14 (defer gates until a web build exists), 16 (better-sqlite3 synchronous, no parallel-write claims).
- [Source: _bmad-output/planning-artifacts/architecture.md#Data-Architecture] — `todos` columns/types, UUIDv7 PK, server-set ISO-8601 timestamps, `completed` INTEGER 0/1, `CREATE TABLE IF NOT EXISTS` + WAL/pragmas, canonical order, `db/` migration extension point (AR-3).
- [Source: _bmad-output/planning-artifacts/architecture.md#API-&-Communication-Patterns] — `GET /todos` → `200 Todo[]`; endpoint shapes for POST/PATCH/DELETE (context only); OpenAPI via `@fastify/swagger` (wired in this story, Task 7) (AR-4/AR-5).
- [Source: _bmad-output/planning-artifacts/architecture.md#Format-Patterns] — no success envelope; uniform error envelope `{ error: { code, message, details? } }`; camelCase JSON; booleans as `0/1` converted in the mapper only.
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming-Patterns, #Structure-Patterns, #Process-Patterns, #Architectural-Boundaries, #Pattern-Examples] — factory naming, file naming, test placement, layer direction, repository-only DB/snake_case boundary, the `toDomain` mapper example, timestamp/canonical-order ownership.
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete-Project-Directory-Structure] — `packages/contracts/src/{todo.schema.ts,error.schema.ts}`, `apps/api/src/{db,repositories}`.
- [Source: _bmad-output/planning-artifacts/architecture.md frontmatter `amendmentNote`; #Frontend-Architecture] — honest-pending supersedes optimistic-UI (context for the contract shapes).
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-06-15.md#item-2] — SQLite-before-schema ordering; the id-only skeleton table transition.
- [Source: _bmad-output/implementation-artifacts/1-1-monorepo-scaffold-walking-skeleton.md] — current state of every file this story modifies; the injectable-DB-path wiring and the `build-test-app.ts` lazy-singleton learning.
- [Source: PRD#FR-1, #FR-9, #FR-10] — canonical-order read, durability across restart, `GET /todos` surface.
- **Authoritative backend pattern:** `clean-architecture` skill (`clean-architecture:clean-architecture`, nearform-skills plugin).

## Change Log

| Date       | Change                                                                 |
|------------|------------------------------------------------------------------------|
| 2026-06-16 | Story 1.2 created — comprehensive context engine analysis; status → ready-for-dev. |
