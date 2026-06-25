---
baseline_commit: 3a97b13625c1557aeb3425fbdd1d9959512300c7
---

# Story 1.8: Complete & Uncomplete a Task

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Primary User,
I want to check a task complete (and uncheck it) by tapping anywhere on its row,
so that I can mark progress as quickly and naturally as crossing a line off paper.

## Acceptance Criteria

1. **Toggle via row tap.** Given an active todo, when I tap anywhere on the row (the wrapping `<label>`) other than a future action affordance, then its completion toggles via `PATCH /todos/{id}` with body `{ completed }` **only**, and the shared honest-pending pattern drives the in-flight state (PendingToggle). [Source: epics.md#Story-1.8; architecture.md#API-&-Communication-Patterns]

2. **Toggle via keyboard.** Given keyboard focus on a row, when I press **Space or Enter**, then the row toggles using the same `<label>` semantics. (Space toggles a native checkbox already; **Enter does not** and must be wired explicitly — see Dev Notes.) [Source: epics.md#Story-1.8; ux-design-specification.md#Keyboard-Navigation]

3. **Confirm cues + announcement.** Given a toggle confirms, when complete, then the row shows the three non-color completion cues (strikethrough + checked box + muted text) and the `<LiveRegion>` announces `"{description} marked complete."`; when uncompleted, it announces `"{description} marked active."` [Source: ux-design-specification.md#Completion-State-Visual-Treatment; #Live-Region-Announcements]

4. **In-place during session.** Given a toggle within a session, when it confirms, then the item does **NOT** move position (in-place hybrid placement, UX-DR17); canonical re-sort happens only on the next page load. [Source: ux-design-specification.md#Journey-3; #Journey-6; epics.md#Story-1.8]

5. **Failure reconciles + announces once.** Given a toggle request fails, when the error returns, then the list reconciles to the last backend-confirmed state (refetch), the change does **not** silently persist, and the `<LiveRegion>` announces the failure once: `"Couldn’t update “{description}”. The list refreshed to current state."` (No inline Retry/Dismiss affordance — that is Story 1.9/1.10 scope.) [Source: epics.md#Story-1.8 NFR-6; ux-design-specification.md#Live-Region-Announcements]

6. **Reactive title.** Given the active count changes from a toggle, when it confirms, then the `<title>` count updates by **reusing the existing Story 1.6 effect in `App.tsx`** — do not add a new implementation. [Source: epics.md#Story-1.8; apps/web/src/App.tsx]

7. **Server stamps `updated_at`.** Given a successful PATCH, when it persists, then the server sets `updated_at` to the write time, so that on the next page load the toggled item re-sorts into canonical order (`completed ASC, updated_at DESC`). This makes the next-load re-sort verifiable. [Source: architecture.md#Data-Architecture; epics.md#Story-1.8]

8. **Per-row in-flight arbitration.** Given a row already has a toggle in flight, when the user toggles it again, then the per-row in-flight arbitration from the honest-pending pattern applies: it does **not** fire a conflicting second mutation, and the row is inert (`aria-disabled="true"`, focus preserved) while pending. Covered by a toggle-while-pending test. The synchronous backend is intentionally ignorant of this — arbitration lives entirely in the frontend. [Source: epics.md#Story-1.8; architecture.md#Enforcement-Guidelines; ux-design-specification.md#Journey-3]

9. **Backend PATCH contract.** `PATCH /todos/:id` returns **200** with the updated `Todo` on success; **404** (NOT_FOUND envelope) when the id does not exist; **400** (BAD_REQUEST envelope) on a malformed/extra-field body; **500** envelope on unexpected error. No success envelope — the `Todo` is returned directly. [Source: architecture.md#API-&-Communication-Patterns; #Enforcement-Guidelines]

10. **Structural — row markup is the contract.** Given the row markup, when built, then the whole-row `<label>` DOM structure and the roving-tabindex anchor position are established here so Epic 2 only **adds** the delete affordance (a sibling `<button>` with `stopPropagation`) without rewriting the row, and Story 3.1 layers roving-tabindex without rewriting it. This is an architectural constraint, not a behavioral test. [Source: epics.md#Story-1.8 §A-11; apps/web/src/components/recipes/TodoItem.tsx]

## Tasks / Subtasks

- [x] **Backend: contract + swagger registration** (AC: 9)
  - [x] In `packages/contracts/src/todo.schema.ts`, add `$id: 'PatchTodoBody'` to the existing `patchTodoBody` object (it is already defined as `{ completed: Type.Boolean() }`; only the `$id` is missing) so the route can `$ref` it. Match the `additionalProperties` behavior of the other bodies (TypeBox `Type.Object` is closed by default → an extra field yields a 400, satisfying AC 9).
  - [x] In `apps/api/src/plugins/swagger.ts`, add `app.addSchema(patchTodoBody)` alongside the existing three, and import it from `@tlf/contracts`.
- [x] **Backend: repository `updateTodo`** (AC: 7, 9)
  - [x] In `apps/api/src/repositories/todo.repository.ts`, add an `updateStatement` prepared at factory top: `UPDATE todos SET completed = @completed, updated_at = @updated_at WHERE id = @id`.
  - [x] Add `updateTodo(id: string, input: PatchTodoBody): Todo | null`: stamp `updated_at = new Date().toISOString()` server-side (NEVER from the client); `result.changes === 0` → return `null` (id not found); else `findByIdStatement.get(id)` → `toDomain(row)`. Coerce `completed` boolean → `0/1` via `input.completed ? 1 : 0`.
  - [x] Export `updateTodo` from the returned object. `created_at` stays untouched.
- [x] **Backend: PATCH route** (AC: 1, 9)
  - [x] In `apps/api/src/routes/todos.route.ts`, add `patchTodoBodyRef = Type.Unsafe<PatchTodoBody>(Type.Ref('PatchTodoBody'))` and a params schema `Type.Object({ id: Type.String() })`.
  - [x] Register `typedApp.patch('/todos/:id', { schema: { params, body: patchTodoBodyRef, response: { 200: todoResponse, 400: errorResponse, 404: errorResponse, 500: errorResponse } } }, handler)`.
  - [x] Handler: `const todo = todoRepository.updateTodo(request.params.id, request.body); if (!todo) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: \`Todo ${request.params.id} not found\` } });` else return `todo` (200 default). The 404 is a **handler** decision (domain 404), not a repository throw or a router-level not-found — construct the envelope inline. [Source: architecture.md#Enforcement-Guidelines]
- [x] **Frontend: api wrapper `patchTodo`** (AC: 1, 5)
  - [x] In `apps/web/src/api/todos.ts`, add `patchTodo(id: string, body: PatchTodoBody): Promise<Todo>`. Mirror `createTodo` exactly: `fetch(\`/todos/${id}\`, { method: 'PATCH', headers, body: JSON.stringify({ completed: body.completed }) })`; throw on non-OK; reuse the existing `isTodo` guard on the 2xx body; throw on a malformed body so failures route to the mutation's `onError`.
- [x] **Frontend: `useToggleTodo` hook** (AC: 1, 3, 4, 5, 8)
  - [x] Create `apps/web/src/hooks/useToggleTodo.ts` mirroring the honest-pending shape from `useCreateTodo.ts`, with the **in-place** divergences in Dev Notes:
    - `onMutate({ id, completed })`: `cancelQueries(['todos'])`; snapshot `previous`; write the new `completed` value into the matching cache row **in place** (map by id, keep array position — do NOT prepend or re-sort); add `id` to a client-only `togglingIds` Set.
    - `onSuccess(confirmedTodo, { id, completed })`: announce `"{description} marked complete."` / `"{description} marked active."`; write the server-returned `Todo` into the **same array position** (replace by id) to capture the real `updated_at`. **Do NOT invalidate `['todos']` on success** — invalidation would refetch in canonical order and move the item, violating AC 4.
    - `onError(_e, { id }, ctx)`: revert THIS row's `completed` in place from `ctx.previous` (per-id, never whole-snapshot restore — protects concurrent rows); `invalidateQueries(['todos'])` to reconcile to backend truth (the refetch of AC 5); announce the failure once.
    - `onSettled(_d, _e, { id })`: remove `id` from `togglingIds`.
  - [x] Return `{ toggle, togglingIds }`. `toggle(id, completed)` calls `mutation.mutate({ id, completed, description })` (description needed for the announcement string).
- [x] **Frontend: wire mutation into App + list** (AC: 1, 2, 3, 6, 8)
  - [x] In `apps/web/src/App.tsx`, add `const { toggle, togglingIds } = useToggleTodo({ announce })` next to `useCreateTodo` (App owns the mutation so its pending ids reach the list — mirrors 1.7). Pass `onToggle={toggle}` and `togglingIds={togglingIds}` to `<TodoList>`. Do NOT touch the `<title>` effect — it already recomputes from `data` (AC 6).
  - [x] In `apps/web/src/components/recipes/TodoList.tsx`, add props `togglingIds?: ReadonlySet<string>` and `onToggle?: (id: string, completed: boolean) => void`. Per item pass `pending={(pendingIds?.has(todo.id) ?? false) || (togglingIds?.has(todo.id) ?? false)}` and `onToggle={(completed) => onToggle?.(todo.id, completed)}`.
  - [x] In `apps/web/src/components/recipes/TodoItem.tsx`, accept `onToggle?: (completed: boolean) => void`. Wire `<Checkbox ... onCheckedChange={(checked) => { if (!pending) onToggle?.(checked) }} aria-disabled={pending || undefined} />`. Add an Enter-key handler (Space already works natively) that fires the same toggle and `preventDefault`s, guarded by `!pending`. Do NOT change the row's `<label>`/`<span>` DOM structure (AC 10).
- [x] **Frontend: pending-vs-complete visual precedence** (AC: 1, 3)
  - [x] In `apps/web/src/components/recipes/TodoItem.module.css`, ensure that while `.pending` is applied the row shows the honest-pending treatment (muted `--color-pending` text, **no premature strikethrough**) even when `.complete` is also present; the settled completion strikethrough appears only after pending clears, transitioning via `--motion-settle` (reduced-motion → instant). The checkbox reflects the optimistic destination immediately. Verify source-order/specificity so pending wins over complete during the in-flight window.
- [x] **Backend tests** (AC: 7, 9)
  - [x] Extend `apps/api/test/integration/todos.routes.test.ts`: PATCH valid id `{ completed: true }` → 200 + updated `Todo` with `completed: true`; PATCH unknown id → 404 + `{ error: { code: 'NOT_FOUND' } }`; PATCH extra/invalid body field → 400 + `{ error: { code: 'BAD_REQUEST' } }`; assert `updated_at` advances (server-set) and `created_at` is unchanged; assert canonical order after toggle on a fresh `listTodos`/GET (completed sinks below active).
  - [x] Extend `apps/api/src/repositories/todo.repository.test.ts`: `updateTodo` flips `completed`, advances `updated_at`, returns the mapped `Todo`; returns `null` for a missing id.
- [x] **Frontend tests** (AC: 1, 2, 3, 4, 5, 8)
  - [x] `apps/web/src/hooks/useToggleTodo.test.tsx` (mirror `useCreateTodo.test.tsx`): optimistic in-place write keeps position; success announces correct string and does not re-sort; error reverts per-id and reconciles; mixed-outcome concurrent toggles on different rows do not cross-contaminate.
  - [x] `apps/web/src/api/todos.test.ts`: `patchTodo` success, non-OK throw, malformed-body throw.
  - [x] `apps/web/src/components/recipes/TodoItem.test.tsx`: single row click fires exactly **one** `onToggle` (guard the nested-`<label>` double-fire risk — see Dev Notes); Space and Enter each fire one toggle; a `pending` row is `aria-disabled` and absorbs clicks/keys without calling `onToggle`.
  - [x] `apps/web/src/App.test.tsx`: toggling a row issues a PATCH, settles in place, announces, and updates `<title>` active count.
  - [x] Keep `App.axe.test.tsx` / `App.firstInteractive.test.tsx` green (no a11y regression; capture input stays first interactive).
- [x] **Gates** (all ACs)
  - [x] Run `npm run typecheck`, `npm test` (workspaces), `npm run test:unit`/`test:integration`, `npm run lint --workspace apps/web`, `npm run lint:css --workspace apps/web`, `npm run contrast:check --workspace apps/web`, and `npm run size:check --workspace apps/web` (rebaseline with `-- --update` only if the small `useToggleTodo`/`patchTodo` additions intentionally exceed the tolerance; no new deps expected).

### Review Findings

- [x] [Review][Patch] Completion styling appears before the toggle confirms [apps/web/src/components/recipes/TodoItem.tsx:56]
- [x] [Review][Patch] Per-row arbitration can race before `togglingIds` state updates [apps/web/src/hooks/useToggleTodo.ts:134]
- [x] [Review][Patch] `patchTodo` accepts a valid Todo response for the wrong id [apps/web/src/api/todos.ts:95]
- [x] [Review][Patch] Row pending state exposes `aria-disabled` only on the checkbox, not the row [apps/web/src/components/recipes/TodoItem.tsx:84]
- [x] [Review][Patch] Row keyboard focus contract is not established [apps/web/src/components/recipes/TodoItem.tsx:84]
- [x] [Review][Patch] Nested label structure remains active now that toggles are wired [apps/web/src/components/recipes/TodoItem.tsx:84]
- [x] [Review][Patch] Active-count title updates optimistically before PATCH confirmation [apps/web/src/hooks/useToggleTodo.ts:79]
- [x] [Review][Patch] Failure announcement can claim refresh before reconciliation finishes [apps/web/src/hooks/useToggleTodo.ts:118]
- [x] [Review][Patch] Toggle timestamp tests compare against a same-day wall-clock seed [apps/api/src/repositories/todo.repository.test.ts:157]

## Dev Notes

### The one critical design decision: honest-pending × in-place placement

The 1.7 honest-pending shape ends every mutation with `onSettled → invalidateQueries(['todos'])` (settle = refetch). **For toggle that is wrong on success**: a refetch returns the backend canonical order (`completed ASC, updated_at DESC`), which would sink a just-completed item below the actives — moving it mid-session and violating AC 4 ("the item does NOT move position; canonical re-sort only on the next page load").

Resolution (reconciles UX-DR15 honest-pending with UX-DR17 hybrid placement):
- **Success:** write the server-confirmed `Todo` into its **existing array position** (replace by id), and do **not** invalidate. The item stays put; the real `updated_at` is captured for the *next* fresh GET to re-sort.
- **Failure:** revert in place AND invalidate (`['todos']`) — this is the AC 5 "reconcile to last backend-confirmed state (refetch)".
- **Next page load** (fresh mount → `useTodos` GET) re-sorts naturally. The frontend never re-sorts client-side (canonical authority is the repository SQL).

This is the deliberate, documented divergence from `useCreateTodo` (where the optimistic prepend already matches canonical order, so its `onSettled` invalidate causes no visible move). Encode it as a comment in `useToggleTodo.ts`. **Do not** copy create's `onSettled` invalidate blindly.

### Honest-pending semantics for a toggle (what "pending, not done" means here)

- `aria-busy="true"` is set from t=0 (via `usePendingPresentation`, already generic and tested — reuse, do not reinvent). [Source: apps/web/src/hooks/usePendingPresentation.ts; FLICKER_THRESHOLD_MS=150, PENDING_MIN_HOLD_MS=500]
- The checkbox reflects the **destination** immediately (user action echoed). The row text shifts to the pending cue (`--color-pending`, contrast-only change), gated by the flicker threshold + min-hold so it never flashes.
- The settled completion treatment (strikethrough) appears **only after the server confirms** — hence the CSS precedence task: `.pending` must suppress `.complete`'s strikethrough during the in-flight window.
- A confirm under the ~150 ms threshold paints no pending cue at all (matches create).

### Files to touch — current state vs. what to add

**Backend**
- `packages/contracts/src/todo.schema.ts` — `patchTodoBody` **already defined** as `{ completed: boolean }`; ADD `$id: 'PatchTodoBody'` only. [verified]
- `apps/api/src/plugins/swagger.ts` — currently `addSchema(todoSchema/createTodoBody/errorEnvelope)`; ADD `addSchema(patchTodoBody)`. [verified]
- `apps/api/src/repositories/todo.repository.ts` — has `listTodos`, `insertTodo`, `toDomain` (the single snake_case↔camelCase + 0/1↔boolean mapper). NO `updateTodo` yet — ADD it (prepared statement at factory top, return `Todo | null`). `findByIdStatement` already exists for the re-read. [verified]
- `apps/api/src/routes/todos.route.ts` — has GET + POST inline (route fn IS the handler). ADD PATCH; this is the first route with a real domain decision (404-on-missing-id), so the inline 404 mapping is expected here. The file's own header comment already anticipates "Toggle (1.8) … introduce real domain decisions (e.g. 404-on-missing-id)". [verified]
- Error envelope: `{ error: { code, message, details? } }`, codes via `codeForStatus` (`NOT_FOUND`, `BAD_REQUEST`, `INTERNAL_SERVER_ERROR`). Validation 400s are produced automatically by `error-handler.ts` from Ajv `error.validation`; the explicit 404 you construct inline. [Source: apps/api/src/plugins/error-handler.ts; packages/contracts/src/error.schema.ts]

**Frontend**
- `apps/web/src/api/todos.ts` — has `getTodos`, `createTodo`, `isTodo` guard (guard was a code-review fix in 1.7 — keep using it). ADD `patchTodo`. [verified]
- `apps/web/src/hooks/useCreateTodo.ts` — the canonical honest-pending shape to mirror (`onMutate` cancel→snapshot→cache write→track id; `onError` per-id rollback; `onSuccess` announce; `onSettled` cleanup). [verified]
- `apps/web/src/hooks/useToggleTodo.ts` — NEW (see design decision above).
- `apps/web/src/hooks/useTodos.ts` / `usePendingPresentation.ts` — NO changes; both already generic for reuse. [verified]
- `apps/web/src/App.tsx` — owns `useCreateTodo` + the single `<LiveRegion>` + the reactive `<title>` (AC 6 reuse) + `announce` callback. ADD `useToggleTodo`; thread `onToggle`/`togglingIds` to `<TodoList>`. The header comment lists "toggle wiring (1.8)" as an explicit later-story TODO — this is the story that fills it. [verified]
- `apps/web/src/components/recipes/TodoList.tsx` — threads `pendingIds` today; ADD `togglingIds` + `onToggle` and combine pending for `<TodoItem>`. [verified]
- `apps/web/src/components/recipes/TodoItem.tsx` — already renders the whole-row `<label>` wrapping `<Checkbox>` + description `<span>`; checkbox is **presentational/inert** (no `onCheckedChange`). Its header comment states: "Story 1.8 only adds onCheckedChange behavior; Epic 2 only ADDS a sibling delete `<button>` with stopPropagation. Do not rewrite it." Wire `onCheckedChange` + Enter handler + `aria-disabled` while pending. [verified]
- `apps/web/src/components/recipes/TodoItem.module.css` — has `.complete` (strikethrough + muted) and `.pending` (`--color-pending`, no transition on onset; settle transitions via `--motion-settle`). ADD the pending-over-complete precedence. [verified]
- `apps/web/src/components/primitives/Checkbox.tsx` — already exposes `onCheckedChange` (adapts native `onChange`) — just unused today. No primitive change needed. [verified]
- `apps/web/src/components/primitives/LiveRegion.tsx` — `aria-live="polite"`, imperative `announce(message)`; de-dupe/copy rules live in App/hooks. Reuse the App-owned instance via the `announce` callback. [verified]

### Gotchas (learned from 1.7 + verified in code)

1. **Nested `<label>` double-fire.** `TodoItem`'s row `<label>` wraps `Checkbox`, which renders its **own** `<label><input/></label>`. Once `onCheckedChange` is live, a single click could dispatch toggles from both labels. **Add a test asserting exactly one `onToggle` per click / per Space / per Enter.** If a double-fire appears, fix it *inside* `Checkbox`/`TodoItem` without altering the external row DOM contract (AC 10) — e.g. make the row the single label source. Do not change the `<label>`+`<span>` structure Epic 2/3 depend on.
2. **Enter ≠ Space on a checkbox.** Native checkboxes toggle on Space only. AC 2 requires Enter too → explicit `onKeyDown` handler with `preventDefault`, guarded by `!pending`.
3. **Per-id, never whole-snapshot.** 1.7 fixed cross-contamination by rolling back only the affected id on error. Toggle must do the same (revert the one row's `completed`, not restore the whole `previous` array) so concurrent in-flight rows survive.
4. **Response shape-guard (1.7 code-review fix).** `createTodo` was casting `as Todo` without validation; the fix added the `isTodo` guard. `patchTodo` must reuse `isTodo` — a malformed 2xx body throws to `onError`, never crashes the render.
5. **Scope boundary — no inline error recovery UI.** AC 5 is *refetch + announce once*. The Retry/Dismiss left-border error-bar affordance in the UX spec ("Decision 2") is **failed-create recovery (Story 1.9) / unread-error indicator (1.10)** — do NOT build it here. Do not stub 1.9/1.10/Epic-2 delete.
6. **Inert pending rows.** Use `aria-disabled="true"` (NOT HTML `disabled`) so focus visibility is preserved; repeat taps/keys are absorbed silently while pending.
7. **Curly apostrophe.** Existing copy uses `’` (U+2019) — match it in the failure string (`Couldn’t …`) for consistency with `LOAD_FAILURE_MESSAGE`.

### Scope boundaries (do NOT implement here)

- **Roving tabindex / Arrow / Home / End / `tabindex` anchor management** → Story 3.1. 1.8 owns only Space/Enter on the label and *establishes* the DOM/anchor position. The native checkbox input remains the focus target for now.
- **Failed-create recovery, Retry/Dismiss, `beforeunload`, ~10 s timeout** → Story 1.9.
- **Unread-error indicator** → Story 1.10.
- **Delete affordance** → Epic 2 (adds a sibling button only).
- **Latency assertion on PATCH (NFR-1, §C-15)** → deferred; not a 1.8 test.

### Library / framework requirements (verified versions)

- TypeScript, Node 24 LTS; React 19 (ref-as-prop) + Vite; **TanStack Query v5** (`useMutation`/`useQueryClient`, key `['todos']`). Backend: Fastify v5 + `@fastify/awilix` (Awilix DI cradle: `request.diScope.cradle.todoRepository`), **TypeBox** validation (closed objects → 400 on extra fields), `better-sqlite3` v12 (synchronous; writes serialize — no parallel same-row PATCH claims). Tests: **Vitest** (unit co-located `*.test.ts`; integration `apps/api/test/integration/`), Playwright deferred (none scaffolded — cover via Vitest as 1.7 did). No new dependency is needed for this story. [Source: architecture.md#Core-Architectural-Decisions]

### Testing standards

- Backend integration runs the **real** app against a real temp-file SQLite via `apps/api/test/integration/helpers/build-test-app.ts` (`buildTestApp()`), no in-memory fake. Extend `todos.routes.test.ts`.
- Backend unit: co-located `todo.repository.test.ts`.
- Frontend: Vitest + Testing Library; mirror `useCreateTodo.test.tsx` (201 lines) and `TodoItem.test.tsx`. Keep `App.axe.test.tsx` and `App.firstInteractive.test.tsx` green.
- CI gates to keep green: `typecheck`, `lint`, `lint:css`, `contrast:check`, `size:check` (rebaseline only if intentional), unit + integration.

### Previous story intelligence (Story 1.7)

- 1.7 **established** the honest-pending shape in `useCreateTodo.ts` and the generic `usePendingPresentation` seam — 1.7's Dev Notes explicitly say toggle "mirrors this exact flow." Reuse both; the only new logic is the in-place success/refetch-on-error divergence above.
- 1.7 code-review fixes (commit `34b346c`) worth not regressing: (a) instruction-line latch in `App.tsx` for seeded lists; (b) `isTodo` response guard in `api/todos.ts`; (c) pending onset has **no** transition (non-flashing swap) — only the settle transitions via `--motion-settle`. Apply the same "no transition on pending onset, transition on settle" rule to the toggle visual.
- 1.7 added the dedicated `--color-pending` (#6e6d67) token to satisfy the ≥3:1 pending-vs-settled contrast gate; toggle pending reuses it — no new token, contrast gate should be unaffected.
- Backend pattern: new operations added **inline** to `todos.route.ts`; new data ops added to the existing repository returning `Todo` (+ any signal). PATCH follows POST's shape.

### Project Structure Notes

- Backend layering (clean-architecture): `routes → handler(inline) → repository`; the repository is the ONLY module importing `better-sqlite3` / knowing snake_case. 404-on-missing-id is a **handler** decision; `updated_at` stamping is **repository** (server time, domains stay pure); canonical order authority is the repository SQL. [Source: architecture.md#Enforcement-Guidelines]
- Frontend boundary: only `hooks/` + `api/` reach the network; `recipes/` + `primitives/` never do. The mutation is owned in `App` so pending state reaches the list (1.7 precedent). [Source: architecture.md#Frontend-Architecture]
- Naming: backend kebab-case role-suffixed files; frontend `PascalCase.tsx` components, `useXxx.ts` hooks. JSON payloads camelCase; DB snake_case (crossed only in `toDomain`). [verified across the touched files]
- No structural conflicts detected. `patchTodoBody` and the SQLite `completed`/`updated_at` columns already exist; the schema-probe in `db/schema.ts` already expects the full table.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1 — Story 1.8 ACs, §A-1/§A-8/§A-11/§C-16, UX-DR15/16/17/19, NFR-1/3/6, FR-10]
- [Source: _bmad-output/planning-artifacts/architecture.md#API-&-Communication-Patterns, #Data-Architecture, #Frontend-Architecture, #Enforcement-Guidelines]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Completion-State-Visual-Treatment, #Pending-State-Visual-Treatment, #Live-Region-Announcements, #Keyboard-Navigation, #Journey-3, #Journey-6, #Reduced-Motion, #Forced-Colors]
- [Source: _bmad-output/implementation-artifacts/1-7-capture-and-confirm-add-a-task.md — honest-pending pattern, code-review fixes]
- Code verified: `apps/api/src/routes/todos.route.ts`, `repositories/todo.repository.ts`, `plugins/{swagger,error-handler,awilix}.ts`, `db/schema.ts`, `types/cradle.ts`; `packages/contracts/src/{todo,error}.schema.ts`; `apps/web/src/App.tsx`, `api/todos.ts`, `hooks/{useCreateTodo,useTodos,usePendingPresentation}.ts`, `components/recipes/{TodoItem,TodoList}.tsx` (+ `.module.css`), `components/primitives/{Checkbox,LiveRegion}.tsx`.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context) — `claude-opus-4-8[1m]`

### Debug Log References

- Backend extra-field 400 (AC 9): the story note assumed TypeBox `Type.Object` is
  closed by default — it is not, so an extra-field PATCH body returned 200. Fixed
  in two parts: (1) `additionalProperties: false` on `patchTodoBody` to CLOSE the
  schema; (2) Fastify's default `removeAdditional: true` then *stripped* the extra
  field (still 200), so set `ajv.customOptions.removeAdditional: false` in
  `server.ts` to make a closed schema REJECT (400) instead of strip. Open schemas
  (`createTodoBody`) are unaffected. All POST tests stayed green.
- ESLint: the initial `jsx-a11y/no-noninteractive-element-interactions` disable
  comment errored because no `jsx-a11y` plugin is configured; removed it (replaced
  with a plain explanatory comment) — the label keydown triggers no configured rule.

### Completion Notes List

- **Backend (AC 7, 9):** `PatchTodoBody` gained `$id` + `additionalProperties:false`
  and is registered in swagger. `todoRepository.updateTodo(id, { completed })`
  stamps a fresh server `updated_at` (never client), leaves `created_at`, returns
  `Todo | null` (null = missing id). New `PATCH /todos/:id` route returns the
  `Todo` directly on 200, constructs the 404 NOT_FOUND envelope inline (the first
  real domain decision), and inherits 400/500 from the error-handler.
- **Frontend (AC 1–6, 8):** `patchTodo` api wrapper mirrors `createTodo` (reuses
  the `isTodo` guard, throws to onError on non-OK/malformed). New `useToggleTodo`
  hook implements the documented honest-pending × in-place divergence: optimistic
  in-place flip → on SUCCESS write the server Todo into the same array slot WITHOUT
  invalidating (so the item never moves mid-session, AC 4) → on ERROR revert that
  one row in place AND invalidate to reconcile (AC 5). Per-row arbitration: a
  second toggle of an in-flight row fires no second PATCH (AC 8). App owns the
  mutation and threads `onToggle`/`togglingIds` through `TodoList` to `TodoItem`,
  which wires the checkbox `onCheckedChange`, an explicit Enter handler (Space is
  native), and `aria-disabled` while pending — without touching the row `<label>`
  DOM contract (AC 10). The reactive `<title>` (AC 6) recomputes from the cache
  unchanged. CSS gives `.pending` precedence over `.complete` so no premature
  strikethrough during the in-flight window; the strikethrough settles via
  `--motion-settle` once pending clears.
- **Tests:** repository unit (toggle flips/advances/null), PATCH integration
  (200/404/400 extra-field/400 wrong-type, updated_at advances, canonical re-sort
  on next GET, OpenAPI doc), `patchTodo` api, `useToggleTodo` (in-place,
  success-no-invalidate, per-id error revert, mixed concurrent, arbitration),
  `TodoItem` (single-fire click/checkbox, Space, Enter, pending inert), and App
  (toggle → PATCH → in-place settle → announce → title; failure announce +
  reconcile). `App.axe`/`App.firstInteractive` stay green.
- **Gates:** typecheck, lint, lint:css, contrast (7/7), size (74653 B ≤ baseline
  +tolerance — no rebaseline), api 38, web 93, unit 16, integration 22 — all pass.
  No new dependencies.

### File List

- packages/contracts/src/todo.schema.ts (modified)
- apps/api/src/plugins/swagger.ts (modified)
- apps/api/src/server.ts (modified)
- apps/api/src/repositories/todo.repository.ts (modified)
- apps/api/src/repositories/todo.repository.test.ts (modified)
- apps/api/src/routes/todos.route.ts (modified)
- apps/api/test/integration/todos.routes.test.ts (modified)
- apps/web/src/api/todos.ts (modified)
- apps/web/src/api/todos.test.ts (modified)
- apps/web/src/hooks/useToggleTodo.ts (new)
- apps/web/src/hooks/useToggleTodo.test.tsx (new)
- apps/web/src/App.tsx (modified)
- apps/web/src/App.test.tsx (modified)
- apps/web/src/components/recipes/TodoList.tsx (modified)
- apps/web/src/components/recipes/TodoItem.tsx (modified)
- apps/web/src/components/recipes/TodoItem.test.tsx (modified)
- apps/web/src/components/recipes/TodoItem.module.css (modified)
- _bmad-output/implementation-artifacts/1-8-complete-uncomplete-a-task.md (modified)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified)

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-25 | Implemented Story 1.8 — complete/uncomplete a task via whole-row toggle (PATCH /todos/:id, honest-pending × in-place placement). All ACs satisfied; all gates green. Status → review. |
