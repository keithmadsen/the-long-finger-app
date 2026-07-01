---
baseline_commit: 750d86fc76d7a79febd61ab972bbe5e6242a50bc
---

# Story 2.1: Delete endpoint & mutation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer on the team,
I want an idempotent delete endpoint and a delete mutation that follows the honest-pending pattern,
so that removal is durable, safe to retry, and consistent with the app's other mutations before any delete UI exists.

## Acceptance Criteria

**Delete endpoint & mutation (from epics.md Epic 2 › Story 2.1):**

1. **Given** an existing todo, **When** `DELETE /todos/{id}` is called, **Then** the row is removed from SQLite **And** the endpoint returns 204.
2. **Given** a todo that does not exist (already deleted), **When** `DELETE /todos/{id}` is called, **Then** the endpoint still returns 204 (idempotent) rather than an error.
3. **Given** `useDeleteTodo`, **When** a delete is initiated, **Then** it consumes the shared honest-pending mutation pattern (`onMutate` cancel→snapshot→pending Committing state, `onError` rollback, `onSettled` invalidate `['todos']`) — it does not re-derive the pattern.
4. **Given** a delete request fails, **When** the error returns, **Then** the list reconciles to the last backend-confirmed state (refetch) **And** the item is not silently removed.
5. **Given** the delete path, **When** tested, **Then** integration tests cover both the existing-row and already-absent cases and assert the 204 contract.

**Runtime contract-schema validation (Epic 1 retro action item 2, confirmed by Keith — "I would expect run-time validation of schemas at all times"; retro assigns this to Story 2.1):**

6. **Given** any web API wrapper that returns a `Todo` / `Todo[]` (`getTodos`, `createTodo`, `patchTodo`), **When** a 2xx response is parsed, **Then** the body is validated at runtime against the shared `@tlf/contracts` TypeBox schema (via `@sinclair/typebox/value`), and the hand-rolled `isTodo` guard is removed so client and server cannot drift.
7. **Given** a malformed 2xx body, **When** validation fails, **Then** the wrapper throws (routing to the mutation's `onError` / query's `isError`) exactly as the current `isTodo` guard does — no behavior regression in existing tests.
8. **Given** the `deleteTodo` wrapper (204, no body), **When** it succeeds, **Then** it validates nothing and parses no JSON — the 204/no-schema asymmetry is intentional (this is the one wrapper with no contract representation).

## Tasks / Subtasks

### A. API — repository (AC 1, 2, 5)

- [x] **Task A1: Add `deleteTodo` to the repository** (AC 1, 2) — `apps/api/src/repositories/todo.repository.ts`
  - [x] Add a prepared statement: `const deleteStatement = db.prepare('DELETE FROM todos WHERE id = ?')`.
  - [x] Add `function deleteTodo(id: string): boolean { return deleteStatement.run(id).changes > 0 }` — returns whether a row was actually removed. A missing id is a **no-op returning `false`**, NOT a throw and NOT an error (mirrors `insertTodo`'s `changes > 0` "created" signal and `updateTodo`'s `null`-on-missing discipline).
  - [x] Add it to the returned object: `return { listTodos, insertTodo, updateTodo, deleteTodo }`.
  - [x] Doc comment: hard delete (FR-6, NG-6 — permanent, no soft-delete, no `deletedAt`). Unlike `updateTodo`'s 404-on-missing, the route maps a missing id to **204, not 404** (idempotency, AC 2) — so the boolean is used only by unit tests / future callers, never to branch the HTTP status.
- [x] **Task A2: Repository unit tests** (AC 5) — `apps/api/src/repositories/todo.repository.test.ts`
  - [x] `deleteTodo()` removes an existing row → returns `true`, and `listTodos()` no longer contains it.
  - [x] `deleteTodo()` on a missing id → returns `false`, no throw (the no-op / idempotent case).

### B. API — route (AC 1, 2, 5)

