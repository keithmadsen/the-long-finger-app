---
baseline_commit: 1bb61a1e79fd019532825ca64680479009310234
---

# Story 2.2: Inline two-step delete affordance

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Primary User,
I want deleting a task to require an arm-then-confirm step that protects me from accidental, irreversible removal,
so that I can clear tasks I no longer need without fear of deleting the wrong one.

## Acceptance Criteria

**Inline two-step delete affordance (from epics.md Epic 2 › Story 2.2):**

1. **Given** a todo row, **When** I view it, **Then** a small `Delete` text affordance appears at the right (always visible on touch; revealed on row hover on pointer devices via `@media (hover: hover)`), and tapping it does not toggle the row's completion (`stopPropagation`).
2. **Given** the idle `Delete` affordance, **When** I tap it once, **Then** it transforms in place to `Confirm` in `--color-error` via `--motion-settle` — no modal, no overlay, no row-height change.
3. **Given** the armed `Confirm`, **When** I tap it within 300 ms of arming, **Then** the tap is absorbed and does NOT commit (muscle-memory protection); **When** I tap it after 300 ms, **Then** the delete commits.
4. **Given** an armed affordance, **When** 5 seconds pass with no commit, **Then** it reverts to idle (the 5 s floor is unchanged under reduced-motion, since it is a safety window, not motion).
5. **Given** an armed affordance, **When** I tap elsewhere (another row, the input, anywhere), or focus leaves it, or I arm a different row, **Then** it reverts to idle and at most one row is armed at a time (coordination owned by `<TodoList>`).
6. **Given** the 300 ms no-commit window and 5 s auto-revert timers, **When** implemented, **Then** they are driven by an injectable clock (the SAME `PendingClock` mechanism as the honest-pending thresholds — `usePendingPresentation`), so the Story 2.3 race tests are deterministic rather than wall-clock-flaky.
7. **Given** an armed affordance after the 300 ms no-commit window, **When** I tap `Confirm` again, **Then** it commits the delete (a second tap after the window is COMMIT, not cancel — cancel paths remain wait-5 s / tap-away / blur / arm-another-row).
8. **Given** a committed delete, **When** the row leaves the list, **Then** it fades via `--motion-settle` and the list does not reflow other rows abruptly.

### Explicitly OUT of scope for this story (Story 2.3 — do NOT build here)

Deferring these is deliberate — building them now creates dead code and pre-empts 2.3's ACs (mirror how 2.1 deferred announcements). This story is the **visual + timing state machine only**:

