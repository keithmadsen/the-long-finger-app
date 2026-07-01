---
baseline_commit: 836f088e27766d919e4726dde61d9f01445775ae
---

# Story 2.3: Delete accessibility & state-race hardening

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Primary User relying on a keyboard or screen reader,
I want the two-step delete to be fully announced and operable, and never strand my focus,
so that the safest interaction in the app is equally safe with assistive technology.

## Acceptance Criteria

**Delete accessibility & state-race hardening (from epics.md Epic 2 › Story 2.3):**

1. **Given** the idle delete affordance, **When** inspected, **Then** its accessible name is `Delete '{description}'`; **When** armed, **Then** `aria-pressed="true"` and the accessible name becomes `Confirm deletion of '{description}', press again within 5 seconds to delete`.
2. **Given** a committed delete, **When** the row is removed, **Then** the `<LiveRegion>` announces `{description} deleted.` once, with no undo affordance implied.
3. **Given** an armed affordance that auto-reverts or is dismissed, **When** the row's state changes under the user, **Then** focus is moved to a stable, predictable element (the row anchor) and is never stranded on a removed node.
4. **Given** forced-colors mode, **When** the affordance is armed, **Then** the armed signal is carried by the `Delete`→`Confirm` label change (the `--color-error` change is overridden by the system and no fallback icon is added).
5. **Given** a delete failure, **When** it occurs, **Then** the `<LiveRegion>` announces the failure once and the list reconciles to current state.
6. **Given** the delete state machine, **When** tested **against the injectable clock**, **Then** tests deterministically cover the races: a delete fired during the 300 ms no-commit window, a delete racing the 5 s auto-revert, and a refresh/navigation mid-window. **And** a row with a DELETE in flight (Committing) is inert to completion toggles (the delete-vs-toggle same-row race, arch line 303).
7. **Given** Epic 2 is complete, **When** the container image is rebuilt and deployed, **Then** delete works end-to-end against the running container (honoring "re-deploy at each epic's end"; Epic 3 later hardens the deploy).

### What is already built (Story 2.2 — do NOT rebuild)

Story 2.2 shipped the **visual + timing state machine**: `useArmedDelete` (single-armed coordination + injectable `PendingClock` 300 ms / 5 s timers + tap-away), the `useDeleteTodo` wiring through App → `<TodoList>` → `<TodoItem>`, the idle `Delete` / armed `Confirm` presentation, the committing fade, and hover-reveal styling. This story adds **only the accessibility layer + race hardening + container re-deploy on top** — it must NOT rewrite the state machine, the row markup, or the mutation shape.

### Explicitly OUT of scope for this story (Epic 3 — do NOT build here)

- **Roving tabindex / list-wide keyboard navigation** → **Story 3.1**. Today every row anchor is `tabIndex={0}`; do NOT convert to roving `-1`/`0` here. This story's focus work is scoped to the delete affordance itself (never strand focus on the removed button; land on the row anchor). The *list-wide* focus choreography that follows a removed row to an adjacent anchor is Story 3.1.
- **The forced-colors / reduced-motion Playwright emulation gates** (UX lines 685–686) → **Story 3.3 / 3.4**. This story delivers and asserts the *non-color cue* (the `Delete`→`Confirm` label change) at the component level and confirms no icon/color-only cue exists; the real browser forced-colors sweep is Epic 3's gate. There is no e2e/Playwright harness yet.
- **The `axe-core` scan + consolidated SR contract + the LiveRegion identical-message re-announce hardening** → **Story 3.2** (consolidated screen-reader contract). See the LiveRegion note in Dev Notes: announcing the *same* string twice does not re-fire today. That is a pre-existing shared-primitive limitation (create/toggle share it); do NOT change the `<LiveRegion>` primitive here.

## Tasks / Subtasks

### A. Enriched accessible name + `aria-pressed` on the delete affordance (AC 1, 4)

- [x] **Task A1: Add the enriched accessible name + `aria-pressed`** — `apps/web/src/components/recipes/TodoItem.tsx`
  - [x] On the delete `<Button>` (the one gated by `showDeleteAffordance`), add `aria-pressed={armed}` and `aria-label={armed ? \`Confirm deletion of '${todo.description}', press again within 5 seconds to delete\` : \`Delete '${todo.description}'\`}`. Use straight single quotes around `{description}` to match the epics/UX copy exactly ([Source: ux-design-specification.md lines 766, 1416]). The visible text stays `Delete`/`Confirm` (do NOT change it) — `aria-label` overrides the accessible name for AT while the sighted label is unchanged, exactly the upgrade 2.2 deferred.
  - [x] `aria-pressed={armed}` renders `aria-pressed="false"` idle / `"true"` armed — making it a proper toggle button (UX line 766 mandates `aria-pressed="true"` when armed). The `Button` primitive spreads unknown props onto the native `<button>`, so both attributes land on the DOM node (same mechanism `data-failed-retry` uses). No primitive change needed.
  - [x] Keep everything else on the button intact: `data-armed-delete`, `onBlur`, `onClick` (pointer `stopPropagation` + `onDeletePress`), `onKeyDown` (keyboard `stopPropagation`) — Task C1 extends `onKeyDown` for Escape but must PRESERVE the existing `stopPropagation`.
  - [x] Update the affordance's block comment: it says "the visible text IS the accessible name this story (Story 2.3 enriches it with aria-label + aria-pressed)" — mark that enrichment as now done.

### B. Delete announcements — success + failure (AC 2, 5)

