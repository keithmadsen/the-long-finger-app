---
baseline_commit: c6cbf81231fc2e581152262e6d027774f881a282
---

# Story 1.9: Failed-create recovery

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Primary User,
I want a failed task creation to stay visible with my text intact and a way to retry,
so that a typed task is never silently lost and I can recover without losing my place.

## Acceptance Criteria

1. **Failed variant in place.** Given a create fails (or its pending state exceeds the ~10s timeout), when the failure surfaces, then the row transitions to the **Failed** variant **in place** — `4px solid var(--color-error)` left border, **empty checkbox slot** (no server item to toggle), the submitted text at **full contrast** (`--color-on-surface`, not muted), and **Retry + Dismiss** text affordances — **without overwriting whatever I'm currently typing** in the capture input. [Source: epics.md#Story-1.9; ux-design-specification.md#Decision-2 (lines 724–730); #State-Machine (line 1239)]

2. **Retry re-attempts.** Given a failed row, when I tap **Retry**, then the row returns to the pending state (left-border removed, honest-pending muted treatment applies, `aria-busy` returns to `true`) and **re-attempts** the create **with the same UUIDv7 id** (server is idempotent on id → 201 new / 200 existing); on success it settles, on failure it returns to Failed. Retry is single-tap, no confirmation. [Source: epics.md#Story-1.9; ux-design-specification.md#Decision-2 (line 728); Journey-5 (line 1094); epics.md#Story-1.7 (line 278 — the duplicate-id 200 path that makes Retry safe)]

3. **Dismiss removes + aborts.** Given a failed row, when I tap **Dismiss**, then the row is removed and any in-flight request for it is **aborted via its per-row `AbortController`** (best-effort; if the POST already completed server-side, the task appears on the next refetch — server-of-truth reconciliation). [Source: epics.md#Story-1.9; ux-design-specification.md#Journey-5 (line 1092); #Implementation-Notes (line 1250)]

4. **Announce failure once.** Given a create failure, when it occurs, then the `<LiveRegion>` announces `"Couldn’t save ‘{description}’. Use Retry to try again."` **once**. Repeated failures of the **same submit** (including a retry that fails again) do **not** re-announce — the visual Failed row carries the repeat signal. [Source: epics.md#Story-1.9; ux-design-specification.md#2.6-Live-Region-Announcements (line 439); recovery-model (line 415)]

5. **`aria-describedby` + `beforeunload` while failed.** Given a failed row exists, when it renders, then it carries an `aria-describedby` reference to **hidden text** stating `"Your typed text is saved here until you retry, dismiss, or refresh."` **And** a `beforeunload` handler is **active** while any row is in the Failed state. [Source: epics.md#Story-1.9; ux-design-specification.md#Decision-2 (lines 730, 732); #Implementation-Notes (line 1247)]

6. **Wall-clock ~10s timeout.** Given a pending create, when the ~10s timeout is evaluated, then it is computed against a **wall-clock / monotonic deadline** (checked on a render tick **and** on `visibilitychange`), **NOT a naive `setTimeout`** — so it still fires correctly after a backgrounded tab or laptop sleep (UX-DR29). Tested by **injecting the clock** and **simulating a time jump**. The timeout transitions the row to Failed; it does **NOT** abort the in-flight request (only Dismiss aborts — see AC 3 / Dev Notes). [Source: epics.md#Story-1.9; ux-design-specification.md#Step-7-§2.5 (line 401); #Chaos-Behaviour-Reference (line 1134); #Implementation-Notes (line 1249)]

7. **`beforeunload` detaches when last failure clears.** Given all failed rows are resolved, when the last one clears (retry succeeds / dismiss), then the `beforeunload` handler is **detached**. Verified at the **attach/detach level** — the native browser confirmation dialog itself is NOT asserted in automated tests (it is not reliably scriptable). [Source: epics.md#Story-1.9; ux-design-specification.md#Decision-2 (line 732)]

8. **Mixed-outcome isolation.** Given a burst where one create fails and another succeeds, when both resolve, then the success settles (and its `onSettled` invalidation refetch) does **NOT** wipe or clear the failed row, and the failure adds only its own Failed row — no cross-contamination of the shared `['todos']` cache. (This is the 1.9 analog of the Story 1.7 mixed-outcome contract and is the reason failed rows live in client state, not the invalidate-able cache — see Dev Notes.) [Source: epics.md#Story-1.7 (line 280); architecture.md#Process-Patterns]

## Tasks / Subtasks

- [x] **Frontend: `createTodo` accepts an `AbortSignal`** (AC 3)
  - [x] In `apps/web/src/api/todos.ts`, add an optional `signal?: AbortSignal` parameter to `createTodo(body, signal?)` and pass it into the `fetch('/todos', { ..., signal })`. Do **not** wrap the `await fetch(...)` call in try/catch — an aborted fetch throws a `DOMException` named `'AbortError'` from `fetch` itself (before the `response.ok` check), and that error must propagate **un-wrapped** so the mutation's `onError` can detect it by `name === 'AbortError'` (see the hook task). The existing non-OK throw and the malformed-body `isTodo` guard are unchanged. [Source: ux-design-specification.md#Journey-5 (line 1092)]

- [x] **Frontend: extend `useCreateTodo` to own the full create lifecycle** (AC 1, 2, 3, 4, 6, 8) — the central change of this story
  - [x] Add a per-id **`AbortController` map** (a `useRef<Map<string, AbortController>>`). Create a controller per submit/retry; pass `controller.signal` to `createTodo(body, signal)`. Drop the controller for an id on settle.
  - [x] Add **failed-create client state** separate from the `['todos']` cache: `const [failedCreates, setFailedCreates] = useState<readonly Todo[]>([])` (each entry is the snapshotted pending `Todo` for a failed id — keeps its `description` + timestamps so the row renders with text intact). **Why separate state and not the cache:** a sibling success's `onSettled` invalidation refetches the server list (which never contains a failed-only optimistic row) and would WIPE a failed row left in the cache — breaking AC 8. Keeping failed rows in `useState` makes them immune to invalidation. (See Dev Notes “The one critical design decision”.)
  - [x] Add an **announce-once guard**: a `useRef<Set<string>>` of ids already announced as failed (AC 4). Add an id on first failure announce; never re-announce while the id stays failed; clear it when the id is dismissed or retried-successfully.
  - [x] Add a **deadline map** for the ~10s timeout: `useRef<Map<string, number>>` of `id → deadlineMs` (= `clock.now() + CREATE_TIMEOUT_MS`). Set on submit/retry; delete on settle/markFailed/dismiss.
  - [x] Introduce a single `markFailed(id)` helper (idempotent) used by **both** the mutation `onError` path and the timeout path:
    - read the row for `id` from the `['todos']` cache; if present, snapshot it into `failedCreates`; **remove it from the `['todos']` cache** (filter by id — the same per-id removal 1.7 used, never a whole-snapshot restore); remove `id` from `pendingIds`; delete its deadline.
    - if the id is **not already** in the announce-once set, `announce("Couldn’t save ‘{description}’. Use Retry to try again.")` and add it to the set (AC 4). Use the **curly** apostrophe/quotes (`’ ‘ ’`) to match existing copy.
  - [x] `onError(error, body)`: **if `error.name === 'AbortError'` → return immediately** (a Dismiss aborted this in flight; Dismiss already cleaned up — do NOT mark failed, do NOT announce). Otherwise `markFailed(body.id)`. **Do NOT invalidate on failure** (nothing server-side to reconcile; invalidation would wipe sibling failed rows — AC 8).
  - [x] `onSuccess(_created, body)`: announce `"{description} added."`; `onCreated?.()`; **clear** this id from `failedCreates` and the announce-once set and the deadline map (covers the timeout→Failed→late-success case where the original request eventually succeeds).
  - [x] `onSettled(_d, error, body)`: `removePending(body.id)`; drop the AbortController for the id; **invalidate `['todos']` ONLY when `!error`** (success settle = refetch, as 1.7). On the failure path, invalidation is skipped to protect sibling failed rows (AC 8).
  - [x] Add **`retry(id)`**: read the failed `Todo` from `failedCreates`; remove it from `failedCreates` + announce-once set; re-add an optimistic pending row to the `['todos']` cache (prepend, same as the original create) and to `pendingIds`; create a fresh `AbortController` + deadline; re-fire `mutation.mutate({ id, description })` with the **same id**. (Retry deliberately does **not** abort the original — UX line 1094.)
  - [x] Add **`dismiss(id)`**: `controller.abort()` for the id if present (then drop it); remove the id from `failedCreates`, `pendingIds`, the announce-once set, the deadline map; ensure it is absent from the `['todos']` cache (filter by id — covers the timeout-then-dismiss case if it was somehow still there).
  - [x] **Timeout mechanism (wall-clock, injectable clock).** Accept an optional `clock: PendingClock = realClock` param (import `PendingClock`, `realClock` from `usePendingPresentation.ts` — do NOT define a second clock interface). Define `export const CREATE_TIMEOUT_MS = 10_000`. Implement `checkDeadlines()` that iterates the deadline map and `markFailed(id)`s every id whose `clock.now() >= deadline`. Drive `checkDeadlines` from: (a) an effect that re-runs when `pendingIds` changes and arms `clock.setTimeout` for the **soonest** outstanding deadline (fast path), and (b) a `visibilitychange` listener that calls `checkDeadlines()` on foreground (the backgrounded-tab/laptop-sleep path — a `setTimeout` alone is unreliable across sleep, so the visibility re-check is the real guarantee, AC 6). Clear timers/listeners on unmount.
  - [x] Return shape: `{ submit, pendingIds, failedCreates, retry, dismiss }`.
  - [x] Keep the existing `onMutate` (cancel → snapshot → prepend pending → addPending) and the `submit(description)` UUIDv7 generation unchanged. The mutationFn becomes `({ id, description }) => createTodo({ id, description }, controllerFor(id).signal)`.

- [x] **Frontend: render failed rows + thread retry/dismiss** (AC 1, 2, 3, 5)
  - [x] In `apps/web/src/App.tsx`, destructure `failedCreates, retry, dismiss` from `useCreateTodo`. Build the render list by **prepending** `failedCreates` above `data`: `const rows = [...failedCreates, ...(data ?? [])]`. Pass `failedIds={new Set(failedCreates.map(t => t.id))}`, `onRetry={retry}`, `onDismiss={dismiss}` to `<TodoList>`. **Important — the surface branch:** the list must render when there are failed rows even if `data` is empty (a single failed create on an otherwise-empty list). Change `renderSurface()` so the populated branch fires when `rows.length > 0` (not `data.length`); the empty-state branch only when `rows.length === 0`. Loading/error branches unchanged.
  - [x] Render the **shared hidden `aria-describedby` text** once (e.g. a visually-hidden `<p id="failed-create-help">Your typed text is saved here until you retry, dismiss, or refresh.</p>`), with a **stable id** every failed row references (AC 5). Reuse the existing accessible-clip pattern (see `LiveRegion.module.css`) via a small CSS-module class; do NOT use `display:none`/`aria-hidden`. Only render it while `failedCreates.length > 0`.
  - [x] Add the **`beforeunload` effect** owned by App (AC 5, 7): when `failedCreates.length > 0`, attach a `beforeunload` handler (`e.preventDefault(); e.returnValue = ''`); when it returns to 0, remove it. Cleanup on unmount. This is the only place the handler is owned (UX line 1247).
  - [x] In `apps/web/src/components/recipes/TodoList.tsx`, add props `failedIds?: ReadonlySet<string>`, `onRetry?: (id: string) => void`, `onDismiss?: (id: string) => void`, and `describedById?: string`. Per item, pass `failed={failedIds?.has(todo.id) ?? false}`, `onRetry={() => onRetry?.(todo.id)}`, `onDismiss={() => onDismiss?.(todo.id)}`, `describedById={describedById}`. A failed row must **not** also be treated as pending or toggling — guard so `pending`/toggle props are not set for ids in `failedIds`.
  - [x] In `apps/web/src/components/recipes/TodoItem.tsx`, add props `failed?: boolean`, `onRetry?: () => void`, `onDismiss?: () => void`, `describedById?: string`. When `failed`, render the **Failed variant** (see Dev Notes for the DOM): the row is **not** a toggle `<label>` (no server item; toggle is inert per UX line 999) — render a non-label row container with an **empty checkbox slot** (preserve row height — `--row-height-touch`, UX-DR22), the description at full contrast (no `.pending`/`.complete` classes), a `.failed` class for the left border, `aria-describedby={describedById}`, and a right-side affordance area with two `<Button>`s: **Retry** then **Dismiss**. `aria-busy` is `false`, the row is not `aria-disabled`. Do NOT wire `onToggle` in the failed branch. Leave the Active/Complete/Pending `<label>` branch (the 1.8 row contract) untouched.

- [x] **Frontend: Failed-variant styles** (AC 1)
  - [x] In `apps/web/src/components/recipes/TodoItem.module.css`, add `.failed` with `border-left: var(--border-width-...) ` — use a **`4px solid var(--color-error)`** left border (introduce a `--border-width-...`/length token only if one matching 4px already exists; otherwise the 4px literal is acceptable here and must match the spec exactly). The failed row keeps `min-height: var(--row-height-touch)` so height is stable (UX-DR22). The description in a failed row stays `--color-on-surface` (full contrast) — ensure no `.pending`/`.complete` color rule applies. The error appearance may fade in via `--motion-settle` (reduced-motion → instant), consistent with the “error appearance” note on `--motion-settle` (UX line 637). Style the Retry affordance text in `--color-accent`, Dismiss in `--color-on-surface-muted`, both `--font-size-secondary` / `--font-weight-medium`, `--space-3` gap; focus uses `--color-focus` (the `<Button>` primitive already supplies the focus ring — verify, don’t re-implement). Under `forced-colors: active` the border + button borders must remain visible (the `<Button>` primitive handles its own forced-colors borders; the left border uses a system color fallback if needed — keep it simple, prefer a visible border).

- [x] **Frontend tests** (AC 1–8)
  - [x] `apps/web/src/api/todos.test.ts`: `createTodo` forwards the `signal` to `fetch`; an already-aborted signal causes the call to reject with an `AbortError` (name preserved, not wrapped).
  - [x] `apps/web/src/hooks/useCreateTodo.test.tsx` (extend the existing file): on error the row is **kept as a failed create** (in `failedCreates`, removed from the `['todos']` cache) and is announced **once**; an `AbortError` does **NOT** mark failed or announce; `retry` re-fires with the **same id** and on success clears the failed row + announces "added"; `dismiss` aborts the controller and removes the failed row; **mixed-outcome** (A fails, B succeeds): B’s success/invalidation does not wipe A’s failed row (AC 8); the **timeout** path — inject a fake clock, submit, advance `now` past `CREATE_TIMEOUT_MS`, fire the deadline timer **and** a `visibilitychange` event, assert the row becomes failed (AC 6) and is **not** aborted; a late success after a timeout→failed clears the failed row.
  - [x] `apps/web/src/components/recipes/TodoItem.test.tsx`: the `failed` variant renders the `.failed` left-border class, full-contrast text, Retry + Dismiss buttons, the `aria-describedby` reference, an empty checkbox slot, `aria-busy=false`, and does **not** fire `onToggle` on row click/Space/Enter; Retry calls `onRetry`, Dismiss calls `onDismiss`.
  - [x] `apps/web/src/App.test.tsx`: a failed create surfaces a failed row + announce; the `beforeunload` handler is **attached** while a failed row exists and **detached** after it resolves (assert via `addEventListener`/`removeEventListener` spies — do NOT assert the native dialog, AC 7); a single failed create renders on an otherwise-empty list (the empty-state is not shown); the shared hidden help text is present with the referenced id.
  - [x] Keep `App.axe.test.tsx` and `App.firstInteractive.test.tsx` green — the capture input must stay the **first interactive element** even with failed rows above the list (failed-row affordances come after the input in DOM order; the input is rendered above the surface). No a11y regression.

- [x] **Gates** (all ACs)
  - [x] Run `npm run typecheck`, `npm test` (workspaces), `npm run test:unit` / `test:integration`, `npm run lint --workspace apps/web`, `npm run lint:css --workspace apps/web`, `npm run contrast:check --workspace apps/web`, and `npm run size:check --workspace apps/web`. This story is **frontend-only** — no backend/contract/schema changes and **no new dependencies** (AbortController is a web standard; the `uuid`/TanStack/React stack already present). Rebaseline `size:check` with `-- --update` only if the genuine additions exceed tolerance.

### Review Findings

- [x] [Review][Patch] Late settlement from the original timed-out request can corrupt an active retry [apps/web/src/hooks/useCreateTodo.ts:199]
- [x] [Review][Patch] Failed row can be lost if a refetch removes the optimistic cache row before failure handling [apps/web/src/hooks/useCreateTodo.ts:108]
- [x] [Review][Patch] Dismissed creates can still produce stale empty failure announcements after best-effort abort misses [apps/web/src/hooks/useCreateTodo.ts:122]
- [x] [Review][Patch] Server row and failed row can duplicate after a commit-with-client-failure refetch [apps/web/src/App.tsx:135]

## Dev Notes

### The one critical design decision: failed rows live in client state, NOT the cache

The 1.7/1.8 honest-pending shape keeps optimistic rows in the `['todos']` cache and settles via `onSettled → invalidateQueries(['todos'])` (settle = refetch). **For a failed create that must stay visible, leaving the row in the cache is wrong**: a _sibling_ create’s success invalidation refetches the server list, which never contains the failed-only optimistic row, so `setQueryData` from the refetch **wipes the failed row** — breaking AC 8 (the 1.9 analog of 1.7’s mixed-outcome “success settles without clearing the other’s error”).

Resolution:

- **Failed rows live in `useState` (`failedCreates`), not the cache.** On failure, snapshot the pending `Todo` out of the cache into `failedCreates`, then remove it from the cache (per-id, never whole-snapshot). Invalidation can never touch `failedCreates`.
- **The failure path never invalidates** (`onSettled` invalidates only when `!error`). There is nothing server-side to reconcile for a failed create.
- **App merges for render**: `rows = [...failedCreates, ...data]`, prepended (failed rows pinned at top, matching where new creates prepend). The frontend still never re-sorts the _server_ list (AC 8 of 1.6/1.7 intact) — `failedCreates` is a separate client-only collection.

**“In place” nuance (document this for the reviewer):** epics says the row transitions to Failed _in place_. At the moment of failure the row IS in place (full text intact, same visible position). Because failed rows move to a separate collection (to survive invalidation), their exact array index relative to later cache refetches is not strictly preserved — they are pinned at the top of the list. This is the deliberate trade-off that makes AC 8 (mixed-outcome isolation) achievable, and it satisfies the three real contracts of the recovery model: (a) typed text never lost, (b) current typing never overwritten, (c) never silently failed. [Source: ux-design-specification.md#recovery-model (line 417)]

### The create lifecycle state machine (what each id can be at any moment)

```
submit ── onMutate ──▶ Pending (in cache + pendingIds)
Pending ── onSuccess ──▶ Active (cache, canonical after invalidate)
Pending ── onError (non-abort) ──▶ Failed (in failedCreates, out of cache)
Pending ── deadline ≥ now (timeout) ──▶ Failed (request still in flight, NOT aborted)
Failed  ── retry ──▶ Pending (same id, fresh controller/deadline)
Failed  ── dismiss ──▶ Removed (abort in-flight, drop everything for id)
Failed (from timeout) ── late onSuccess ──▶ Active (onSuccess clears failedCreates)
Failed (from timeout) ── late onError ──▶ stays Failed (markFailed idempotent, no re-announce)
```

The **single keying discipline**: every map/set/collection is keyed by the client UUIDv7 `id`, which is stable across the entire lifecycle (that’s why the same id is reused on retry and why the server’s idempotent-on-id 200 path, asserted in 1.7, makes retry safe). [Source: architecture.md (lines 160, 224); epics.md#Story-1.7 (line 278)]

### Abort handling — the Dismiss race

`AbortController` is owned per-row by the create hook (UX line 1250 says `<TodoItem>` “owns” it, but in this codebase the mutation is owned by the hook in App, and that is where the controller must live so it survives row re-renders — this is the same “App owns the mutation so pending state reaches the list” precedent from 1.7/1.8). The only consumer that aborts is **Dismiss**. The race: Dismiss aborts → the in-flight `fetch` rejects → the mutation’s `onError` fires for an id we just removed. Guard it: **`onError` returns early when `error.name === 'AbortError'`** (the dismiss path already cleaned up). `createTodo` must therefore let the native `AbortError` propagate un-wrapped (don’t catch the `fetch` call). [Source: ux-design-specification.md#Journey-5 (lines 1092, 1094)]

### The ~10s timeout MUST be wall-clock, not naive `setTimeout` (UX-DR29)

A naive `setTimeout(…, 10000)` does not fire reliably across a backgrounded tab or laptop sleep — the timer is throttled/suspended. AC 6 requires a **wall-clock/monotonic deadline**: snapshot `clock.now() + CREATE_TIMEOUT_MS` at submit; re-check on (a) a render-tick/`pendingIds`-change effect armed for the soonest deadline and (b) `visibilitychange` foreground. The `visibilitychange` re-check is the real guarantee — when the tab wakes, `checkDeadlines()` immediately fails any id whose deadline already passed. Use the **injectable `PendingClock`** (reused from `usePendingPresentation.ts`) so the test can advance `now` to simulate a time jump and fire `visibilitychange`. Do NOT bury a bare `setTimeout` in a component. [Source: ux-design-specification.md (lines 401, 1134, 1249); architecture.md (the honest-pending injectable-clock posture)]

### Files to touch — current state vs. what to add

**Frontend (this story is frontend-only)**

- `apps/web/src/api/todos.ts` — `createTodo(body)` exists; ADD optional `signal?` param threaded to `fetch`. Leave the `await fetch` un-try/catch’d so `AbortError` propagates. `getTodos`/`patchTodo`/`isTodo` unchanged. [verified]
- `apps/web/src/hooks/useCreateTodo.ts` — currently: `onError` simply **removes** the row (its own comment says “In 1.7 a failed create simply disappears; the Failed-variant UI, Retry and the ~10s timeout are Story 1.9”). This story REPLACES that removal with `markFailed`, and ADDS the controller map, `failedCreates` state, announce-once guard, deadline map + timeout mechanism, `retry`, `dismiss`, and the injectable clock param. The `onMutate` prepend + `submit` UUIDv7 are unchanged. [verified]
- `apps/web/src/hooks/usePendingPresentation.ts` — NO changes; IMPORT `PendingClock` + `realClock` from it for the timeout clock. [verified]
- `apps/web/src/App.tsx` — owns `useCreateTodo`, the single `<LiveRegion>`, `announce`, the reactive `<title>`, the instruction-line latch. ADD: destructure `failedCreates/retry/dismiss`; merge `rows = [...failedCreates, ...data]`; thread `failedIds/onRetry/onDismiss/describedById` to `<TodoList>`; the shared hidden help text; the `beforeunload` effect; the surface branch must use `rows.length` (a lone failed row renders, no empty-state). The header comment currently says “Explicitly NOT here (later stories): Failed-create recovery / beforeunload (1.9)…” — this is the story that fills the 1.9 part (leave 1.10/Epic-2 out). [verified]
- `apps/web/src/components/recipes/TodoList.tsx` — threads `pendingIds`/`togglingCompletedById`/`onToggle` today. ADD `failedIds`/`onRetry`/`onDismiss`/`describedById`; ensure a failed id is not also marked pending/toggling. [verified]
- `apps/web/src/components/recipes/TodoItem.tsx` — renders the Active/Complete/Pending whole-row `<label>` (the 1.8 contract). ADD a `failed` branch that renders the Failed variant (non-label row, empty checkbox slot, full-contrast text, `aria-describedby`, Retry + Dismiss `<Button>`s, `.failed` class). Do NOT alter the existing `<label>` branch (1.8 AC 10 — Epic 2 still adds a sibling delete button to it). The Failed variant being a distinct internal branch is explicitly sanctioned by UX line 815 (“the existing `<TodoItem>` … with a `failed` variant”). [verified]
- `apps/web/src/components/recipes/TodoItem.module.css` — has `.item`/`.description`/`.pending`/`.complete`/precedence rules. ADD `.failed` (4px left border in `--color-error`, stable height) + Retry/Dismiss affordance layout. [verified]
- `apps/web/src/components/primitives/Button.tsx` — REUSE for Retry/Dismiss (it owns the focus ring, `aria-disabled`/`pending` click-guard, forced-colors border). Do NOT build a new affordance primitive. [verified]
- `apps/web/src/components/primitives/LiveRegion.tsx` + the App `announce` callback — REUSE for the failure announcement. The de-dupe (announce-once) rule lives in the hook, not the primitive. [verified]
- Visually-hidden text: there is NO shared `.visually-hidden` utility class — the accessible clip pattern lives in `LiveRegion.module.css`/`Checkbox.module.css`. For the `aria-describedby` help text, reuse that clip idiom in a CSS-module class (NOT `display:none`/`aria-hidden`, which would hide it from `aria-describedby`). [verified]

### Design tokens (all already exist — verified in `apps/web/src/styles/tokens.css`)

- `--color-error: #a02d2d` (left-border + error text), `--color-accent: #3d5a80` (Retry), `--color-on-surface: ...` (full-contrast failed text), `--color-on-surface-muted: #5a5954` (Dismiss), `--color-focus: #3d5a80`, `--font-size-secondary: 14px`, `--font-weight-medium: 500`, `--space-3: 12px`, `--row-height-touch`, `--motion-settle: 220ms` (collapses to 0 under reduced-motion). No new token is required; the only raw literal permitted is the `4px` left-border width if no matching length token exists. [Source: ux-design-specification.md#Decision-2 (line 726); tokens.css]

### Scope boundaries (do NOT implement here)

- **Unread-error indicator (`"N error(s) above"`)** → **Story 1.10**. Do NOT build the `<UnreadErrorIndicator>` here, even though the UX recovery model lists it adjacent to failed-create. 1.9 builds the Failed row + its Retry/Dismiss; 1.10 adds the indicator that scrolls to and focuses that Retry. [Source: epics.md#Story-1.10 (line 333 — “Depends on Story 1.9”)]
- **Delete affordance** → Epic 2 (adds a sibling delete `<button>` to the Active/Complete `<label>` row — do NOT touch that branch beyond leaving it intact).
- **Roving tabindex / Arrow / Home / End** → Story 3.1. Within a failed row, Tab moves Retry → Dismiss → out (native tab order of two buttons — no custom key handling needed here). [Source: ux-design-specification.md (line 1390)]
- **localStorage persistence of failed rows** → explicitly out of scope (UX line 734 — `beforeunload` is the protection, not persistence; a confirmed unload accepts the loss).
- **No backend changes** — the duplicate-id 200 path that makes Retry safe was already built and tested in Story 1.7/1.2 (idempotent insert on id). Do not add or modify endpoints.

### Gotchas (learned from 1.7/1.8 + verified in code)

1. **`onError` removal → `markFailed` is the core behavioral change.** The single most important diff is that a failed create no longer disappears. Re-read the existing `onError` comment in `useCreateTodo.ts` before editing — it explicitly defers to this story.
2. **Don’t invalidate on the failure path** — `onSettled` must guard `if (!error) invalidate`. Invalidating on failure would refetch and, combined with sibling successes, wipe failed rows (AC 8).
3. **AbortError must not be wrapped** — keep `createTodo`’s `await fetch(...)` outside any try/catch so `error.name === 'AbortError'` is detectable in `onError`. The existing try/catch wraps only the JSON parse; leave it that way.
4. **Announce-once is per-id and survives retries** — a retry that fails again must NOT re-announce (AC 4). The guard set is cleared only on dismiss or successful settle.
5. **Empty-list + one failed row** — the App surface branch currently keys on `data.length`; switch the populated/empty decision to the merged `rows.length`, or a lone failure shows the empty-state and the failed row vanishes.
6. **First-interactive invariant** — failed rows render in the list _below_ the capture input (the input sits above the surface). The Retry/Dismiss buttons must not precede the input in DOM order. Keep `App.firstInteractive.test.tsx` green.
7. **Curly apostrophe/quotes** — match existing copy: `Couldn’t save ‘{description}’. Use Retry to try again.` (U+2019 / U+2018 / U+2019). Compare with `LOAD_FAILURE_MESSAGE` and the 1.8 toggle-failure string.
8. **Failed rows are inert for toggle** — render the failed variant as a non-`<label>` row so a tap doesn’t attempt a toggle on a non-existent server item (UX line 999). Only Retry/Dismiss are interactive.
9. **`beforeunload` needs both `preventDefault()` and `e.returnValue = ''`** for cross-browser prompting; attach/detach is the only assertable behavior (AC 7).

### Library / framework requirements (verified versions)

- TypeScript, Node 24 LTS; React 19 (ref-as-prop) + Vite; **TanStack Query v5** (`useMutation`/`useQueryClient`, single key `['todos']`). `AbortController`/`AbortSignal` are web standards (no polyfill, no dep). `uuid` `v7()` already present for the client id. Tests: **Vitest** + Testing Library; fake timers / injected `PendingClock` for the timeout. **No new dependency** for this story. [Source: architecture.md#Core-Architectural-Decisions; #Process-Patterns]

### Testing standards

- Frontend Vitest + Testing Library, co-located `*.test.ts(x)`. Mirror `useCreateTodo.test.tsx` (the existing honest-pending tests) and `TodoItem.test.tsx`. Drive the timeout with the injectable clock (advance `now`, fire the deadline timer + a `visibilitychange` event) — do NOT rely on real wall-clock waits.
- `beforeunload`: assert `window.addEventListener('beforeunload', …)` / `removeEventListener` via spies; the native dialog is not scriptable (AC 7).
- CI gates to keep green: `typecheck`, `lint`, `lint:css`, `contrast:check`, `size:check` (rebaseline only if intentional), unit + integration. Keep `App.axe.test.tsx` and `App.firstInteractive.test.tsx` green.

### Previous story intelligence (Stories 1.7 & 1.8)

- **1.7 established** the honest-pending shape in `useCreateTodo.ts`, the `isTodo` response guard in `api/todos.ts`, the App-owned mutation + `announce`, and the instruction-line latch. 1.7’s `onError` deliberately just removes the row and defers the Failed UI to THIS story. The duplicate-id 200 integration test (1.7 AC, epics line 278) was added specifically so 1.9’s Retry is idempotent-safe. [Source: 1-7-capture-and-confirm-add-a-task.md]
- **1.8 established** the per-row in-flight arbitration discipline (`useToggleTodo`), the “inert pending row via `aria-disabled`, never HTML `disabled`” rule, and the whole-row `<label>` DOM contract (1.8 AC 10) that the Active/Complete variant must keep — the Failed variant is a separate branch and does NOT touch it. 1.8 also confirmed the “per-id, never whole-snapshot” rollback rule (apply it to `markFailed`’s cache removal). [Source: 1-8-complete-uncomplete-a-task.md]
- **Recent commits** (`c6cbf81` 1.8 review fixes, `9e0855e` 1.8) show the established patterns: client-only presentation state in refs/state (never on the `Todo` contract); App owns mutations so their state reaches the list; mutation hooks announce, primitives stay passive.

### Project Structure Notes

- Frontend boundary: only `hooks/` + `api/` reach the network; `recipes/` + `primitives/` never do. The create mutation (and now its AbortController + failed state) is owned in `App` via `useCreateTodo` so its state reaches the list (1.7/1.8 precedent). [Source: architecture.md#Frontend-Architecture]
- Naming: `PascalCase.tsx` components, `useXxx.ts` hooks, camelCase payloads. Client-only presentation state (pending ids, failed creates, controllers, deadlines) is NEVER a field on the `Todo` contract — keep it in hook refs/state. [verified across 1.7/1.8]
- No structural conflicts. The `Todo` contract, the `['todos']` key, and the tokens all already exist. No backend/contract/schema/migration changes.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1 — Story 1.9 ACs (lines 304–318); Story 1.7 line 278 (idempotent-retry test); Story 1.10 line 333 (the 1.10 dependency boundary)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — §2.5 recovery model (lines 400–419), §2.6 announcements (lines 427–445), Decision 2 / failed-row treatment + beforeunload + aria-describedby (lines 708–736), Journey 5 (lines 1052–1094), Chaos Behaviour Reference (lines 1133–1138), `<TodoItem>` state machine + visual variant table (lines 1207–1250), inert pending/failed rows (line 999), failed-row Tab order (line 1390)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Honest-pending mutation flow / Process Patterns (lines 281–294), client-generated UUIDv7 + idempotent retry (lines 160, 224), Frontend Architecture / hooks layer (lines 403–443)]
- [Source: _bmad-output/implementation-artifacts/1-7-capture-and-confirm-add-a-task.md — honest-pending definition, isTodo guard, App-owned mutation]
- [Source: _bmad-output/implementation-artifacts/1-8-complete-uncomplete-a-task.md — per-id rollback, inert-row/aria-disabled rule, `<label>` DOM contract (AC 10)]
- Code verified: `apps/web/src/App.tsx`, `api/todos.ts`, `hooks/{useCreateTodo,useToggleTodo,useTodos,usePendingPresentation}.ts`, `components/recipes/{TodoItem,TodoList,CaptureInput}.tsx` (+ `.module.css`), `components/primitives/{Button,LiveRegion,Checkbox}.tsx` (+ `.module.css`), `styles/tokens.css`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) via the bmad-dev-story workflow.

### Debug Log References

- All web gates green under Node 24 (project `engines: >=24`): `typecheck`, `test` (114 web tests), `lint`, `lint:css`, `contrast:check` (7/7 token pairs), `size:check` (75163 B gz ≤ 75162 B baseline + 512 B tolerance — within tolerance, NO rebaseline).
- Full regression under Node 24: web 114, api 38, `test:unit` 16, `test:integration` 22 — all pass.
- Environment note (NOT a code regression): the api tests fail under the shell's default Node v22 with a `better-sqlite3` native-ABI mismatch (`NODE_MODULE_VERSION 137` vs `127`). The binding is compiled for the project's required Node 24; running the suite under `nvm use 24` makes all api tests pass. This story is frontend-only and touched zero files under `apps/api`.

### Completion Notes List

- **`createTodo(body, signal?)`** (`api/todos.ts`): optional `AbortSignal` threaded to `fetch`; the `await fetch(...)` stays outside try/catch so a native `AbortError` propagates un-wrapped for `onError` detection. The malformed-body try/catch is unchanged.
- **`useCreateTodo` now owns the full create lifecycle.** Failed creates live in `useState` (`failedCreates`), NOT the `['todos']` cache — the one critical design decision that makes AC 8 (mixed-outcome isolation) work: a sibling success's `onSettled` invalidation refetch can never wipe a failed row. The failure path never invalidates. Added: per-id `AbortController` map, announce-once `Set`, `id→deadlineMs` map, idempotent `markFailed` (used by both `onError` and the timeout), `retry` (same id reused; does NOT clear the announce-once guard so a re-failed retry does not re-announce — AC 4 / gotcha 4), and `dismiss` (aborts the in-flight request + clears all per-id state).
- **Wall-clock ~10s timeout (UX-DR29).** `CREATE_TIMEOUT_MS = 10_000`; deadlines checked via (a) an effect armed for the soonest deadline (re-runs on `pendingIds` change) and (b) a `visibilitychange` foreground re-check — the real guarantee across a backgrounded tab / laptop sleep. Reuses the injectable `PendingClock`/`realClock` from `usePendingPresentation.ts` (`realClock` is now exported); tests advance a fake clock and fire both paths. The timeout transitions to Failed but does NOT abort the in-flight request (only Dismiss aborts).
- **Rendering.** `App` merges `rows = [...failedCreates, ...data]` (failed rows pinned at top), switches the surface branch to `rows.length` (a lone failed row renders, no empty-state), renders the shared visually-hidden `aria-describedby` help text (accessible-clip class, not `display:none`), and owns the `beforeunload` effect (attach while `failedCreates.length > 0`, detach when it clears). `TodoList` threads `failedIds/onRetry/onDismiss/describedById` and guards a failed id out of pending/toggling. `TodoItem` gains a distinct Failed branch: non-`<label>` row, empty checkbox slot (`--space-5`), full-contrast text, `.failed` 4px `--color-error` left border, Retry + Dismiss `<Button>`s, `aria-busy` false, inert toggle. The 1.8 Active/Complete/Pending `<label>` contract is untouched.
- **Tests.** `todos.test.ts` (signal forwarding + un-wrapped AbortError); `useCreateTodo.test.tsx` (failed→announce-once, retry same-id+success-clears, retry-refail no re-announce, mixed-outcome AC 8, timeout via armed timer + via visibilitychange, dismiss aborts + no re-announce, late-success-after-timeout clears); `TodoItem.test.tsx` (failed variant DOM + inert toggle + Retry/Dismiss); `App.test.tsx` (lone failed row + hidden help text + announce, beforeunload attach/detach via spies, Retry settles to a normal row). `App.axe.test.tsx` and `App.firstInteractive.test.tsx` remain green (input stays first interactive; no a11y regression).
- **Scope honored:** no backend/contract/schema changes, no new dependencies, 1.10 unread-error indicator and Epic-2 delete left out.

### File List

- apps/web/src/api/todos.ts (modified)
- apps/web/src/api/todos.test.ts (modified)
- apps/web/src/hooks/useCreateTodo.ts (modified)
- apps/web/src/hooks/useCreateTodo.test.tsx (modified)
- apps/web/src/hooks/usePendingPresentation.ts (modified — export `realClock`)
- apps/web/src/App.tsx (modified)
- apps/web/src/App.test.tsx (modified)
- apps/web/src/App.module.css (modified — `.visually-hidden` clip class)
- apps/web/src/components/recipes/TodoList.tsx (modified)
- apps/web/src/components/recipes/TodoItem.tsx (modified)
- apps/web/src/components/recipes/TodoItem.test.tsx (modified)
- apps/web/src/components/recipes/TodoItem.module.css (modified — `.failed`, `.slot`, `.affordances`, affordance colours)

## Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-27 | Story 1.9 created — failed-create recovery (Failed row variant, Retry/Dismiss + per-row AbortController, announce-once, aria-describedby, beforeunload, wall-clock ~10s timeout). Status → ready-for-dev.                                                                                                                                                                                          |
| 2026-06-28 | Story 1.9 implemented — `createTodo` AbortSignal; `useCreateTodo` full lifecycle (failedCreates state, controller/deadline maps, markFailed/retry/dismiss, wall-clock timeout via injectable clock + visibilitychange); App merge/beforeunload/hidden help text; TodoList/TodoItem Failed variant + styles. Tests added across api/hook/component/App. All gates green (Node 24). Status → review. |