- **`aria-pressed`** on the armed button, and the enriched accessible names `"Delete '{description}'"` / `"Confirm deletion of '{description}', press again within 5 seconds to delete"` → **Story 2.3 AC 1**. In this story the button's **visible text is its accessible name** (`Delete` → `Confirm`); 2.3 upgrades it with `aria-label` + `aria-pressed`.
- **`<LiveRegion>` announcements** `"{description} deleted."` (success) and the failure announcement → **Story 2.3 AC 2, 5**. Do NOT add an `announce` option or copy here. `useDeleteTodo` already has NO announce param (2.1) — keep it that way.
- **Focus management** on auto-revert / removal (never strand focus on a removed node; move to the row anchor) → **Story 2.3 AC 3**. This story must not *break* the existing row anchor (`<label tabIndex={0}>`), but it does not add focus-relocation logic.
- **Forced-colors verification** → **Story 2.3 AC 4**. This story delivers the label change `Delete`→`Confirm` (the non-color cue 2.3's forced-colors AC relies on) and must NOT add a fallback icon, but the `forced-colors` conformance test is 2.3.
- **The deterministic race tests** (delete fired during the 300 ms window, delete racing the 5 s revert, refresh mid-window) → **Story 2.3 AC 6**. This story ships the injectable-clock seam (AC 6) that makes those tests possible and covers the happy-path timing; 2.3 exhausts the races.
- **Container re-deploy end-to-end** → **Story 2.3 AC 7**.

## Tasks / Subtasks

### A. Arm-then-confirm state machine — `useArmedDelete` hook (AC 3, 4, 5, 6, 7)

- [x] **Task A1: Create `useArmedDelete`** — `apps/web/src/hooks/useArmedDelete.ts`
  - [x] Own the single-armed coordination: `const [armedId, setArmedId] = useState<string | null>(null)`. At most one row armed at a time is an invariant of storing a single id (AC 5).
  - [x] **Reuse the injectable clock seam — do NOT re-derive it (AC 6).** `import { realClock, type PendingClock } from './usePendingPresentation'`. Signature: `useArmedDelete({ onCommit, clock = realClock }: { onCommit: (id: string) => void; clock?: PendingClock })`. The `PendingClock` `{ now, setTimeout, clearTimeout }` interface is exactly what Story 2.3's race tests will drive with a fake clock; a bare `window.setTimeout` here would make 2.3 wall-clock-flaky.
  - [x] Export the two timing constants as named exports (single source of truth, mirrors `FLICKER_THRESHOLD_MS`): `export const DELETE_NO_COMMIT_WINDOW_MS = 300` and `export const DELETE_AUTO_REVERT_MS = 5000`.
  - [x] Track the arm timestamp + the auto-revert timer handle in refs (`armedAtRef`, `revertHandleRef`) so the effect/handlers read them synchronously without re-subscribing (mirror `usePendingPresentation`'s ref discipline).
  - [x] **`press(id)` — the single affordance handler** (one function drives idle→armed and armed→commit):
    - If `armedId !== id` (row is idle, or a *different* row is armed): arm THIS row — `setArmedId(id)`, stamp `armedAtRef.current = clock.now()`, and (re)start the 5 s auto-revert timer. Arming a new row while another is armed reverts the old one automatically because there is only one `armedId` + one timer (AC 5 "arm a different row").
    - If `armedId === id` (this row is already armed — a second press): read `elapsed = clock.now() - armedAtRef.current`. If `elapsed < DELETE_NO_COMMIT_WINDOW_MS` → **absorb** (return, stay armed — AC 3 muscle-memory guard). If `elapsed >= DELETE_NO_COMMIT_WINDOW_MS` → **commit**: clear the revert timer, `setArmedId(null)`, then `onCommit(id)` (AC 3/7 — a second tap after the window is COMMIT, never cancel).
  - [x] **`cancel()`** — clear the revert timer + `setArmedId(null)`. Called on tap-away, blur, and unmount.
  - [x] **5 s auto-revert** (AC 4): the timer fires `setArmedId(null)` (and clears its own handle). **Do NOT collapse this under reduced motion** — it is a safety window, not motion (only the CSS `--color-error` transition uses `--motion-settle`, which the token collapses to 0 ms; the JS timer is untouched).
  - [x] **Tap-away reverts (AC 5):** while `armedId !== null`, add a `document` `pointerdown` (capture) listener that calls `cancel()` when the event target is NOT inside the armed row's affordance. Gate the listener on the armed state so it is only attached while armed and removed on disarm/unmount (a `useEffect` keyed on `armedId`; clean up the timer + listener on unmount). Use `pointerdown` (not `click`) so tapping elsewhere reverts before that element's own click resolves. Identify "inside the armed affordance" with a stable marker — e.g. a `data-armed-delete` attribute on the armed button, checked via `event.target.closest('[data-armed-delete]')`.
  - [x] Return `{ armedId, press, cancel }`. Blur handling (focus leaves) is wired at the button (Task C) which calls `cancel()`; keep it a plain callback, not clock-driven.
- [x] **Task A2: `useArmedDelete` unit tests** (AC 3, 4, 5, 7) — `apps/web/src/hooks/useArmedDelete.test.ts`
  - [x] Model on `usePendingPresentation.test.ts`'s `makeFakeClock()` (copy the injectable fake-clock helper — deterministic `advance(ms)`, NOT `vi.useFakeTimers`).
  - [x] `press(id)` once arms the row (`armedId === id`).
  - [x] Second `press(id)` at `elapsed < 300 ms` is absorbed: `onCommit` NOT called, still armed (AC 3).
  - [x] Second `press(id)` at `elapsed >= 300 ms` commits: `onCommit(id)` called once, `armedId === null` (AC 3, 7).
  - [x] `advance(5000)` with no second press reverts to idle (`armedId === null`), `onCommit` NOT called (AC 4).
  - [x] `press(a)` then `press(b)` → `armedId === b`, a is disarmed; single-armed invariant (AC 5).
  - [x] `cancel()` reverts to idle and clears the timer (a later `advance(5000)` does not fire a stale revert).

### B. Wire the delete mutation through App → TodoList (AC 5, 8)

- [x] **Task B1: Wire `useDeleteTodo` in `App.tsx`** (AC 8) — `apps/web/src/App.tsx`
  - [x] `import { useDeleteTodo } from './hooks/useDeleteTodo'` and call it: `const { deleteTodo, deletingIds } = useDeleteTodo()`. The hook is built and unit-tested (Story 2.1); this is its first wiring ("before any delete UI exists" is now satisfied).
  - [x] Pass `onDelete={deleteTodo}` and `deletingIds={deletingIds}` to `<TodoList>` (see B2). Do NOT pass an `announce` — deletion announcements are Story 2.3.
  - [x] Update the App header comment: the line `Explicitly NOT here (later stories): delete (Epic 2). Do not stub it.` is now satisfied — replace with a note that App owns the delete mutation (like create/toggle) and `<TodoList>` owns the armed-state coordination.
  - [x] **Do NOT offer delete on failed-create rows.** Failed rows already carry Retry/Dismiss (Story 1.9); they have no server id to `DELETE`. Delete is for server-confirmed rows only — `deletingIds` and the armed affordance apply to the non-failed branch (see C). `App` already computes `failedIds`; `TodoList`/`TodoItem` already branch on it.
- [x] **Task B2: `<TodoList>` owns armed-state coordination** (AC 5) — `apps/web/src/components/recipes/TodoList.tsx`
  - [x] Add props: `onDelete?: (id: string) => void`, `deletingIds?: ReadonlySet<string>`.
  - [x] Call the state machine HERE (this is where "coordination owned by `<TodoList>`" lives, epics AC 5): `const { armedId, press, cancel } = useArmedDelete({ onCommit: (id) => onDelete?.(id) })`.
  - [x] For each row pass down: `armed={armedId === todo.id}`, `onDeletePress={() => press(todo.id)}`, `onDeleteCancel={cancel}` (for blur), and `deleting={deletingIds?.has(todo.id) ?? false}`.
  - [x] Update the `<TodoList>` header comment: it currently says "no armed-delete coordination (Epic 2)" — that is now implemented here.

### C. `<TodoItem>` — render the affordance (AC 1, 2, 3, 8)

- [x] **Task C1: Add the delete affordance to the Active/Complete row** (AC 1, 2) — `apps/web/src/components/recipes/TodoItem.tsx`
  - [x] New props on `TodoItemProps`: `armed?: boolean`, `deleting?: boolean`, `onDeletePress?: () => void`, `onDeleteCancel?: () => void`.
  - [x] Render a `<Button>` as the LAST child INSIDE the row `<label>` (the "sibling delete button" of epics Notes #11 — **ADD a child, do NOT rewrite the label markup / the 1.8 whole-row tap-target contract**). Give it `className={styles.delete}` (+ `styles.armed` when `armed`), `data-armed-delete` (the tap-away marker, Task A1), and label text `armed ? 'Confirm' : 'Delete'` (the visible text IS the accessible name this story — 2.3 enriches it).
  - [x] **`stopPropagation` is load-bearing — pointer AND keyboard (AC 1).** A `<button>` inside a `<label>`: (a) an `onClick` handler must `event.stopPropagation()` then call `onDeletePress()` so the click never reaches the label/checkbox toggle path; (b) **it must ALSO `stopPropagation` on `onKeyDown`** — otherwise Enter pressed on the Delete button bubbles to the label's `handleKeyDown`, which toggles on `Enter` regardless of `event.target`, so a keyboard user would BOTH activate delete AND toggle completion. Add `onKeyDown={(e) => e.stopPropagation()}` to the button (Space is already safe — the label's Space branch is gated by `rowHasFocus`/`target === currentTarget`, but Enter is NOT, so this stop is required). Verify with a test that Enter on the Delete button does not fire `onToggle`.
  - [x] **Blur reverts (AC 5):** `onBlur={onDeleteCancel}` on the button so Tab-away (focus leaves) reverts. This is only meaningful while armed; calling `cancel()` when already idle is a harmless no-op (`setArmedId(null)` on `null`), so no guard needed — but confirm it does not fight the commit path (commit sets `armedId=null` before blur, so the subsequent blur cancel is a no-op).
  - [x] The affordance is **inert while the row is `pending`** (create/toggle in-flight — the row is already `aria-disabled`, AC 8 of 1.7/1.8). Do not render the delete button, OR render it disabled, on a pending row — pick "do not render" for simplicity (a create-pending row is not yet a stable server row to delete). It is also NOT rendered on the `failed` branch (that branch is untouched — it keeps Retry/Dismiss).
- [x] **Task C2: Committing (post-commit) presentation** (AC 8) — `apps/web/src/components/recipes/TodoItem.tsx`
  - [x] After commit, `deleting` is true (App's `deletingIds` via 2.1's `useDeleteTodo`). Feed it through the SAME honest-pending seam the row already uses: the row is Committing. **Reuse `usePendingPresentation`** — the row already calls it for `pending`; drive the committing visual from `deleting` too. Simplest: treat `pending || deleting` as the busy input to a single `usePendingPresentation` call so `ariaBusy` (t=0) and `showPending` (threshold-gated + min-hold) already behave correctly for delete. (`usePendingPresentation` is explicitly generic "the contract toggle (1.8) and delete (Epic 2) consume" — this is that consumption.)
  - [x] While `deleting`, the affordance is inert (the delete is in flight; do not render/allow a second press — 2.1's `inFlightIdsRef` already blocks a duplicate DELETE, but the UI should not invite it).
  - [x] The row's disappearance is honest-pending: `onMutate` does NOT remove the row (2.1) — it stays visible as Committing until the `onSettled` invalidate refetch drops it. The `--motion-settle` fade (AC 8) is the committing dim (see D2); a true unmount exit-animation is NOT added (no animation lib; honest-pending forbids optimistic removal). "No abrupt reflow" is satisfied by stable row heights (UX-DR22) + removing exactly one already-dimmed row. See the AC 8 note in Dev Notes.

### D. Styling (AC 1, 2, 8)

- [x] **Task D1: Delete affordance styles** — `apps/web/src/components/recipes/TodoItem.module.css`
  - [x] `.delete`: right-aligned (`margin-inline-start: auto; flex: none`), `color: var(--color-on-surface-muted)`, `font-size: var(--font-size-secondary)`, `font-weight: var(--font-weight-medium)` (mirror the `.failed .retry/.dismiss` recipe already in this file — reuse the same tokens). Scope it so it out-specifies the `<Button>` primitive base colour (the primitive keeps its focus ring + forced-colors border — do NOT strip them; same pattern the failed affordances use).
  - [x] `.armed`: `color: var(--color-error)`. The idle→armed colour change transitions via `transition: color var(--motion-settle) var(--motion-ease)` (AC 2) — reduced-motion collapses `--motion-settle` to 0 ms (token already handles it). No overlay, no size/weight change, no row-height change (AC 2, UX-DR22).
  - [x] **Hover reveal (AC 1):** default the affordance visible, then hide-until-hover ONLY on pointer devices: `@media (hover: hover) { .delete { opacity: 0; transition: opacity var(--motion-settle) ... } .item:hover .delete, .item:focus-within .delete, .delete:focus-visible { opacity: 1 } }`. Touch (no-hover) keeps it always visible (the base rule). **Use `opacity`, never `display:none`/`visibility:hidden`** — the button must stay keyboard-focusable and in the a11y tree so Tab reveals it (`:focus-within` / `:focus-visible`). An always-armed row (armed but pointer left) must stay visible too — add `.item:has(.armed) .delete` or simply keep `.armed` at `opacity: 1` inside the hover block.
  - [x] Optional row hover background (UX line 765): `@media (hover: hover) { .item:hover { background: var(--color-surface-hover) } }` — the token `--color-surface-hover` exists (`tokens.css:20`).
- [x] **Task D2: Committing fade** (AC 8) — `apps/web/src/components/recipes/TodoItem.module.css`
  - [x] `.committing` (applied when `deleting` + past the flicker threshold, i.e. gated by `showPending` like the pending class): dim the row via `opacity` transitioned by `--motion-settle` so the row visibly fades while the DELETE is in flight, then is removed by the refetch (AC 8). Keep the existing `.pending .description` muted-contrast treatment working (a committing row is also honest-pending). Row height stays stable (UX-DR22) so removal does not reflow abruptly. Reduced-motion collapses `--motion-settle` → instant.

### E. Tests

- [x] **Task E1: `<TodoItem>` tests** (AC 1, 2, 3, 8) — `apps/web/src/components/recipes/TodoItem.test.tsx`
  - [x] Idle: a `Delete` affordance renders on an Active row; its accessible name is "Delete" (visible text).
  - [x] **Tapping `Delete` does NOT toggle** — `onDeletePress` fires, `onToggle` does NOT (the `stopPropagation` pointer contract, AC 1). Mirror the existing "clicking the row … fires exactly ONE onToggle" test style.
  - [x] **Enter on the `Delete` button does NOT toggle** — the keyboard `stopPropagation` gotcha (Task C1): `onToggle` not called, `onDeletePress`/native activation fires. (This is the regression-prone case — assert it explicitly.)
  - [x] `armed` prop → button text is `Confirm` and carries the `styles.armed` class (AC 2).
  - [x] `deleting` → row is `aria-busy` from t=0 (reuse the pending-variant test style); no `Delete`/`Confirm` press is invited.
  - [x] The delete affordance is absent on a `failed` row and on a `pending` row.
- [x] **Task E2: `<TodoList>` coordination tests** (AC 5, 7) — `apps/web/src/components/recipes/TodoList.test.tsx`
  - [x] Pressing `Delete` on row A arms A (A shows `Confirm`); pressing `Delete` on row B arms B and reverts A (A back to `Delete`) — single-armed invariant (AC 5).
  - [x] A second press on the armed row after the no-commit window calls `onDelete` once with that id (AC 7). Drive timing via the injectable clock — inject a fake clock into `useArmedDelete` (expose it as a `TodoList` test seam, or test `useArmedDelete` directly in E-A2 and keep the `TodoList` timing test to the window-passed case using the fake clock). Prefer: give `<TodoList>` an internal default `realClock` and cover the timing exhaustively in `useArmedDelete.test.ts` (A2); keep `TodoList` tests to coordination (arm/disarm/commit-callback wiring).
  - [x] Tapping outside any armed row (`document` pointerdown elsewhere) reverts to idle (AC 5).
- [x] **Task E3: `App` wiring test** (AC 8) — `apps/web/src/App.test.tsx` (or the existing App test file)
  - [x] With a seeded list, the delete affordance is present on rows; committing a delete calls the DELETE wrapper and, after the invalidate refetch returns without the row, the row is gone. Keep this light — the mutation internals are covered by `useDeleteTodo.test.tsx` (2.1); this test only proves the wiring (App → TodoList → onDelete → refetch drops the row) and that a committing row shows `aria-busy`.

### F. Verification

- [x] **Task F1:** Run the full suite. **API tests require Node 24** (`nvm use 24` first — better-sqlite3 ABI; shell default is Node 22). This story is web-only, but run the whole gate: `npm test`, `npm run typecheck`, `npm run build`, `eslint`, and `stylelint` (the new CSS must pass the token/vendor-prefix lint rules already enforced in `TodoItem.module.css`). Note the bundle-size ratchet gate (`bundle-size-baseline.json`) — this story adds a hook + a button + CSS (no new deps), so the delta should be small; if the gate trips, confirm the increase is only the new component code and rebaseline per the established convention (Keith-approved rebaselines are the norm).

## Dev Notes

### The delete state machine — where each concern lives (layer ownership)

| Concern | Owner | Why |
|---|---|---|
| The DELETE mutation (`onMutate`/`onSettled`, honest-pending, `deletingIds`) | `useDeleteTodo` (built 2.1) | Already done; App just wires it. |
| **Which row is armed (single-armed) + the 300 ms / 5 s timers + tap-away** | **`useArmedDelete` → consumed by `<TodoList>`** | epics AC 5 "coordination owned by `<TodoList>`"; arch line 303 "per-row arbitration … lives entirely in the frontend hooks + `<TodoItem>` state machine". |
| Rendering idle `Delete` / armed `Confirm` / committing | `<TodoItem>` | Pure presentation from `armed`/`deleting` props. |
| The mutation owner (so in-flight ids reach the list) | `App` | Same precedent as create/toggle (App owns the hook so its state reaches the list). |

This is the same shape as toggle: **App owns the mutation hook, `<TodoList>` owns the per-row coordination, `<TodoItem>` is presentational.** Do not put the armed-state in `<TodoItem>` (it can't enforce single-armed across rows) or in `App` (coordination is TodoList's job per the AC).

### Injectable clock — reuse `PendingClock`, do NOT invent a second clock (AC 6)

`usePendingPresentation.ts` already exports `PendingClock` (`{ now, setTimeout, clearTimeout }`) and `realClock`. `useArmedDelete` imports and reuses them. This is non-negotiable: Story 2.3's race tests (delete during the 300 ms window, delete racing the 5 s revert, refresh mid-window) are written against this seam, and the epics AC 6 explicitly says "the SAME mechanism as the honest-pending thresholds". A bare `window.setTimeout` would make 2.3 wall-clock-flaky — the exact failure the AC exists to prevent. The fake-clock test helper is already written in `usePendingPresentation.test.ts` (`makeFakeClock()`); copy it into `useArmedDelete.test.ts`. [Source: usePendingPresentation.ts lines 32–45; epics.md Story 2.2 AC 6; Story 2.1 §Previous Story Intelligence]

### The button-inside-`<label>` keyboard gotcha (the highest-risk regression)

The row is a wrapping `<label>` (the 1.8 whole-row tap-target contract — **do not rewrite it**). Adding the `<button>` as a child means:
- **Pointer:** a click on the button must `stopPropagation()` so it never reaches the label→checkbox toggle. (Modern browsers skip label-activation when the target is interactive content, but `stopPropagation` is the contract the epics note mandates — belt and braces.)
- **Keyboard (the trap):** `TodoItem.handleKeyDown` toggles on `Enter` for ANY `event.target` (by design — it re-routes Enter bubbling from the focused checkbox). So `Enter` on the Delete button bubbles up and would fire a toggle too. **Fix: `onKeyDown={(e) => e.stopPropagation()}` on the button.** Space is already safe (the label's Space branch is gated by `target === currentTarget`), but Enter is not — stop both to be safe. There is a dedicated E1 test for this; it is the most likely thing to slip through. [Source: TodoItem.tsx lines 132–138]

### AC 8 "fades … when the row leaves the list" — honest-pending reading

Honest-pending forbids optimistic removal: `useDeleteTodo.onMutate` does NOT remove the row (2.1) — the row stays visible marked *Committing* until the `onSettled` invalidate refetch returns without it (FR-3, UX-DR15). There is no animation library (bundle budget), and React does not animate unmount natively. So the achievable, spec-consistent "fade" is: while committing, the row dims via `opacity`/muted-contrast transitioned by `--motion-settle` (the `.committing` treatment, gated by the honest-pending threshold via `usePendingPresentation`), then the refetch removes the already-faded row. "Does not reflow other rows abruptly" is satisfied by stable per-state row heights (UX-DR22) + removing exactly one row. A richer true exit-animation (delayed unmount / height collapse) is **out of scope** and would fight honest-pending — flag it to Keith if the visual fade-on-remove is judged insufficient, but do not add an animation dependency. [Source: useDeleteTodo.ts lines 66–86; UX line 769; ux-design-specification.md#Motion line 637]

### Reduced motion — the 5 s timer is NOT motion (AC 4)

`prefers-reduced-motion: reduce` collapses `--motion-settle` → 0 ms (already handled in `tokens.css:111`), so the colour/opacity transitions become instant. But the 300 ms no-commit window and the 5 s auto-revert are **safety windows, not motion** — their JS timers are unchanged under reduced motion. The 5 s floor is derived from screen-reader announcement timing (~4 s to read the armed announcement at default rate); shortening it would strand SR users mid-window. Do NOT gate the timers on the reduced-motion media query. [Source: UX lines 768; epics.md Story 2.2 AC 4]

### Files being modified (current state → what changes)

- `apps/web/src/hooks/useArmedDelete.ts` (**NEW**) — the single-armed state machine + injectable-clock timers + tap-away listener.
- `apps/web/src/hooks/useArmedDelete.test.ts` (**NEW**) — fake-clock timing tests.
- `apps/web/src/App.tsx` (UPDATE) — App owns create + toggle mutations and branches the four query surfaces; the header comment says delete is "NOT here … Do not stub it." **Wire `useDeleteTodo`** (`deleteTodo`, `deletingIds`), pass `onDelete` + `deletingIds` to `<TodoList>`, refresh the comment. Do NOT touch the failed-create / unread-indicator / load-failure logic.
- `apps/web/src/components/recipes/TodoList.tsx` (UPDATE) — plain ordered render; header comment says "no armed-delete coordination (Epic 2)". **Add** `onDelete`/`deletingIds` props, call `useArmedDelete`, pass `armed`/`onDeletePress`/`onDeleteCancel`/`deleting` per row, refresh the comment. Keep the failed/pending/toggling wiring exactly.
- `apps/web/src/components/recipes/TodoItem.tsx` (UPDATE) — the `<label>` row (1.8 contract) + the `failed` branch (1.9) + the `usePendingPresentation` call. **Add** the delete `<Button>` inside the label with `stopPropagation` (pointer+keyboard) + blur cancel, the `armed`/`deleting`/`onDeletePress`/`onDeleteCancel` props, and feed `deleting` through `usePendingPresentation`. Do NOT touch the failed branch or the toggle/keyboard contract beyond adding the button's stops.
- `apps/web/src/components/recipes/TodoItem.module.css` (UPDATE) — **Add** `.delete`, `.armed`, `.committing`, the `@media (hover: hover)` reveal, and (optional) the row hover background. Reuse the `.failed .retry/.dismiss` token recipe already present.
- Test additions: `TodoItem.test.tsx`, `TodoList.test.tsx`, `App.test.tsx` (or the existing App test file).
- **NOT touched:** `useDeleteTodo.ts` (built + reviewed in 2.1 — consume it as-is, no announce option), `packages/contracts/*` (no schema change — 204/no-body delete), `apps/api/*` (endpoint done in 2.1), the checkbox/toggle primitives, `usePendingPresentation.ts` (reuse, do not modify — the delete row is just another consumer).

### Project Structure Notes

- `useArmedDelete.ts` sits alongside `useTodos`/`useCreateTodo`/`useToggleTodo`/`useDeleteTodo`/`usePendingPresentation` in `apps/web/src/hooks/`. It is presentation-coordination state (like `usePendingPresentation`), not a server mutation — it holds no cache, only armed-id + timers.
- Web component/hook tests co-locate as `*.test.ts(x)`; there is no e2e harness yet (see Open Questions). [Source: architecture.md#Structure Patterns lines 259–264]

### References

- [Source: epics.md#Epic 2: Safe Delete › Story 2.2: Inline two-step delete affordance] — the 8 ACs.
- [Source: ux-design-specification.md lines 761–771] — the full inline two-step delete pattern: idle `Delete` (muted, 14 px, 500), first tap → armed `Confirm` in `--color-error` via `--motion-settle`, 300 ms no-commit window (muscle-memory), 5 s auto-revert (SR-timing floor, unchanged under reduced-motion), tap-elsewhere reverts, forced-colors label-change fallback (no icon).
- [Source: ux-design-specification.md line 637] — `--motion-settle` 220 ms, collapses to 0 ms under reduced-motion; used for the armed colour shift + committing fade + error appearance.
- [Source: ux-design-specification.md lines 765] — idle affordance colour/size/weight tokens; reveal-on-hover via `--color-surface-hover`.
- [Source: architecture.md line 303] — per-row in-flight arbitration + `<TodoItem>` state machine is frontend-only; backend is ignorant of it.
- [Source: architecture.md line 302, 189] — DELETE 204/no body/no contract schema, idempotent (consumed via 2.1's `useDeleteTodo`).
- Code precedents to mirror: `usePendingPresentation.ts` + `.test.ts` (the injectable `PendingClock` + `makeFakeClock()` — reuse both), `useToggleTodo.ts` (App-owns-mutation, per-row arbitration precedent), `TodoItem.tsx` `.failed` affordances (the `.retry/.dismiss` styling + `stopPropagation`-on-affordance recipe), `TodoItem.module.css` (token discipline, reduced-motion handling), `useDeleteTodo.ts` (the mutation this story finally wires).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context) — dev-story workflow.

### Debug Log References

- `useArmedDelete.test.ts`: one initial test-arithmetic failure (asserted the second row's 5 s auto-revert at t=5000 when its timer fires at t=5100, since it was armed 100 ms after the first). Fixed the test's virtual-clock math; the hook behaviour was correct.
- `eslint` (`react-hooks/refs`): the initial "latest-ref" pattern (`onCommitRef.current = onCommit` during render) was flagged. Removed the ref and made `press` depend on `onCommit` directly — harmless because `press` is not a dependency of any effect/timer (only invoked from inline row handlers), so re-creating it per render costs nothing.
- `stylelint` (`no-descending-specificity`): the `opacity: 1` reveal group listed selectors in descending specificity. Reordered ascending (`.armed`, `.delete:focus-visible`, `.item:hover .delete`, `.item:focus-within .delete`).
- Bundle-size ratchet tripped by 213 B over the +512 B tolerance (91505 vs 90780 baseline). The build graph is unchanged at 364 modules with no new dependency — the +725 B is purely this story's hook + affordance + CSS — so rebaselined to 91505 B per the established convention (Task F1).

### Completion Notes List

- **`useArmedDelete` (new hook)** owns the single-armed state machine: one `armedId` + one revert timer enforce the "at most one armed" invariant (AC 5). `press(id)` is the single affordance handler — it arms an idle/other row (restarting the 5 s timer, which auto-reverts any previously-armed row), absorbs a second press inside the 300 ms muscle-memory window (AC 3), and commits a second press after it (AC 3/7). `cancel()` reverts on blur/tap-away/unmount. A document-level `pointerdown` capture listener (gated on `armedId`) reverts when the tap lands outside `[data-armed-delete]` (AC 5).
- **Injectable clock reused, not re-derived (AC 6):** the hook imports `realClock`/`PendingClock` from `usePendingPresentation`. Its unit tests copy that file's `makeFakeClock()` helper (deterministic `advance(ms)`, not `vi.useFakeTimers`), so Story 2.3's race tests can drive the same seam.
- **The 5 s auto-revert is a safety window, NOT motion (AC 4):** it is a JS timer, untouched by `prefers-reduced-motion`; only the CSS `--motion-settle` colour/opacity transitions collapse to 0 ms via the token.
- **2.1's `useDeleteTodo` wired for the first time:** App owns the mutation (`deleteTodo`, `deletingIds`) like create/toggle; `<TodoList>` owns the armed coordination; `<TodoItem>` is presentational. No `announce` was added — deletion announcements stay Story 2.3.
- **`<TodoItem>` affordance** is a `<Button>` added as the LAST child inside the row `<label>` (the 1.8 whole-row contract is untouched). `stopPropagation` on BOTH `onClick` (pointer) and `onKeyDown` (keyboard) — the keyboard stop is the highest-risk regression (the label's `handleKeyDown` toggles on Enter for any target); a dedicated test asserts Enter on Delete does not toggle. Committing is driven by feeding `pending || deleting` through the existing `usePendingPresentation` seam, so `aria-busy` is honest from t=0 and the `.committing` opacity dim is threshold-gated. The affordance is not rendered on pending or failed rows.
- **Styling** mirrors the `.failed .retry/.dismiss` token recipe: idle `--color-on-surface-muted`, armed `--color-error`, colour settle via `--motion-settle`; hover-reveal via `@media (hover: hover)` using `opacity` (never `display:none`, so it stays keyboard-focusable) with `:focus-within`/`:focus-visible` and an always-visible armed state; committing fade via `opacity` + `--motion-settle`.
- **Explicitly deferred to 2.3 (not built here):** `aria-pressed` + enriched accessible names, `<LiveRegion>` announcements, focus management on revert/removal, forced-colors conformance test, and the deterministic race tests. This story ships the injectable-clock seam that makes those races testable.
- **Verification:** web tests 160 passed, API tests 49 passed (Node 24), typecheck (all 3 workspaces), eslint, stylelint + token selftest, build, contrast gate (7/7), and the rebaselined bundle-size gate all green.

### File List

- `apps/web/src/hooks/useArmedDelete.ts` (NEW) — single-armed arm-then-confirm state machine; injectable-clock 300 ms/5 s timers; tap-away listener.
- `apps/web/src/hooks/useArmedDelete.test.ts` (NEW) — fake-clock timing/coordination unit tests (9).
- `apps/web/src/App.tsx` — wired `useDeleteTodo`; passes `onDelete` + `deletingIds` to `<TodoList>`; refreshed header comment.
- `apps/web/src/components/recipes/TodoList.tsx` — added `onDelete`/`deletingIds` props; calls `useArmedDelete`; passes `armed`/`onDeletePress`/`onDeleteCancel`/`deleting` per row; refreshed comment.
- `apps/web/src/components/recipes/TodoItem.tsx` — added `armed`/`deleting`/`onDeletePress`/`onDeleteCancel` props; delete `<Button>` inside the label with pointer+keyboard `stopPropagation` + blur cancel; committing via `usePendingPresentation(pending || deleting)`.
- `apps/web/src/components/recipes/TodoItem.module.css` — added `.delete`, `.armed`, `.committing`, the `@media (hover: hover)` reveal + row hover background.
- `apps/web/src/components/recipes/TodoItem.test.tsx` — added the Delete affordance describe block (8 tests).
- `apps/web/src/components/recipes/TodoList.test.tsx` — added armed-delete coordination describe block (4 tests).
- `apps/web/src/App.test.tsx` — added App delete wiring test (deferred DELETE → aria-busy → refetch drops the row).
- `apps/web/bundle-size-baseline.json` — rebaselined to 91505 B gz (new hook + affordance + CSS; no new deps).

## Previous Story Intelligence (Story 2.1 → 2.2)

From `2-1-delete-endpoint-mutation.md` (the immediately preceding story — its handoffs are binding here):

- **`useDeleteTodo` is DONE and waiting to be wired.** It returns `{ deleteTodo, deletingIds }`. `onMutate` marks the row Committing via `deletingIds` WITHOUT removing it; `onSettled` invalidates `['todos']` unconditionally (success drops the row, error restores it). Story 2.1 explicitly says: "`<TodoItem>` consumes `deletingIds` in Story 2.2 to render Committing + `aria-busy`" and "App wiring + the delete affordance are Story 2.2." **This is that story — consume the hook, do not modify it.**
- **No announce option on `useDeleteTodo` — by design.** 2.1 deliberately omitted it ("Announcements are NOT in this story … Story 2.3 … avoid dead code"). Do NOT add one here either; announcements are 2.3.
- **The `deletingIds` lifecycle (set in `onMutate`, cleared in `onSettled` on every path) is already correct and reviewed** — a code-review patch removed the `onError` cache rollback (it was wrong under concurrency). Do not reintroduce cache writes on the delete path; the row's visibility is driven purely by the cache refetch + `deletingIds` marker.
- **Runtime schema validation is now in place** (2.1 added `validateContract.ts`; `getTodos`/`createTodo`/`patchTodo` validate against the shared TypeBox contract). The DELETE wrapper validates nothing (204/no body). No action needed here, but be aware a malformed refetch body now throws → the query's `isError` — the delete refetch benefits from this automatically.
- **The highest-risk delete work (300 ms + 5 s timing) is THIS story + 2.3.** 2.1 flagged: "get the `deletingIds` lifecycle exactly right and cover the mixed success/error concurrent cases." For 2.2 the analogue is the arm-state timing — get the injectable-clock seam right so 2.3's races are deterministic.

## Git Intelligence Summary

Recent history: `feat(delete): idempotent DELETE endpoint + honest-pending mutation (story 2.1)` → `fix(ci): green the CI gate + apply code-review patches (story 2.1)` → `chore(story): mark story 2.1 done`. The mutation-hook family is all present and green on this branch:

- `useDeleteTodo.ts` (2.1) — wire it here; returns `{ deleteTodo, deletingIds }`.
- `useToggleTodo.ts` (1.8) — the App-owns-mutation + per-row-arbitration precedent to mirror for coordination shape (though delete's arbitration lives in the NEW `useArmedDelete`, not the mutation hook).
- `usePendingPresentation.ts` (1.7) — reuse its exported `PendingClock`/`realClock` for `useArmedDelete`'s timers AND drive the committing visual through it (its own comment names delete/Epic 2 as an intended consumer).
- `TodoItem.tsx`/`TodoList.tsx`/`App.tsx` — the presentation stack this story extends; each carries a comment noting delete/armed-coordination as a future (now current) addition.

## Latest Tech Information

Stack is fixed and current (verified June 2026); no upgrades in this story, no new dependencies. Relevant:

- **React 19 + CSS Modules** — the affordance is a plain `<Button>` primitive child; the hover reveal + armed colour + committing fade are pure CSS (`@media (hover: hover)`, `--motion-settle`, `--color-error`, `--color-surface-hover` — all existing tokens). No animation library (bundle budget; no exit-animation lib).
- **`@media (hover: hover)`** — the correct guard for "reveal on hover on pointer devices, always-visible on touch". Pair with `:focus-within`/`:focus-visible` so keyboard users reveal it; never `display:none` (breaks focusability).
- **TanStack Query v5** — the delete refetch/invalidate machinery is entirely inside `useDeleteTodo` (2.1); this story adds no query code.
- **Injectable clock** — reuse `PendingClock` from `usePendingPresentation`; the fake-clock test helper (`makeFakeClock` in `usePendingPresentation.test.ts`) is the deterministic-timing pattern for `useArmedDelete.test.ts` (not `vi.useFakeTimers`).

## Project Context Reference

- Config: `_bmad/bmm/config.yaml` — project "the long finger", implementation artifacts under `_bmad-output/implementation-artifacts`.
- No `project-context.md` exists in the repo (only the generator template) — architecture.md + ux-design-specification.md + epics.md + the Story 2.1 file are the authoritative context, cited inline above.
- Project memory (persistent): **API tests need Node 24** before running (this story is web-only, but the full-suite gate touches the API tests); Docker daemon must be started manually if a container check is needed (NOT required by 2.2 — the container re-deploy is Story 2.3 AC 7).

## Story Completion Status

Ultimate context engine analysis completed — comprehensive developer guide created. Status: ready-for-dev.

### Open questions / scope confirmations for Keith (non-blocking — sensible defaults chosen)

1. **Playwright / e2e harness (Epic 1 retro action item 6).** No e2e harness exists yet; the retro suggested standing one up at Epic 2 kickoff for "delete affordance timing." **Recommendation: NOT needed for 2.2.** AC 6 mandates an injectable clock precisely so the timing is deterministic under component/hook tests (`useArmedDelete.test.ts` + Testing Library), not wall-clock e2e. The harness is genuinely valuable for a real-browser smoke of the two-step flow, but it is better introduced as its own kickoff task (or folded into Story 2.3, which owns the race hardening + the container re-deploy). Proceeding without it; flag if you want it in 2.2.
2. **AC 8 fade-on-removal fidelity.** With honest-pending (no optimistic removal) and no animation library, the "fade when the row leaves the list" is delivered as a committing opacity/contrast dim via `--motion-settle` before the refetch removes the row (see Dev Notes). A true exit-animation on unmount would require a delayed-unmount/height-collapse mechanism that fights honest-pending. Proceeding with the dim-then-remove reading; flag if you want a richer exit animation (it would be a small bespoke transition wrapper, still no new dep).
3. **Delete button placement — inside the `<label>`.** Chosen per epics Notes #11 ("sibling delete `<button>` with `stopPropagation`" — the `stopPropagation` requirement implies it lives inside the toggle target). The keyboard-`stopPropagation` gotcha (Dev Notes) is the cost. The alternative (button as a sibling of the label, outside it) avoids the keyboard stop but changes the row's flex layout and reads against "do not rewrite the label markup". Proceeding with inside-the-label + explicit stops + a dedicated regression test.

## Change Log

- 2026-07-01: Story 2.2 implemented (dev-story). New `useArmedDelete` hook (single-armed coordination + injectable-clock 300 ms/5 s timers + tap-away); wired 2.1's `useDeleteTodo` through App → `<TodoList>` → `<TodoItem>`; idle `Delete`/armed `Confirm`/committing-fade presentation + hover-reveal styling. All ACs (1–8) satisfied; a11y + race tests deferred to 2.3 as scoped. Full gate green (web 160, api 49 @ Node 24, typecheck/eslint/stylelint/build/contrast); bundle-size rebaselined to 91505 B gz (feature code only, no new deps). Status → review.
- 2026-07-01: Story 2.2 created (create-story). Scope: the inline two-step arm-then-confirm delete affordance (visual + timing state machine) — new `useArmedDelete` hook (single-armed coordination + injectable-clock 300 ms/5 s timers + tap-away), wiring 2.1's `useDeleteTodo` through App → `<TodoList>` → `<TodoItem>`, the idle `Delete`/armed `Confirm`/committing-fade presentation, and hover-reveal styling. Accessibility (aria-pressed, accessible names, LiveRegion announcements, focus management, forced-colors verification) and the deterministic race tests are explicitly deferred to Story 2.3. Status → ready-for-dev.