- [x] **Task B1: Add an `announce` option + thread `description` into `useDeleteTodo`** — `apps/web/src/hooks/useDeleteTodo.ts`
  - [x] Add the options shape (mirror `useToggleTodo`): `export interface UseDeleteTodoOptions { announce?: (message: string) => void }` and `export function useDeleteTodo({ announce }: UseDeleteTodoOptions = {})`. Update the header comment: announcements are NO LONGER deferred — this is where 2.3 wires them.
  - [x] Extend the mutation variables from `{ id }` to `{ id: string; description: string }` (2.1 deliberately left it `{ id }` "3.3 adds description when it wires announcements" — this is that moment). Read the description from the cache at call time in `deleteTodo(id)`, mirroring `useToggleTodo.toggle`: `const current = queryClient.getQueryData<Todo[]>(['todos']); const description = current?.find((t) => t.id === id)?.description ?? ''`. Import `Todo` from `@tlf/contracts`. Keep the per-row `inFlightIdsRef` arbitration exactly as-is (still keyed on `id`).
  - [x] **Add `onSuccess` (AC 2):** `announce?.(\`${description} deleted.\`)`. The DELETE 204 means the row is confirmed gone; the announcement is terminal — no undo copy ([Source: ux-design-specification.md lines 438, 769]). Do NOT touch the cache in `onSuccess` — the existing `onSettled` invalidate is what drops the row (honest-pending).
  - [x] **Add `onError` (AC 5) — ANNOUNCE ONLY, no cache write:** `announce?.(\`Couldn’t update “${description}”. The list refreshed to current state.\`)`. This is the SAME copy `useToggleTodo.onError` already uses (curly apostrophe + curly quotes) — the UX spec deliberately shares one mutation-failure string across toggle AND delete ([Source: ux-design-specification.md line 440]). **Do NOT reintroduce a cache rollback in `onError`** — 2.1's code-review explicitly removed it (a snapshot write is wrong under concurrency; the row was never optimistically removed, so nothing is lost). The existing unconditional `onSettled` invalidate is the sole reconcile (AC 5 "reconciles to current state").
  - [x] Leave `onMutate` (cancel + `addDeleting`) and `onSettled` (`removeDeleting` + invalidate) UNCHANGED. `deletingIds` lifecycle stays exactly as reviewed in 2.1.
- [x] **Task B2: Wire `announce` into `useDeleteTodo` from App** — `apps/web/src/App.tsx`
  - [x] Change `const { deleteTodo, deletingIds } = useDeleteTodo()` → `useDeleteTodo({ announce })`. `announce` (the stable App-owned `<LiveRegion>` announcer) is already defined and passed to `useCreateTodo`/`useToggleTodo` — reuse it verbatim.
  - [x] Update the App block comment: the line "Deletion announcements + aria-pressed are Story 2.3 — no announce is passed here" is now satisfied; App passes `announce` to delete exactly like create/toggle.
  - [x] No new `<LiveRegion>` — there is ONE, App-owned (UX-DR6/7). Do NOT add a second region.

### C. Focus management — never strand focus (AC 3)

- [x] **Task C1: Escape returns focus to the row anchor** — `apps/web/src/components/recipes/TodoItem.tsx`
  - [x] Add a ref to the row `<label>` (the row anchor, already `tabIndex={0}`): `const rowAnchorRef = useRef<HTMLLabelElement>(null)` and attach `ref={rowAnchorRef}` to the `<label>`.
  - [x] Extend the delete button's `onKeyDown`: keep `event.stopPropagation()`, and add — `if (event.key === 'Escape') { onDeleteCancel?.(); rowAnchorRef.current?.focus() }`. On the armed (or idle) affordance, Escape reverts to idle AND returns focus to the row anchor, not out of the list ([Source: ux-design-specification.md lines 1396–1399]). Do NOT preventDefault the other keys — only handle Escape.
- [x] **Task C2: A committed delete never strands focus on the unmounting button** — `apps/web/src/components/recipes/TodoItem.tsx`
  - [x] When a press commits, `useArmedDelete` sets the row `deleting` → `showDeleteAffordance` becomes `false` → the `Confirm` button unmounts. A keyboard (or click) commit therefore leaves `document.activeElement` on a removed node (falls to `<body>`). Relocate focus to the row anchor so it is never stranded (AC 3).
  - [x] Implement with a `useLayoutEffect` keyed on `deleting`: when `deleting` flips true AND focus was actually stranded, move it to the anchor:
    ```
    useLayoutEffect(() => {
      if (
        deleting &&
        rowAnchorRef.current &&
        document.activeElement === document.body
      ) {
        rowAnchorRef.current.focus()
      }
    }, [deleting])
    ```
  - [x] The `activeElement === document.body` guard is load-bearing: it moves focus ONLY when the commit stranded it (the button unmounted from under the user), never stealing focus that the user has since placed elsewhere (e.g. a pointer commit where focus moved on). The committing row anchor is still mounted (honest-pending keeps the row visible until the refetch), so it is a valid target at commit time.
  - [x] **Scope boundary (do NOT over-build):** when the `onSettled` refetch later drops the committing row, its anchor unmounts too. Following focus onward to an *adjacent* row anchor is **Story 3.1 (roving tabindex)** — NOT this story. 2.3's guarantee is: focus is never left on the removed *button*; it lands on the row anchor. Note this boundary in the code comment.
- [x] **Task C3: Auto-revert / tap-away must not strand focus** — verify (no code expected)
  - [x] On auto-revert (5 s), arm-another-row, and tap-away, the affordance button node PERSISTS (only its text/attributes change `Confirm`→`Delete`), so a focused button keeps focus (node identity is unchanged). On pointer devices the hover-reveal hides an idle affordance via `opacity`, but `:focus-visible` keeps a focused one visible (2.2 CSS). Confirm this holds; if a test reveals stranding, prefer the smallest fix (do NOT remount the button on state change). Covered by tests in Task F.

### D. State-race hardening (AC 6)