- [x] **Task B1: Add the DELETE route** (AC 1, 2) — `apps/api/src/routes/todos.route.ts`
  - [x] Add `typedApp.delete('/todos/:id', { schema: { params: todoParams, response: { 204: Type.Null(), 500: errorResponse } } }, async (request, reply) => { request.diScope.cradle.todoRepository.deleteTodo(request.params.id); return reply.status(204).send(); })`.
  - [x] **No 404 branch.** This is the deliberate asymmetry vs. PATCH: delete is idempotent, so a missing id also returns 204 (AC 2). Do NOT read the repository boolean to decide the status.
  - [x] **Keep the handler inline** (like GET/POST/PATCH). Delete has **no domain decision** (no 404 mapping, no computation) — it is pure transport, so it is even more clearly inline than PATCH. Do NOT create a `delete-todo.handler.ts` factory (see "Clean-architecture" below — the aspirational Requirements→Structure map lists one, but the established codebase keeps handlers inline; "a service/handler adds no value here — skip it").
  - [x] Reuse the existing `todoParams` (`Type.Object({ id: Type.String() })`) already declared in this file. Do NOT add a new params schema.
  - [x] Update the file's top comment: it currently says "PATCH/DELETE are Stories 1.8/2.x" — reflect that DELETE is now implemented.
- [x] **Task B2: API integration tests** (AC 5) — `apps/api/test/integration/todos.routes.test.ts`
  - [x] New `describe('DELETE /todos/:id (idempotent 204) (Story 2.1)')` using `buildTestApp()` + `beforeEach/afterEach` (mirror the PATCH describe — it seeds via the cradle `db`).
  - [x] Existing row → `DELETE` returns 204 with an empty body; a subsequent `GET /todos` no longer includes that id.
  - [x] Already-absent id (never inserted, or delete twice) → 204 again (idempotent), and the body is NOT an error envelope.
  - [x] (Recommended, matches the existing OpenAPI describe) assert the OpenAPI doc exposes a `delete` operation under `/todos/{id}`.

### C. Web — runtime schema validation (AC 6, 7, 8) — do this BEFORE the delete wrapper so it is validated from the start

- [x] **Task C1: Add runtime deps to `apps/web`** — `apps/web/package.json`
  - [x] Add `@tlf/contracts` and `@sinclair/typebox` to `dependencies` (web currently imports `@tlf/contracts` **type-only**; runtime `Value` validation needs both as real deps). Match the API's `@sinclair/typebox` version range (`^0.34.49`). Run `npm install`.
  - [x] **VERIFY EARLY (gotcha):** this is the first *runtime* import of the TS-source `@tlf/contracts` package (its `main`/`exports` point at `./src/index.ts`, no build step) into the web bundle. Confirm both `vitest run` **and** `vite build` transpile it without error before writing more code. If Vite/esbuild rejects TS-in-`node_modules`, add a `resolve.alias` to the contracts source or `optimizeDeps` include in `apps/web/vite.config.ts` (investigate minimally; do not restructure the contracts package).
- [x] **Task C2: Create a shared contract validator** (AC 6, 7) — e.g. `apps/web/src/api/validateContract.ts`
  - [x] Use `Value.Check` / `Value.Parse` from `@sinclair/typebox/value` against `todoSchema` and `Type.Array(todoSchema)` from `@tlf/contracts`. Prefer `@sinclair/typebox/value` over adding Ajv to the client (no extra dep, browser-friendly).
  - [x] Expose small helpers, e.g. `parseTodo(value: unknown): Todo` and `parseTodoArray(value: unknown): Todo[]`, that throw a descriptive `Error` on mismatch (so callers keep the "throw → onError/isError" contract).
- [x] **Task C3: Retrofit the existing wrappers to the validator** (AC 6, 7) — `apps/web/src/api/todos.ts`
  - [x] Remove the hand-rolled `isTodo` guard.
  - [x] `getTodos` → validate the parsed body as `Todo[]` (currently it casts with no validation — this is a strict improvement; keep throwing on non-OK).
  - [x] `createTodo` → validate the 2xx body as `Todo` (replaces the `isTodo(parsed)` check; keep the malformed-body throw wording behavior so `api/todos.test.ts` still passes).
  - [x] `patchTodo` → validate as `Todo` AND keep the `parsed.id !== id` cross-check (the id-mismatch case has its own test; validation does not cover it).
  - [x] Keep the `AbortError`-propagates-un-wrapped behavior in `createTodo` exactly as-is (the try/catch must still wrap ONLY the parse, and the `await fetch` stays outside it — Story 1.9 depends on this).