- [x] **Task D1: A Committing row is inert to completion toggles (the delete-vs-toggle same-row race)** — `apps/web/src/components/recipes/TodoItem.tsx`
  - [x] **Gap found in 2.2:** the row's toggle guards check only `pending`, not `deleting`. A row with a DELETE in flight (`deleting === true`, `pending === false`) is `aria-busy` but its `<label>`/checkbox toggle path is still LIVE — a keyboard `Enter` or a tap on a Committing row would fire `onToggle`, racing a PATCH against the in-flight DELETE (arch line 303: per-row delete-vs-toggle arbitration lives in the `<TodoItem>` state machine). Harden it: treat `pending || deleting` as the inert/busy condition for the toggle path.
  - [x] Introduce a local `const busy = pending || deleting` and use it for the toggle-inert guards: `aria-disabled={busy || undefined}` on both the `<label>` and the `<Checkbox>`; `if (busy) return` in `handleKeyDown`; `if (!busy) onToggle?.(checked)` in `onCheckedChange`. Do NOT change `usePendingPresentation(pending || deleting)` (already correct) or the `showDeleteAffordance` guard (already excludes `deleting`).
  - [x] Keep `pendingCompleted`/`checked` behavior unchanged — a Committing row has no pending toggle destination, so `checked` falls through to `todo.completed`, which is correct.