### D. Web — delete API wrapper + hook (AC 3, 4, 8)

- [x] **Task D1: Add the `deleteTodo` wrapper** (AC 8) — `apps/web/src/api/todos.ts`
  - [x] `export async function deleteTodo(id: string): Promise<void>` → `fetch(\`/todos/${id}\`, { method: 'DELETE' })`.
  - [x] Throw `new Error(\`DELETE /todos/${id} failed: ${response.status}\`)` on a non-OK response (routes to `useDeleteTodo`'s `onError`).
  - [x] On success (204) **do NOT parse JSON and validate nothing** — there is no body and no contract schema (AC 8). Just return.
- [x] **Task D2: Create `useDeleteTodo`** (AC 3, 4) — `apps/web/src/hooks/useDeleteTodo.ts`
  - [x] Import the wrapper aliased to avoid the name clash: `import { deleteTodo as deleteTodoRequest } from '../api/todos'`.
  - [x] Mirror `useToggleTodo`'s shape (per-row arbitration + client-only presentation state), with delete's honest-pending divergence:
    - [x] `inFlightIdsRef = useRef<Set<string>>(new Set())` — per-row arbitration (AC: don't fire a second delete for a row already deleting; §Layer-ownership: arbitration is frontend-only).
    - [x] `deletingIds` client-only state (`useState<ReadonlySet<string>>`) — the **Committing** pending marker set in `onMutate`, cleared on settle. This is presentation state, **never a field on the `Todo` contract** (1.7/1.8 precedent). `<TodoItem>` consumes it in Story 2.2 to render Committing + `aria-busy`.
    - [x] `onMutate({ id })`: `await queryClient.cancelQueries({ queryKey: ['todos'] })`; snapshot `const previous = queryClient.getQueryData<Todo[]>(['todos'])`; add `id` to `deletingIds`. **Do NOT remove the row from the cache** — honest-pending shows it as *Committing*, not gone (AC 3, UX-DR15: pending, not optimistic). Return `{ previous }`.
    - [x] `onError(_e, { id }, ctx)`: restore the snapshot `queryClient.setQueryData(['todos'], ctx?.previous)` (rollback, AC 3). The item is never silently removed because it was never optimistically removed (AC 4); the `onSettled` refetch reconciles to backend truth.
    - [x] `onSettled(_d, _e, { id })`: `removeDeleting(id)` (clear the marker + `inFlightIdsRef`), then `void queryClient.invalidateQueries({ queryKey: ['todos'] })` — **unconditional** invalidate (AC 3): on success the refetch drops the deleted row; on error it restores it (AC 4).
    - [x] Expose a callback that reads current cache for arbitration and fires the mutation. Name the hook's own function `deleteTodo` (the import is aliased) and return `{ deleteTodo, deletingIds }`.
  - [x] **Announcements are NOT in this story.** The `<LiveRegion>` "{description} deleted." / failure announcements are **Story 2.3** — do NOT add an `announce` option or copy here (avoid dead code). Keep the mutation variables to `{ id }` only; 2.3 adds `description` when it wires announcements.
  - [x] **`useDeleteTodo` is NOT wired into `App.tsx`/`TodoList`/`TodoItem` in this story** — "before any delete UI exists." App wiring + the delete affordance are Story 2.2. Build and unit-test the hook in isolation. `App.tsx` already documents "Explicitly NOT here (later stories): delete (Epic 2). Do not stub it." — respect that.
- [x] **Task D3: Web tests** (AC 3, 4, 7, 8)
  - [x] `apps/web/src/api/todos.test.ts` → new `describe('deleteTodo (Story 2.1)')`: DELETEs with `method: 'DELETE'` to `/todos/:id`, resolves `undefined` on a 204 (no body parsed); throws on a non-OK response (e.g. 500) so `onError` fires. Confirm the retrofitted `createTodo`/`patchTodo` malformed-body tests still pass against the new validator.
  - [x] `apps/web/src/hooks/useDeleteTodo.test.tsx` (model on `useToggleTodo.test.tsx`): (a) `onMutate` marks the row deleting **without removing it** from the cache (`deletingIds` has the id; the row is still present); (b) on success `onSettled` invalidates `['todos']` and clears `deletingIds` (assert via `vi.spyOn(client, 'invalidateQueries')`, mirroring the toggle test's no-live-observer approach); (c) on error the snapshot is restored (row NOT removed) and invalidate still fires to reconcile (AC 4); (d) per-row arbitration: a second delete of a row already in flight fires no second DELETE `fetch`.

### E. Verification

- [x] **Task E1:** Run the full suite. **API tests require Node 24** (`nvm use 24` first — better-sqlite3 ABI is built for it; the shell default is Node 22). `npm test` (or `npm run test:unit` + `npm run test:integration` for the API). Also run `npm run typecheck` and `npm run build` (the latter exercises the new runtime contracts import through Vite — Task C1's gotcha).

### Review Findings

- [x] [Review][Patch] Enforce DELETE wrapper's strict 204 contract [apps/web/src/api/todos.ts:115] — `deleteTodo()` treats any `response.ok` status as success. Story 2.1 defines the delete wrapper as the 204/no-body asymmetry, so a backend regression returning another 2xx response would be silently accepted as a confirmed delete. **Resolved:** the wrapper now throws unless `response.status === 204` (any non-OK OR unexpected 2xx routes to `onError`). New wrapper test covers the unexpected-200 case.
- [x] [Review][Patch] Avoid stale full-cache rollback for concurrent delete failures [apps/web/src/hooks/useDeleteTodo.ts:81] — `onError` restores the entire pre-mutation `['todos']` snapshot even though `onMutate` never removes the row. With two row deletes in flight, a later failure can briefly restore a stale snapshot and reintroduce a sibling that already deleted successfully before the unconditional invalidate refetch reconciles. **Resolved:** removed the `onError` snapshot restore (and the now-dead snapshot/context) entirely — since `onMutate` makes no cache write there is nothing to roll back, and the unconditional `onSettled` invalidate is the sole reconciler on both paths. The hook test now asserts the hook never calls `setQueryData`.

## Dev Notes

### The delete honest-pending model — how it differs from create AND toggle

This story's mutation is the third consumer of the mandatory honest-pending shape (`usePendingPresentation` seam + the `onMutate`/`onError`/`onSettled` flow). It is closest to **toggle**, with these deltas:

| Aspect | `useCreateTodo` | `useToggleTodo` | **`useDeleteTodo` (this story)** |
|---|---|---|---|
| `onMutate` cache write | prepends a pending `Todo` | none (tracks a client-only destination) | **none** — tracks a client-only `deletingIds` (Committing marker); row stays visible |
| `onSuccess` | invalidate (via `onSettled`) | writes server Todo in-place, **no** invalidate | none (the `onSettled` invalidate handles it) |
| `onError` | move row to `failedCreates` (useState), **no** invalidate | invalidate to reconcile | **restore snapshot** + `onSettled` invalidates to reconcile |
| `onSettled` invalidate | **only on success** | (none — success writes in place) | **unconditional** (AC 3) — success drops the row, error restores it |

Key subtlety: delete uses **unconditional `onSettled` invalidate** (unlike toggle, which never invalidates on success because a refetch would re-sort a completed item and move it — AC 4 of 1.8). Delete has no such constraint: refetching after a delete is exactly correct (row gone on success, row present on error). This is why AC 3 mandates `onSettled invalidate ['todos']` for delete but 1.8 forbade it for toggle. **Do not copy toggle's "success writes in place, never invalidate" logic here.**

Honest-pending ≠ optimistic: the row is NOT removed from the cache in `onMutate`. It renders as *Committing* (`aria-busy` at t=0, visual cue delayed to the ~150 ms flicker threshold — Story 2.2 wires the visual via `usePendingPresentation`). The backend confirms before the row disappears (FR-3). [Source: architecture.md#Frontend Architecture line 199; #Process Patterns line 284]

### API delete — the deliberate asymmetries

- **204, no body, no contract schema.** `DELETE /todos/{id}` is the one endpoint with no `@tlf/contracts` representation — "this asymmetry is intentional; do not invent a delete-response schema." [Source: architecture.md#Layer-ownership seams line 302]
- **Idempotent → 204 even when absent, NEVER 404.** Contrast with PATCH, which returns 404-on-missing as a *domain decision in the handler*. Delete has no such decision. [Source: architecture.md#API & Communication Patterns line 189; #Technical Constraints line 69; epics.md Story 2.1 AC 2]
- **Hard delete, permanent** (FR-6, NG-6) — no soft-delete, no `deletedAt` column, no schema migration. The `todos` table is unchanged. [Source: architecture.md#Requirements Overview lines 29, 49]
- **Repository owns the SQL**; it is the only module importing better-sqlite3 / knowing snake_case. No casing or SQL leaks into the route. [Source: architecture.md#Architectural Boundaries line 422]

### Clean-architecture: keep the handler inline (do NOT create `delete-todo.handler.ts`)

The Requirements→Structure map [architecture.md line 433] lists `handlers/delete-todo.handler.ts` aspirationally, but the **established codebase keeps every handler inline in `todos.route.ts`** (GET/POST/PATCH), and the route file's own comment codifies "the route file IS the handler … a service adds no value — skip it." Delete has **no domain decision** (idempotent, no 404, no computation) — it is pure transport, the strongest case yet for inline. Extracting a factory would add indirection with zero benefit. If a future review disagrees, that's a route-file-wide refactor, not a per-story call. [Source: architecture.md#Enforcement Guidelines line 291; #Layer boundary line 420; existing `todos.route.ts` handler-placement comment]

### 204 + TypeBox response schema (Fastify gotcha)

`response: { 204: Type.Null() }` documents the no-content response in OpenAPI; `reply.status(204).send()` (no argument) is correct — Fastify does not serialize a body for a 204. Do not pass a payload to `.send()`. Verify the Swagger doc renders the delete operation (optional integration assertion in Task B2).

### Runtime schema validation (retro action item 2)

Assigned to this story by the Epic 1 retrospective and confirmed by Keith: "I would expect run-time validation of schemas at all times." Establish it here and retrofit the existing wrappers so the DELETE response path (and all others) are validated from the start rather than caught in review. The delete wrapper itself validates nothing (204/no body) — the establishment work is the shared validator + the `getTodos`/`createTodo`/`patchTodo` retrofit that replaces the hand-rolled `isTodo`. [Source: epic-1-retro-2026-07-01.md action item 2, line 62; #Epic 2 Preparation line 96; #Decision line 108]

### Files being modified (current state → what changes)

- `apps/api/src/repositories/todo.repository.ts` (UPDATE) — factory returning `{ listTodos, insertTodo, updateTodo }`; toggle established the `changes === 0 → null` no-op-on-missing pattern. **Add** `deleteStatement` + `deleteTodo(id): boolean`; extend the returned object.
- `apps/api/src/routes/todos.route.ts` (UPDATE) — thin cradle-injected handlers for GET/POST/PATCH; `todoParams`/`errorResponse` already declared. **Add** the DELETE route; reuse `todoParams`; refresh the top comment. Must not break the PATCH 404/400 behavior.
- `apps/web/src/api/todos.ts` (UPDATE) — `getTodos`/`createTodo`/`patchTodo` + the `isTodo` guard + the Story-1.9 `AbortError`-propagation contract. **Remove** `isTodo`, route all validation through the new validator, **add** `deleteTodo`. Preserve the abort behavior exactly.
- `apps/web/package.json` (UPDATE) — add `@tlf/contracts` + `@sinclair/typebox` to `dependencies`.
- **NEW:** `apps/web/src/api/validateContract.ts`, `apps/web/src/hooks/useDeleteTodo.ts`, `apps/web/src/hooks/useDeleteTodo.test.tsx`. Test additions to `todo.repository.test.ts`, `todos.routes.test.ts`, `api/todos.test.ts`.
- **NOT touched this story:** `App.tsx`, `TodoList.tsx`, `TodoItem.tsx`, `packages/contracts/*` (no new schema — the 204 asymmetry), `db/schema.ts` (hard delete needs no migration), `plugins/swagger.ts` (no new `addSchema` — delete has no body schema).

### Project Structure Notes

- `useDeleteTodo.ts` sits alongside `useTodos`/`useCreateTodo`/`useToggleTodo` in `apps/web/src/hooks/` — the architecture directory map names it explicitly with "honest-pending delete (FR-6)". [Source: architecture.md#Complete Project Directory Structure line 405]
- API integration tests live in `apps/api/test/integration/`; web hook/unit tests co-locate as `*.test.ts(x)`. [Source: architecture.md#Structure Patterns lines 259–264]
- Repository is registered once as an awilix singleton (`plugins/awilix.ts`); adding a method needs **no** registration change — the cradle resolves the same factory.

### References

- [Source: epics.md#Epic 2: Safe Delete › Story 2.1: Delete endpoint & mutation] — the 5 delete ACs.
- [Source: epics.md#Notes carried into story creation, line 126] — honest-pending is UX-authoritative and binding on all three mutations (supersedes AR-6 "optimistic-with-rollback").
- [Source: architecture.md#API & Communication Patterns lines 184–192, 302] — endpoint table, DELETE 204 idempotent, no delete-response schema, error envelope.
- [Source: architecture.md#Frontend Architecture line 199 & #Process Patterns line 284] — the mandatory honest-pending flow.
- [Source: architecture.md#Layer-ownership seams lines 297–303] — 404-mapping-is-handler; timestamp stamping in repo; DELETE no-schema; per-row arbitration is frontend-only.
- [Source: architecture.md#Requirements → Structure Mapping line 433 & #Complete Project Directory Structure lines 365–367, 405] — file locations.
- [Source: epic-1-retro-2026-07-01.md lines 62, 96, 108] — runtime schema validation assigned to Story 2.1 (Keith-confirmed).
- Code precedents to mirror: `useToggleTodo.ts` (honest-pending + arbitration), `useToggleTodo.test.tsx` (fetch-stub + invalidate-spy test style), `todo.repository.ts` (`changes`-based no-op signals), `todos.routes.test.ts` PATCH describe (seed-via-cradle integration pattern), `api/todos.test.ts` (wrapper test style).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — bmad-dev-story workflow.

### Debug Log References

- **Typecheck caught the 204 send() signature.** The Dev Notes said `reply.status(204).send()` with no argument. Under `@fastify/type-provider-typebox`, declaring `response: { 204: Type.Null() }` types `.send` to require the `null` payload, so the no-arg call failed `tsc --noEmit` (TS2554). Fixed to `reply.status(204).send(null)`; the integration test confirms Fastify still writes an empty body for a 204, so the AC 1 empty-body contract holds. All tests + typecheck + build green.
- **C1 runtime-import gotcha was a non-issue.** The first runtime import of the TS-source `@tlf/contracts` into the web bundle transpiled cleanly through both `vitest run` and `vite build` with no `resolve.alias`/`optimizeDeps` workaround needed. `npm install` reported "up to date" — `@sinclair/typebox` and `@tlf/contracts` were already hoisted at the workspace root (the API depends on them), so both resolve for web with only the `package.json` dependency declarations added.

### Completion Notes List

- **API delete (AC 1, 2, 5):** `deleteTodo(id): boolean` in the repository uses `deleteStatement.run(id).changes > 0` (mirrors the `insertTodo` created-signal). The DELETE route is inline (no `delete-todo.handler.ts` factory — pure transport, no domain decision) and returns 204 unconditionally; the repository boolean is deliberately ignored so a missing id is 204, never 404 (idempotent). Integration tests cover existing-row, never-existed, and delete-twice; OpenAPI exposes the `delete` operation.
- **Runtime schema validation (AC 6, 7, 8):** new `apps/web/src/api/validateContract.ts` (`parseTodo`/`parseTodoArray` via `@sinclair/typebox/value` `Value.Check` against the shared `todoSchema`). The hand-rolled `isTodo` guard is removed; `getTodos`/`createTodo`/`patchTodo` now validate against the contract. The existing wrapper throw messages and the `patchTodo` id-mismatch cross-check are preserved, so `api/todos.test.ts` passes unchanged. The Story-1.9 AbortError-propagation contract (fetch outside the try/catch) is untouched. The `deleteTodo` wrapper validates nothing and parses no JSON (204/no-schema asymmetry, AC 8).
- **Delete mutation (AC 3, 4):** `useDeleteTodo` mirrors `useToggleTodo` (per-row `inFlightIdsRef` arbitration + client-only `deletingIds` presentation state) with delete's divergences — `onMutate` marks the row Committing WITHOUT removing it from the cache, `onError` restores the snapshot, and `onSettled` invalidates `['todos']` UNCONDITIONALLY. No announcements/`announce` option (Story 2.3) and no App/TodoList/TodoItem wiring (Story 2.2) — built and unit-tested in isolation.
- **Verification:** API 49 tests (6 files), web 138 tests (18 files) — all pass under Node 24. `npm run typecheck`, `npm run build`, `eslint`, and `stylelint` all clean.

### File List

- `apps/api/src/repositories/todo.repository.ts` (UPDATE) — added `deleteStatement` + `deleteTodo(id): boolean`; extended returned object.
- `apps/api/src/repositories/todo.repository.test.ts` (UPDATE) — added 2 `deleteTodo` unit tests.
- `apps/api/src/routes/todos.route.ts` (UPDATE) — added inline DELETE `/todos/:id` route (idempotent 204); refreshed top comment.
- `apps/api/test/integration/todos.routes.test.ts` (UPDATE) — added DELETE describe (3 tests) + OpenAPI delete-operation assertion.
- `apps/web/package.json` (UPDATE) — added `@tlf/contracts` + `@sinclair/typebox` to `dependencies`.
- `apps/web/src/api/validateContract.ts` (NEW) — shared runtime contract validator.
- `apps/web/src/api/todos.ts` (UPDATE) — removed `isTodo`; routed `getTodos`/`createTodo`/`patchTodo` through the validator; added `deleteTodo` wrapper.
- `apps/web/src/api/todos.test.ts` (UPDATE) — added `deleteTodo` describe (2 tests).
- `apps/web/src/hooks/useDeleteTodo.ts` (NEW) — honest-pending delete hook.
- `apps/web/src/hooks/useDeleteTodo.test.tsx` (NEW) — hook tests (5 tests).

## Change Log

- 2026-07-01: Implemented Story 2.1 (dev-story). API: idempotent DELETE `/todos/:id` (204, inline handler) + repository `deleteTodo`. Web: shared runtime contract validator replacing the `isTodo` guard, retrofit of `getTodos`/`createTodo`/`patchTodo`, `deleteTodo` wrapper, and the `useDeleteTodo` honest-pending hook. Added `@tlf/contracts` + `@sinclair/typebox` as web runtime deps. All 8 ACs satisfied; 187 tests + typecheck + build + lint green under Node 24. Status → review.
- 2026-07-01: CI + review follow-ups. Bumped `actions/checkout`/`actions/setup-node` to `@v5` (Node 24-native action runtimes, clears the Node 20 deprecation warning). Rebaselined the ratcheting bundle-size gate to 90,780 B gz (Keith-approved: the ~14 KB is the intentional TypeBox runtime-validation cost). Resolved 2 code-review `[Patch]` findings: strict-204 delete wrapper, and removal of the stale `onError` cache rollback in `useDeleteTodo`. Web tests now 139 (added the unexpected-2xx wrapper test + the no-cache-write regression assertion).

## Previous Story Intelligence (Epic 1 → Epic 2 handoff)

From `epic-1-retro-2026-07-01.md` (§Epic 2 Preparation) — lessons that directly de-risk this story:

- **Idempotent insert (`ON CONFLICT DO NOTHING`, 1.2) → idempotent DELETE (2.1): "same discipline, already proven."** The `changes`-count signal used by `insertTodo` (created vs. existing) is the exact mechanism for `deleteTodo` (removed vs. absent).
- **Honest-pending seam (1.7, reused verbatim by 1.8/1.9) → "delete reuses it directly — battle-tested."** Do not re-derive; mirror `useToggleTodo`.
- **Runtime schema validation → "should be established in Story 2.1 so the DELETE response path is validated from the start rather than caught in review"** (action item 2). Retro line 108 makes it part of this story.
- **Toggle/create review-patch history was dominated by timing/race and cache-reconcile bugs.** The highest-risk delete work (300 ms no-commit + 5 s auto-revert timing) is **Story 2.2/2.3**, not here — but the honest-pending reconcile logic (onError rollback + onSettled invalidate) is the same family of bug, so get the `deletingIds` lifecycle (set in onMutate, cleared in onSettled on *every* path) exactly right and cover the mixed success/error concurrent cases in tests.

## Git Intelligence Summary

Recent history is the Epic 1 close-out (retrospective + PR #13 thin-container deploy). The relevant lineage for this story is the mutation-hook family, all present and green on `main`:

- `useCreateTodo.ts` (1.7/1.9) — defines the honest-pending shape + failed-recovery.
- `useToggleTodo.ts` (1.8) — the closest analog: per-row `inFlightIdsRef` arbitration, client-only presentation state, `onMutate`/`onError`/`onSettled`. **Copy its structure; change the divergences per the table in Dev Notes.**
- `usePendingPresentation.ts` (1.7) — the injectable-clock Committing/pending visual seam that Story 2.2 will attach to the delete row (not wired in 2.1).
- API: `todos.route.ts` + `todo.repository.ts` established the GET/POST/PATCH pattern this story extends by one verb.

## Latest Tech Information

Stack is fixed and current (verified June 2026 in the architecture doc); no upgrades in this story. Relevant to the delete work:

- **Fastify v5** — `reply.status(204).send()` sends no body; a `204` response schema of `Type.Null()` documents it in OpenAPI. Routes are collected by `@fastify/swagger`'s `onRoute` hook, so the new DELETE appears in `/docs` automatically (no `addSchema` needed). [architecture.md#Starter Template]
- **better-sqlite3 v12** — synchronous; `deleteStatement.run(id).changes` gives the removed-row count. Backend is intentionally single-threaded/serialized; no story may claim parallel backend execution. **API tests require Node 24** (native ABI). [architecture.md; project memory]
- **TanStack Query v5 (5.101.0)** — `cancelQueries`/`getQueryData`/`setQueryData`/`invalidateQueries` are the honest-pending machinery; `['todos']` is the single list key all mutations invalidate. [architecture.md#Data Architecture line 229, #Communication Patterns line 278]
- **@sinclair/typebox (^0.34.49)** — use `@sinclair/typebox/value`'s `Value.Check`/`Value.Parse` for browser-side runtime validation (no Ajv on the client). Same version as the API to avoid schema drift. [architecture.md#Data Architecture line 167]

## Project Context Reference

- Config: `_bmad/bmm/config.yaml` — project "the long finger", implementation artifacts under `_bmad-output/implementation-artifacts`.
- No `project-context.md` exists in the repo (only the generator template) — architecture.md + epics.md + the Epic 1 retro are the authoritative context, cited inline above.
- Project memory (persistent): API tests need Node 24 before running; Docker daemon must be started manually if a container check is needed (not required by this story — the container re-deploy verification is Story 2.3 AC 7, not 2.1).

## Story Completion Status

Ultimate context engine analysis completed — comprehensive developer guide created. Status: ready-for-dev.

### Open questions / scope confirmations for Keith (non-blocking — sensible defaults chosen)

1. **Runtime schema validation scope.** Included in this story per the Epic 1 retro (action item 2) and your confirmation. It expands 2.1 beyond the literal epics ACs (delete-only) to also add a shared TypeBox `Value` validator + retrofit `getTodos`/`createTodo`/`patchTodo` and add `@tlf/contracts`/`@sinclair/typebox` as web runtime deps. Flagging because it carries a real risk (first runtime import of the TS-source contracts package into the Vite bundle — Task C1). If you'd rather split it into its own story, say so; otherwise it proceeds as scoped.
2. **Playwright harness (retro action item 6).** The retro suggests standing up a thin Playwright harness at Epic 2 kickoff via `bmad-testarch-framework`. Story 2.1 has **no UI surface** (endpoint + hook only), so it needs no e2e — integration + hook unit tests fully cover it. The harness setup is genuinely needed for 2.2's delete affordance timing. Recommend standing it up as a 2.2 prerequisite (or a separate kickoff task), not folding it into 2.1. Proceeding on that assumption.
3. **Coverage-threshold gate + `@p0/@p1` tagging (retro action item 7, marked optional).** Not included in 2.1. It's an Epic-2-wide CI concern best introduced alongside the e2e harness. Flagging so it isn't forgotten.