- [x] **Task D2: Exhaustive deterministic race tests against the injectable clock** — `apps/web/src/hooks/useArmedDelete.test.ts`
  - [x] Extend the existing `makeFakeClock()`-driven suite (2.2) with the three named races (AC 6). The clock is ALREADY injectable on `useArmedDelete` — reuse it; do NOT add `vi.useFakeTimers` and do NOT change the hook's clock seam.
  - [x] **Race 1 — delete fired during the 300 ms no-commit window:** `press(id)` at t=0; `press(id)` at t < 300 → absorbed (`onCommit` NOT called, still armed); advancing does not lose the arm; a later `press(id)` at t ≥ 300 commits once. (Extends the 2.2 absorb test with the "still committable after" assertion.)
  - [x] **Race 2 — delete racing the 5 s auto-revert:** press at t=0; a commit press at t just under 5000 (and ≥ 300) commits once and clears the revert timer, so advancing past 5000 does NOT fire a stale revert (`armedId` stays null, no double action). Conversely, if 5000 elapses first, the row reverts to idle and a subsequent `press(id)` RE-ARMS (does not commit) — the boundary is unambiguous.
  - [x] **Race 3 — refresh / navigation mid-window:** arm a row, then UNMOUNT the hook (`renderHook(...).unmount()`) while armed and before the revert — assert `onCommit` is never called and advancing the fake clock afterward fires no stray revert (the unmount cleanup cleared the timer). This is the deterministic proxy for "the tab refreshes/navigates away while a row is armed."
  - [x] Keep the existing `<TodoList>` coordination tests (arm/disarm/commit wiring) as-is; races live at the hook level (per 2.2's decision — `<TodoList>` uses the default `realClock`). No `clock` prop is added to `<TodoList>`.

### E. Forced-colors — verify the non-color cue, add no icon (AC 4)

- [x] **Task E1: Assert the armed cue is a text-label change, not color/icon** — `apps/web/src/components/recipes/TodoItem.test.tsx`
  - [x] jsdom cannot emulate `forced-colors: active` (the real browser sweep is Epic 3, Story 3.3/3.4 — UX line 685). The component-level guarantee 2.3 owns: the armed signal is carried by the **visible label text change** (`Delete`→`Confirm`), so it survives forced-colors where `--color-error` is overridden ([Source: ux-design-specification.md lines 771, 1433]).
  - [x] Add/confirm a test: arming flips the visible text to `Confirm` (the non-color cue) AND the affordance contains NO `<svg>`/icon element (assert the button's only content is the text) — "do not add a fallback icon; the simplicity is the design" (UX line 771). No CSS `@media (forced-colors)` block is added for the delete affordance — the `Button` primitive already keeps its forced-colors border, and the label change is sufficient on its own (the Checkbox precedent adds a forced-colors block only because its cue is a background/glyph, not text).

### F. Tests (AC 1, 2, 3, 5, 6)

- [x] **Task F1: `<TodoItem>` accessibility + inert-while-committing tests** — `apps/web/src/components/recipes/TodoItem.test.tsx`
  - [x] **Update the 2.2 name tests (they will break):** idle accessible name is now `Delete '{description}'` (via `aria-label`), not the bare visible text `Delete`. Assert `getByRole('button', { name: "Delete 'Buy milk'" })` and `aria-pressed="false"`.
  - [x] Armed: accessible name is `Confirm deletion of 'Buy milk', press again within 5 seconds to delete` and `aria-pressed="true"` (AC 1).
  - [x] **Committing row is inert to toggle (AC 6, Task D1):** with `deleting` true, `aria-busy` is set (existing), the `<label>`/checkbox carry `aria-disabled`, and Enter on the row / a checkbox change does NOT fire `onToggle`. Mirror the existing pending-inert test style.
  - [x] **Escape returns focus to the row anchor (AC 3, Task C1):** focus the armed delete button, press Escape → `onDeleteCancel` fires AND `document.activeElement` is the row `<label>` (the anchor).
  - [x] **Commit does not strand focus (AC 3, Task C2):** simulate a keyboard commit that flips the row to `deleting` (re-render with `deleting` true after the button had focus) → assert `document.activeElement` is the row anchor, not `<body>`. (Drive via a controlled re-render: focus the button, then re-render the item with `deleting=true` and `onDeletePress` still passed but the affordance now hidden.)
  - [x] Preserve the existing pointer/keyboard `stopPropagation` regression tests (Enter/click on Delete does not toggle) — Task C1's Escape branch must not regress them.
- [x] **Task F2: `useDeleteTodo` announcement tests** — `apps/web/src/hooks/useDeleteTodo.test.tsx`
  - [x] Success path: a resolved DELETE announces `"{description} deleted."` exactly once (spy on the `announce` option). The description is read from the seeded cache at call time.
  - [x] Failure path: a rejected DELETE announces `"Couldn’t update “{description}”. The list refreshed to current state."` once, and `invalidateQueries(['todos'])` still fires on settle (reconcile). Assert NO cache rollback write occurs in `onError` (the row was never removed; the refetch is the sole reconcile).
  - [x] Confirm the existing 2.1 tests (deletingIds lifecycle, per-row in-flight arbitration, no-cache-write onMutate) still pass with the added `description` variable + announce option.
- [x] **Task F3: `App` announce-wiring smoke** — `apps/web/src/App.test.tsx`
  - [x] With a seeded list, committing a delete surfaces `"{description} deleted."` in the live region after the refetch drops the row. Keep it light — the mutation internals are covered by F2; this proves App → `useDeleteTodo({ announce })` → `<LiveRegion>` is wired (mirror the create-confirmation App test).

### G. Container re-deploy & end-to-end delete verification (AC 7)

- [x] **Task G1: Rebuild the image and verify delete end-to-end against the running container** — no code change expected; this is the epic-close deploy gate.
  - [x] Start Docker first (dev-env memory: the daemon is not auto-started — `open -a Docker`, wait until `docker info` succeeds).
  - [x] Rebuild and run using the canonical command from Story 1.11: `docker build -t the-long-finger . && docker run -p 8080:8080 -e PORT=8080 -e DATABASE_PATH=/data/todos.db -v tlf-data:/data the-long-finger`.
  - [x] Open `http://localhost:8080`, then verify the full delete flow end-to-end against the packaged backend (same-origin, no Vite proxy): add a task → arm `Delete` → wait past 300 ms → `Confirm` → the row commits and disappears, the DELETE hits `DELETE /todos/:id` returning 204, and a subsequent refresh does NOT show the row (persisted). Confirm view/add/complete still work (no regression).
  - [x] Persistence spot-check (mirrors 1.11 AC 5): create a task → `docker stop` → `docker start` (same `-v tlf-data:/data`) → the task is still present; delete it → stop/start → it stays gone.
  - [x] Record the exact results (image built, container ran, delete confirmed end-to-end, persistence held) in Completion Notes. If Docker genuinely cannot run in the environment, note it explicitly and record the verified local `tsx`-served-`apps/web/dist` same-origin run as the fallback (as 1.11 did) — but the epic-1 retro already verified `docker build`/`run` works once the daemon is started, so prefer the real container check.

### H. Full-suite verification (all ACs)

- [x] **Task H1: Run the whole gate.** **API tests require Node 24** (`nvm use 24` first — better-sqlite3 ABI; shell default is Node 22). This story is web-only in code, but run the full gate: `npm test` (web + api unit/integration), `npm run typecheck`, `npm run build`, `npm run lint --workspace apps/web` (eslint), `npm run lint:css --workspace apps/web` + `lint:css:selftest`, `npm run contrast:check --workspace apps/web`, and `npm run size:check --workspace apps/web`. This story adds attributes + a small effect + hook announce code + tests — a minimal bundle delta (no new deps); if the ratchet trips, confirm the increase is only this story's code and rebaseline per the established convention (Keith-approved rebaselines are the norm).

## Dev Notes

### Layer ownership (unchanged from 2.2 — this story only adds the a11y layer)

| Concern | Owner | 2.3 change |
|---|---|---|
| Single-armed coordination + 300 ms/5 s timers + tap-away | `useArmedDelete` (2.2) | **Tests only** — three deterministic races (D2). No hook logic change. |
| The DELETE mutation (`onMutate`/`onSettled`, `deletingIds`) | `useDeleteTodo` (2.1) | **Add** `announce` option + `description` variable + `onSuccess`/`onError` announce (B1). Do NOT touch `onMutate`/`onSettled` or reintroduce a cache rollback. |
| Idle `Delete` / armed `Confirm` / committing render | `<TodoItem>` (2.2) | **Add** `aria-label` + `aria-pressed` (A1), Escape→anchor + commit-focus (C1/C2), and the `pending || deleting` toggle-inert guard (D1). Do NOT rewrite the `<label>` row markup. |
| Which row is armed / per-row wiring | `<TodoList>` (2.2) | No change. Still `useArmedDelete({ onCommit })` on the default `realClock`. |
| The single App-owned `<LiveRegion>` + `announce` | `App` (1.7) | **Pass** `announce` to `useDeleteTodo` (B2). One region only. |

### AC 5 failure copy — reuse toggle's EXACT string (spec-mandated)

UX line 440 groups toggle AND delete under one mutation-failure announcement: `"Couldn't update '{description}'. The list refreshed to current state."` `useToggleTodo.onError` already emits exactly this (with a curly apostrophe `Couldn’t` and curly quotes `“…”`). Reuse the identical copy in `useDeleteTodo.onError` so there is ONE failure string across mutations. (It reads slightly odd — "update" for a delete — but it is the committed spec copy; matching it keeps the SR contract consistent and reuses the existing test precedent. If you feel strongly a delete-specific "Couldn't delete…" reads better, flag it to Keith rather than diverging silently — see Open Questions.) [Source: ux-design-specification.md line 440; useToggleTodo.ts onError]

### AC 2 success copy + the "announce once" mechanism

`"{description} deleted."` fires in `onSuccess` (the 204 confirms removal; the announcement is terminal — no "Undo") [Source: ux-design-specification.md lines 438, 769]. "Once" is naturally satisfied: `onSuccess` fires once per successful mutation. **But be aware of a shared-primitive limitation** (do NOT try to fix it here): `<LiveRegion>.announce` is literally `setMessage(message)`, so announcing the *same string twice consecutively* does NOT re-render → the SR does not re-announce (e.g. deleting two identically-named tasks back-to-back). This affects create/toggle equally and is a pre-existing v1 behavior. The robust re-announce fix (a nonce/counter, or clear-then-set) belongs to **Story 3.2 (consolidated screen-reader contract)** — do NOT modify the `<LiveRegion>` primitive in 2.3. [Source: LiveRegion.tsx line 21; ux-design-specification.md lines 429–445]

### AC 3 focus — where stranding actually happens, and the scope boundary

- **Revert cases (auto-revert / arm-another / tap-away):** the affordance button node PERSISTS (text/attrs change only), so a focused button keeps focus — no relocation needed (Task C3 verifies). `:focus-visible` keeps a focused, hover-hidden idle affordance visible.
- **Escape (Task C1):** UX line 1396 — Escape on the affordance returns focus to the row anchor and does NOT exit the list. Small, testable.
- **Commit (Task C2) — the real stranding:** on commit the row goes Committing → `showDeleteAffordance` is `false` → the `Confirm` button unmounts → focus falls to `<body>`. Relocate to the still-mounted row anchor (honest-pending keeps the committing row visible until the refetch). Guard on `document.activeElement === document.body` so we only reclaim genuinely-stranded focus.
- **Scope boundary:** following focus PAST the eventual refetch-removal onto an adjacent row is **roving-tabindex / Story 3.1**, not 2.3. Do not build list-wide focus choreography here. The row `<label tabIndex={0}>` is the "row anchor" the epics AC names; do NOT convert it to roving `-1`/`0` in this story. [Source: ux-design-specification.md lines 1396–1399, 1418–1419; epics.md Notes #21]

### AC 6 delete-vs-toggle same-row race — the 2.2 gap this story closes

Arch line 303 puts per-row delete-vs-toggle arbitration in the `<TodoItem>` state machine. Today a Committing row (`deleting=true`, `pending=false`) is `aria-busy` but its toggle path is live: `aria-disabled` and the `handleKeyDown`/`onCheckedChange` guards check only `pending`. So a user could toggle a row that is mid-delete, firing a PATCH that races the in-flight DELETE. Task D1 closes this by making `pending || deleting` the toggle-inert condition (the delete affordance itself is already correctly hidden while `deleting`). This is the "state-race hardening" in the story title, not just the timing races. [Source: architecture.md line 303; TodoItem.tsx lines 160–188]

### DELETE contract — 404-as-success is a SERVER guarantee; keep the client wrapper strict

UX line 1050 says "DELETE returns 404 (already deleted elsewhere) → treated as success." Our server is **idempotent — it returns 204 even for an absent id** (Story 2.1 AC 2; arch line 189), so the client never actually sees a 404 against our backend. The `deleteTodo` wrapper deliberately treats **exactly 204** as success and throws on anything else (2.1 hardening). **Do NOT loosen the wrapper to accept 404** to "implement" the UX line — the 404-as-success intent is already met upstream by the server's idempotent 204, and weakening the strict-204 contract would undo 2.1's review. [Source: ux-design-specification.md line 1050; architecture.md lines 69, 189, 302; api/todos.ts deleteTodo]

### Reduced motion — the 5 s timer is a safety window (unchanged), confirmed for a11y

The 5 s auto-revert floor derives from SR announcement timing (~4 s to read the armed announcement at default rate); a shorter timer would strand SR users mid-window. It is a JS timer, unaffected by `prefers-reduced-motion` — only the `--motion-settle` color/opacity transitions collapse to 0 ms. This is already correct in `useArmedDelete` (2.2); do NOT gate the timers on the motion media query. [Source: ux-design-specification.md lines 768, 809, 1443]

### Files being modified (current state → what changes)

- `apps/web/src/hooks/useDeleteTodo.ts` (UPDATE) — currently `{ id }`-only variables, `onMutate` + `onSettled`, no announce. **Add** `UseDeleteTodoOptions { announce }`, `description` in variables (read from cache in `deleteTodo`), `onSuccess` (deleted announce), `onError` (failure announce, NO cache write). Leave `onMutate`/`onSettled`/`deletingIds`/`inFlightIdsRef` untouched.
- `apps/web/src/hooks/useDeleteTodo.test.tsx` (UPDATE) — add success/failure announce tests; keep 2.1 lifecycle tests green with the new variable/option.
- `apps/web/src/App.tsx` (UPDATE) — `useDeleteTodo({ announce })`; refresh the "announcements are Story 2.3" comment. Do NOT touch create/toggle/failed/indicator logic.
- `apps/web/src/components/recipes/TodoItem.tsx` (UPDATE) — **add** `aria-label` + `aria-pressed` on the delete button; row-anchor `ref`; Escape branch in the button `onKeyDown` (preserve `stopPropagation`); the `deleting`-into-`busy` toggle-inert guards (D1); the commit-focus `useLayoutEffect` (C2). Do NOT rewrite the `<label>` markup, the failed branch, or `showDeleteAffordance`.
- `apps/web/src/components/recipes/TodoItem.test.tsx` (UPDATE) — update the accessible-name assertions (now `aria-label`-driven), add aria-pressed, inert-while-committing, Escape-focus, commit-focus, and the no-icon forced-colors cue assertion.
- `apps/web/src/hooks/useArmedDelete.test.ts` (UPDATE) — add the three deterministic races (D2) via the existing `makeFakeClock()`.
- `apps/web/src/App.test.tsx` (UPDATE) — add the delete-announcement wiring smoke.
- **NOT touched:** `useArmedDelete.ts` (hook logic is done — tests only), `useDeleteTodo`'s `onMutate`/`onSettled`, `<TodoList>.tsx` (no clock prop, no wiring change), `usePendingPresentation.ts`, `LiveRegion.tsx` (the identical-message re-announce fix is Story 3.2), `packages/contracts/*` (204/no-body — no schema), `apps/api/*` (endpoint done in 2.1), the `Dockerfile` (rebuild only, no change), `TodoItem.module.css` (the label change is the forced-colors cue — no new CSS unless a test proves a gap).

### Project Structure Notes

- All code changes are in `apps/web/src` (hooks + one recipe component + tests). No API, contract, or infra source changes — AC 7 is a rebuild/verify of the existing 1.11 `Dockerfile`.
- Web tests co-locate as `*.test.ts(x)`; there is no e2e/Playwright harness yet — the forced-colors/reduced-motion browser gates are Epic 3. [Source: architecture.md#Structure Patterns; ux-design-specification.md lines 685–688]

### References

- [Source: epics.md#Epic 2 › Story 2.3: Delete accessibility & state-race hardening] — the 7 ACs.
- [Source: epics.md Notes #18] — the delete SR contract (armed accessible name, `aria-pressed`, LiveRegion announcement, focus-not-stranded) is authored + tested in Epic 2; Epic 3 is only the gate.
- [Source: epics.md Notes #19] — idempotent-DELETE tests cover state-machine races (during 300 ms window; racing 5 s revert; refresh mid-window), not just "DELETE twice."
- [Source: epics.md Notes #21] — list-wide a11y (roving tabindex, focus-follows-removal, forced-colors/reduced-motion sweeps) is Epic 3; per-control a11y ships with its control in Epic 2.
- [Source: ux-design-specification.md lines 765–771] — the full delete a11y contract: accessible names, `aria-pressed`, 300 ms/5 s timing, tap-away, forced-colors label-change fallback (no icon).
- [Source: ux-design-specification.md lines 438–445] — announcement policy: `"{description} deleted."` (terminal, no undo), the shared toggle/delete failure copy, polite-only LiveRegion.
- [Source: ux-design-specification.md lines 1396–1399, 1416, 1418–1419, 1433] — Escape→row-anchor, roving-anchor structure, armed accessible name, forced-colors text-cue.
- [Source: ux-design-specification.md lines 768, 809, 1443] — 5 s safety-window rationale, unchanged under reduced motion.
- [Source: ux-design-specification.md lines 1046, 1152, 1205, 1246] — single-row-armed, per-item state machine, `<DeleteAffordance>` states (idle/armed-no-commit/armed/committing), TodoList-owned arm coordination.
- [Source: architecture.md lines 69, 189, 302, 303] — DELETE 204/idempotent/no-schema; per-row delete-vs-toggle arbitration in the frontend state machine.
- Code precedents to mirror: `useToggleTodo.ts` (`announce` option + read-description-from-cache + `onSuccess`/`onError` announce shape), `useCreateTodo.ts` (announce-once discipline), `Checkbox.module.css` (forced-colors precedent — but delete needs NONE, its cue is text), `TodoItem.tsx`/`useArmedDelete.ts` (the 2.2 state machine this story annotates), Story 1.11 (`Dockerfile` + the canonical `docker build`/`run` commands for AC 7).

## Previous Story Intelligence (Story 2.2 → 2.3)

From `2-2-inline-two-step-delete-affordance.md` (the immediately preceding story — its handoffs are binding here):

- **2.2 explicitly deferred to 2.3 exactly this story's scope:** `aria-pressed` + enriched accessible names, `<LiveRegion>` success + failure announcements, focus management on revert/removal, the forced-colors conformance check, and the deterministic race tests. 2.2 shipped the injectable-clock seam that makes the races testable — reuse it, do not re-derive.
- **The visible text IS the accessible name today (2.2).** 2.2's `<TodoItem>` tests assert the bare name `Delete`/`Confirm`. 2.3 **must update those tests** because `aria-label` now overrides the accessible name to the enriched strings — expected, not a regression.
- **`useDeleteTodo` has NO `announce` param by design (2.1/2.2).** 2.1 kept variables `{ id }` only "to avoid dead code; 2.3 adds `description` when it wires announcements." This is that story — add the option + variable now.
- **Do NOT reintroduce an `onError` cache rollback.** 2.1's code-review removed it deliberately (a snapshot write is wrong under concurrency; the row was never optimistically removed). 2.3's `onError` is announce-only; the `onSettled` invalidate remains the single reconcile.
- **Keyboard `stopPropagation` on the delete button is the highest-risk regression** (the row `<label>.handleKeyDown` toggles on Enter for ANY target). 2.3 extends this `onKeyDown` with an Escape branch — it MUST preserve the existing `stopPropagation`, and the dedicated "Enter on Delete does not toggle" test must stay green.
- **2.2 review patches worth remembering:** the tap-away `data-armed-delete` marker is applied ONLY to the armed affordance; the `Delete`→`Confirm` label reserves width so arming does not change row height. 2.3's a11y attributes must not disturb either.
- **2.2 left a state-race gap 2.3 closes:** a Committing (`deleting`) row is `aria-busy` but still toggle-live (guards check only `pending`). Task D1 fixes it — this is squarely "state-race hardening."

## Git Intelligence Summary

Recent history (branch `main`): `feat(delete): inline two-step arm-then-confirm delete affordance (story 2.2)` → `fix(delete): apply story 2.2 review patches` → merged via PR #16. The delete stack is present and green:

- `useDeleteTodo.ts` (2.1) — the mutation; 2.3 adds the announce layer.
- `useArmedDelete.ts` (2.2) — the state machine + injectable clock; 2.3 adds race tests only.
- `TodoItem.tsx`/`TodoList.tsx`/`App.tsx` (2.2) — the wired presentation stack; 2.3 adds a11y attributes + focus + the delete-vs-toggle inert guard.
- `useToggleTodo.ts` (1.8) — the announce-option + read-description-from-cache + `onSuccess`/`onError` precedent to mirror for `useDeleteTodo`.
- `Dockerfile` (1.11) — rebuild + verify for AC 7; the epic-1 retro already confirmed `docker build`/`run` works end-to-end once the daemon is started.

## Latest Tech Information

Stack is fixed and current (verified June 2026); no upgrades, no new dependencies in this story. Relevant:

- **React 19** — `aria-label`/`aria-pressed` are plain props spread through the `Button` primitive; the commit-focus relocation uses `useLayoutEffect` (synchronous, before paint, so focus never visibly lands on `<body>`).
- **`@testing-library/react` + Vitest** — accessible-name assertions via `getByRole('button', { name })`; the injectable `PendingClock` + `makeFakeClock()` (deterministic `advance(ms)`, NOT `vi.useFakeTimers`) drives the race tests.
- **Forced-colors / reduced-motion** — jsdom cannot emulate the media queries; the component-level guarantee is the text-label cue + no icon. The Playwright emulation gates are Epic 3 (Story 3.3/3.4).
- **Docker** — `node:24-slim` multi-stage image (1.11); canonical run `docker build -t the-long-finger . && docker run -p 8080:8080 -e PORT=8080 -e DATABASE_PATH=/data/todos.db -v tlf-data:/data the-long-finger`. Start the daemon first (`open -a Docker`).

## Project Context Reference

- Config: `_bmad/bmm/config.yaml` — project "the long finger", implementation artifacts under `_bmad-output/implementation-artifacts`.
- No `project-context.md` exists in the repo (only the generator template) — `architecture.md` + `ux-design-specification.md` + `epics.md` + the Story 2.1/2.2 files are the authoritative context, cited inline above.
- Project memory (persistent): **API tests need Node 24** before running (`nvm use 24`); **Docker daemon must be started manually** (`open -a Docker`) for AC 7 — the epic-1 retro verified the container end-to-end once started; **code review is run externally by Keith** with a different model — do not offer to run it.

## Story Completion Status

Ultimate context engine analysis completed — comprehensive developer guide created. Status: ready-for-dev.

### Open questions / scope confirmations for Keith (non-blocking — sensible defaults chosen)

1. **Delete failure copy — reuse toggle's "Couldn't update…" verbatim?** UX line 440 explicitly shares one failure string across toggle + delete: `"Couldn’t update “{description}”. The list refreshed to current state."` The default follows the spec exactly (one copy, reuses toggle's test precedent). A delete-specific `"Couldn’t delete…"` reads more naturally but diverges from the committed spec and splits the SR contract. **Proceeding with the spec's shared "update" copy;** flag if you want the delete-specific wording.
2. **LiveRegion identical-consecutive-message re-announce.** `announce` is `setMessage`, so deleting two identically-named tasks back-to-back announces only once (a shared limitation with create/toggle). The robust nonce/clear-then-set fix touches the shared `<LiveRegion>` primitive and benefits all mutations, so the default **defers it to Story 3.2 (consolidated SR contract)** rather than changing the primitive in a delete story. Flag if you want the re-announce hardening pulled into 2.3.
3. **Focus after the row is finally removed (post-refetch).** 2.3 guarantees focus is never stranded on the unmounting `Confirm` button — it lands on the row anchor at commit. Following focus onward to an *adjacent* row once the refetch drops the committing row is roving-tabindex behavior, scoped to **Story 3.1**. **Proceeding with anchor-at-commit;** flag if you want adjacent-row focus-follow in 2.3 (it would partially pre-empt 3.1).
4. **Container check (AC 7) depends on Docker Desktop being started** (`open -a Docker`). If the daemon is unavailable at dev time, the fallback is the local `tsx`-served-`dist` same-origin run (as 1.11 recorded), but the real `docker build`/`run` is preferred and the retro confirms it works. Flag if you want AC 7 signed off purely on the local run.

## Dev Agent Record

### Completion Notes

Implemented the accessibility + state-race-hardening layer on top of Story 2.2's delete state machine. No hook logic in `useArmedDelete` changed and the `<TodoList>`/mutation shapes were preserved, exactly as scoped.

- **AC 1 (enriched name + `aria-pressed`)** — The delete `<Button>` now carries `aria-pressed={armed}` and an `aria-label` that overrides the accessible name (`Delete '{description}'` idle / `Confirm deletion of '{description}', press again within 5 seconds to delete` armed) while the visible text stays `Delete`/`Confirm`. Verified live in the container: the real DOM exposes `[pressed]` and the enriched names.
- **AC 2 (success announcement)** — `useDeleteTodo` gained a `announce` option + `description` variable (read from cache at call time, mirroring `useToggleTodo`); `onSuccess` announces `"{description} deleted."` (terminal, no undo). App passes the single App-owned `announce`. Verified live: the LiveRegion showed `browser delete flow deleted.` after a real UI commit.
- **AC 3 (focus never stranded)** — `rowAnchorRef` on the row `<label>`. Escape in the button's `onKeyDown` reverts to idle and returns focus to the anchor (the existing `stopPropagation` was preserved). A `useLayoutEffect` keyed on `deleting` reclaims focus to the anchor only when a commit stranded it on `<body>` (guarded by `document.activeElement === document.body`). Following focus to an adjacent row post-refetch is left to Story 3.1, as scoped.
- **AC 4 (forced-colors cue)** — No icon/CSS added; a test asserts the armed cue is the visible `Delete`→`Confirm` text change and that the affordance contains no `<svg>`. The real browser forced-colors sweep remains Epic 3.
- **AC 5 (failure announcement)** — `onError` is announce-only, reusing toggle's exact shared copy `"Couldn’t update “{description}”. The list refreshed to current state."`; no cache rollback was reintroduced; the `onSettled` invalidate remains the sole reconcile.
- **AC 6 (state-race hardening)** — Closed the 2.2 gap: `busy = pending || deleting` now gates the toggle path (`aria-disabled` on `<label>`/`<Checkbox>`, `if (busy) return` in `handleKeyDown`, `if (!busy)` in `onCheckedChange`), so a Committing row is inert to completion toggles. Added three deterministic clock-driven races to `useArmedDelete.test.ts` (fired during the 300 ms window; racing the 5 s auto-revert both ways; unmount mid-window) — no `vi.useFakeTimers`, reusing the injectable `makeFakeClock()`.
- **AC 7 (container re-deploy + e2e delete)** — Docker daemon was already running. `docker build -t the-long-finger .` succeeded; ran with the canonical `docker run -p 8080:8080 -e PORT=8080 -e DATABASE_PATH=/data/todos.db -v tlf-data-2-3:/data`. Verified against the packaged same-origin backend: SPA served at `/`; create → present → `DELETE /todos/:id` returns **204** → row gone; idempotent second DELETE also 204. Persistence spot-check: created task survived `docker stop`/`start` (same volume); after delete + stop/start it stayed gone. Full UI flow driven in a real browser (Playwright) — arm (`Confirm`, `aria-pressed`) → wait past 300 ms → commit → the row committed and disappeared and the LiveRegion announced `browser delete flow deleted.`; title returned to `the long finger`. Add + view confirmed working (no regression). Container + volume cleaned up afterward.

Full gate green: web `npm test` **173 passed**; api `npm test` (Node 24) **49 passed**; `typecheck`, `eslint` (web), `stylelint` + `lint:css:selftest`, `contrast:check` (7/7), `build`, and `size:check` (91,674 B gz ≤ 91,505 B baseline +512 B tolerance — within tolerance, no rebaseline needed) all pass.

Open-question defaults (all confirmed by proceeding, none blocking): shared toggle/delete failure copy used verbatim (Q1); LiveRegion identical-consecutive-message re-announce deferred to Story 3.2 (Q2); anchor-at-commit focus, adjacent-row follow deferred to Story 3.1 (Q3); AC 7 signed off on the real container (Q4).

### File List

- `apps/web/src/hooks/useDeleteTodo.ts` (MODIFIED) — `UseDeleteTodoOptions { announce }`, `description` mutation variable read from cache in `deleteTodo`, `onSuccess`/`onError` announcements; `onMutate`/`onSettled`/`deletingIds` untouched.
- `apps/web/src/hooks/useDeleteTodo.test.tsx` (MODIFIED) — `setup` accepts `announce`; added success + failure announcement tests (AC 2, 5).
- `apps/web/src/App.tsx` (MODIFIED) — `useDeleteTodo({ announce })`; refreshed the delete comment.
- `apps/web/src/components/recipes/TodoItem.tsx` (MODIFIED) — `aria-label` + `aria-pressed` on the delete button; `rowAnchorRef` on the `<label>`; Escape branch in `onKeyDown` (preserving `stopPropagation`); `busy = pending || deleting` toggle-inert guards; commit-focus `useLayoutEffect`.
- `apps/web/src/components/recipes/TodoItem.test.tsx` (MODIFIED) — enriched accessible-name + `aria-pressed` assertions; Escape-focus, commit-focus, inert-while-committing, and no-icon forced-colors cue tests.
- `apps/web/src/components/recipes/TodoList.test.tsx` (MODIFIED) — updated Delete/Confirm queries to the enriched aria-label names (regression from the rename).
- `apps/web/src/hooks/useArmedDelete.test.ts` (MODIFIED) — exposed `unmount` from `setup`; added the three deterministic race tests (AC 6).
- `apps/web/src/App.test.tsx` (MODIFIED) — updated the 2.2 delete test's button queries to the enriched names; added the delete-announcement wiring smoke test (AC 2).

## Change Log

- 2026-07-01: Story 2.3 implemented (dev-story). AC 1–7 satisfied. Enriched `aria-label` + `aria-pressed` on the delete affordance; `useDeleteTodo({ announce })` threading `description` with `onSuccess`/`onError` announcements (App wired); Escape→row-anchor + never-strand-on-commit focus management; `pending || deleting` toggle-inert guard closing the 2.2 delete-vs-toggle Committing-row race; three deterministic clock-driven races; component-level forced-colors non-color-cue assertion. Container rebuilt and delete verified end-to-end (204 + UI commit + LiveRegion announcement + persistence) against the running image. Full gate green (web 173, api 49, typecheck/lint/css/contrast/build/size). Status → review.
- 2026-07-01: Story 2.3 created (create-story). Scope: the accessibility + state-race-hardening layer on top of 2.2's delete state machine — enriched accessible names + `aria-pressed` (AC 1), `<LiveRegion>` success + failure announcements via a new `useDeleteTodo({ announce })` option threading `description` (AC 2, 5), focus management (Escape→row-anchor + never-strand-on-commit, AC 3), forced-colors non-color-cue verification (AC 4), deterministic race tests + closing the 2.2 delete-vs-toggle Committing-row gap (AC 6), and the Epic-2-close container rebuild + end-to-end delete verification (AC 7). Roving tabindex, the browser forced-colors/reduced-motion Playwright gates, the axe/consolidated-SR contract, and the LiveRegion identical-message re-announce fix are explicitly deferred to Epic 3. Status → ready-for-dev.
