<!-- Powered by BMAD-CORE™ -->

# Story 3.1: List-wide keyboard navigation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Primary User navigating by keyboard,
I want to move through and operate the whole list without tabbing through every control,
So that a long list is fast and predictable to use with the keyboard alone.

## Acceptance Criteria

1. **Given** the list, **When** rendered, **Then** it uses a roving tabindex — exactly one row anchor has `tabindex="0"` and the rest `tabindex="-1"` — with `role="list"` on the container and `role="listitem"` on each row.
2. **Given** focus in the input, **When** I press Tab, **Then** focus moves to the first row anchor (or to the next page element if the list is empty); **Given** focus on the first row, **When** I press Shift+Tab, **Then** focus returns to the input.
3. **Given** focus on a row, **When** I press Arrow Down / Arrow Up, **Then** focus moves to the next / previous row without wrapping at the boundaries; **When** I press Home / End, **Then** focus moves to the first / last row.
4. **Given** focus on a row anchor, **When** I press Space or Enter, **Then** the row's completion toggles.
5. **Given** focus in the input with text, **When** I press Escape, **Then** the input text clears; **Given** focus on a row, **When** I press Escape, **Then** focus returns to the input; **Given** focus on a delete affordance (idle or armed), **When** I press Escape, **Then** focus returns to the row anchor (not out of the list).
6. **Given** the app, **When** I press Cmd/Ctrl+Z, **Then** no app-level state changes (browser-default applies only to text editing inside the input).
7. **Given** focus on a row whose delete commits and the refetch removes it, **When** the row unmounts, **Then** focus and the roving anchor move to an adjacent row (next, else previous; to the input if the list empties) — focus is never stranded on `<body>`. *(Inherited scope: the 2.3 handoff + epic-2 retro action item explicitly assign "adjacent-row focus-follow" to 3.1.)* [Source: epic-2-retro-2026-07-01.md §Epic 3 mapping; 2-3 story Dev Notes AC 3 scope boundary; TodoItem.tsx:122-126 comment]

*Ownership note from epics.md: this story owns the roving-anchor key handling (Arrow/Home/End, anchor `tabindex` management, Tab in/out). The wrapping-`<label>` Space/Enter toggle semantics are owned by Story 1.8 — complementary, not duplicate. Do not rewrite 1.8's toggle guards; the roving layer sits beside them.*

### What is already built (Epics 1–2 — do NOT rebuild)

- **The row anchor exists.** Every row's wrapping `<label>` is already `tabIndex={0}` with `ref={rowAnchorRef}` (TodoItem.tsx:214, :113). This story converts the hard-coded `0` to a roving `0`/`-1` driven by the list — it does not invent the anchor.
- **Space/Enter toggle on the anchor** — `handleKeyDown` (TodoItem.tsx:193-199): Enter toggles for any target bubbling to the label; Space toggles only when `event.target === event.currentTarget` (prevents native-checkbox double-fire). AC 4 is ALREADY satisfied; keep these guards intact and their tests green.
- **Escape on the delete affordance → row anchor** — built in 2.3 (TodoItem.tsx:269-275): the button's `onKeyDown` always calls `stopPropagation()`, and on Escape calls `onDeleteCancel()` + `rowAnchorRef.current?.focus()`. The AC-5 delete clause is ALREADY satisfied; preserve it and its test (TodoItem.test.tsx:363-386).
- **Commit-focus reclaim** — 2.3's `useLayoutEffect` refocuses the row anchor when the unmounting Confirm button strands focus on `<body>`, guarded by `document.activeElement === document.body` (TodoItem.tsx:127-135). AC 7 extends this to the *post-refetch removal* of the whole row; do not weaken the existing guard.
- **`role="list"` / `role="listitem"`** — already explicit on the `<ul>` (TodoList.tsx:62) and each `<li>` (TodoItem.tsx:201). AC 1's role clause is already satisfied; the tests assert it.
- **Single-armed delete coordination** — `useArmedDelete` in TodoList (blur disarms, 300 ms/5 s injectable timers). Untouched by this story.

### Explicitly OUT of scope (do NOT build here)

- **Consolidated SR contract, axe-core scan, LiveRegion identical-message re-announce fix** → Story 3.2. No announcement changes in this story: focus moves announce natively via the focus event (UX line 1399) — do NOT add LiveRegion announcements for navigation.
- **Forced-colors / reduced-motion / 200%-zoom Playwright emulation gates** → Story 3.3.
- **The full committed e2e suite + CI `e2e` job + @p0/@p1 coverage thresholds** → Story 3.4 (e2e smoke spec comment says so explicitly). This story adds only the single keyboard-navigation e2e spec below.
- **`/` or Cmd+K return-to-input shortcuts** — explicitly rejected in the UX spec (lines 1401-1405). Escape is the only return-to-input affordance.
- **Undo of any kind** — NG-6. AC 6 is satisfied by *not binding* any Cmd/Ctrl+Z handler and proving it with a regression test.

## Tasks / Subtasks

- [ ] **A. `useRovingTabindex` hook (AC 1, 2, 3, 7)**
  - [ ] A1. Create `apps/web/src/hooks/useRovingTabindex.ts` — transient view state (`useState`/`useReducer`; NOT TanStack Query). State is the anchored **todo id** (not index): rows reorder on toggle (canonical order re-sorts) and ids are stable; React `key={todo.id}` keeps the DOM node, so id-keyed anchoring means focus survives reorder with zero work.
  - [ ] A2. API shape (guideline, dev refines): takes the ordered navigable ids (normal rows only — failed rows excluded, see Dev Notes), returns per-row `{ tabIndex, onFocus }` and a container `onKeyDown` handling ArrowUp/ArrowDown (no wrap — clamp at boundaries), Home/End (first/last), moving both state and `.focus()` via a ref map keyed by id.
  - [ ] A3. Anchor default + reset: the anchor rests on the **first** navigable row; when the anchored id leaves the list (delete refetch, dismiss) fall back to the row now at the removed row's index (clamped; previous if it was last; nothing to anchor if list empties). When focus exits the list entirely, reset the anchor to the first row so Tab-from-input always lands on row 1 (UX line 1387: "the first row's roving-tabindex anchor").
  - [ ] A4. Removal focus-follow (AC 7): when the anchored row unmounts AND focus was stranded (`document.activeElement === document.body`), focus the fallback anchor; if the list emptied, focus the capture input. Mirror 2.3's stranded-guard exactly — never steal focus that the user moved elsewhere.
  - [ ] A5. Modifier safety: ignore key events with `metaKey`/`ctrlKey`/`altKey` so browser/OS shortcuts (incl. Cmd/Ctrl+Z, AC 6) pass through untouched; `preventDefault()` on handled arrows/Home/End so the page doesn't scroll.
- [ ] **B. Wire roving through `<TodoList>` → `<TodoItem>` (AC 1, 3)**
  - [ ] B1. TodoList: call the hook with the ordered normal-row ids; attach the container `onKeyDown` to the `<ul>`; pass each TodoItem its `tabIndex` + `onFocus` (and the anchor ref registration). Replace the `TodoList.tsx:34` "No roving-tabindex yet" comment.
  - [ ] B2. TodoItem: replace hard-coded `tabIndex={0}` (TodoItem.tsx:214) with the prop; register `rowAnchorRef` with the list's ref map (keep the local ref working for the existing 2.3 Escape/commit-focus paths). Do NOT rewrite the `<label>` markup, the Checkbox/delete placement, or `handleKeyDown`'s toggle guards.
  - [ ] B3. Take inner controls out of the page Tab sequence: checkbox `<input>` gets `tabIndex={-1}` (always — Space/Enter on the anchor is the toggle path; it stays click-operable and SR-reachable via the label); the delete `<Button>` gets `tabIndex={0}` only on the roving-anchor row, `-1` otherwise (keyboard-only delete stays reachable: anchor → Tab → Delete/Confirm → Tab exits; see Dev Notes "Delete reachability"). Failed-row Retry/Dismiss stay natively tabbable (unchanged — UX line 1390 pattern).
- [ ] **C. Escape semantics (AC 5)**
  - [ ] C1. Input clears: in `CaptureInput`, pass an `onKeyDown` to `<TextInput>` (TextInput already forwards caller `onKeyDown` before its Enter logic — TextInput.tsx:29-31): on Escape with non-empty value, clear the draft (no submit, no blur). Empty value → no-op (let the event pass).
  - [ ] C2. Row → input: Escape on a row anchor returns focus to the capture input. Expose a `focus()` handle from `CaptureInput` (`useImperativeHandle`, mirroring the `LiveRegionHandle` precedent — LiveRegion.tsx:6-21); App passes an `onListEscape` callback into `<TodoList>`; the container keydown invokes it when Escape fires on a row anchor (target check — NOT when it bubbles from the delete button, whose own handler already stops propagation).
  - [ ] C3. Delete affordance → row anchor: already built (2.3). Assert unchanged; keep the `stopPropagation` — Enter on Delete must still not toggle the row (TodoItem.test.tsx:320-361 stays green).
- [ ] **D. Cmd/Ctrl+Z no-op (AC 6)**
  - [ ] D1. Bind NOTHING. Verify no new handler intercepts undo combos (A5's modifier guard covers the list handler). Add a regression test: with a populated list and focus in the list and in the input, fire Cmd+Z/Ctrl+Z → no mutation fires, list state unchanged (browser-default text undo in the input is out of jsdom's scope — assert no app handler `preventDefault`s it). Cite the UX contract: "future engineers must not add an undo handler without revisiting NG-6" (UX line 1332) in a code comment at the list keydown.
- [ ] **E. Nested-`<label>` DOM decision — settle formally (epic-2 retro action item 6; Keith: dev decides in-story)**
  - [ ] E1. Evidence gathered at story creation: the label-in-label was ALREADY structurally fixed in story 1.8's review (commit c6cbf81 introduced `Checkbox rootAsLabel`; TodoItem passes `rootAsLabel={false}` so the Checkbox renders a `<span>` root inside the row `<label>`; TodoItem.test.tsx:208-214 asserts `row.querySelector('label')` is null). Verify this holds for every rendered variant (Active/Complete/Pending/ArmedDelete/Committing; Failed has no checkbox), then **record the decision** in `_bmad-output/implementation-artifacts/deferred-work.md`: mark the item resolved — fixed since 1.8, formally recorded here, with the roving-anchor DOM (this story) as the confirming touchpoint. If verification finds a residual nested-label path, fix it in this story instead and record that.
- [ ] **F. Tests (all ACs)**
  - [ ] F1. `useRovingTabindex.test.ts` (new, co-located): exactly-one-anchor invariant; Arrow/Home/End movement; no wrap at boundaries; id-keyed anchor survives reorder; removal fallback (middle/last/only row); reset-to-first on list exit; modifier keys ignored.
  - [ ] F2. `TodoList.test.tsx`: exactly one `tabindex="0"` anchor among rows (AC 1); ArrowDown/Up moves focus between anchors, clamps at ends; Home/End; toggle-reorder keeps focus on the same row; existing armed-delete coordination tests stay green.
  - [ ] F3. `TodoItem.test.tsx`: tabIndex now prop-driven (assert both `0` and `-1` renders); ALL existing tests stay green — Space/Enter toggle (:139-173), Escape-on-delete → anchor (:363-386), commit-focus reclaim (:388-419), Enter-on-delete no-toggle (:320-361), single-label-source (:208-214), inert-while-committing (:450-477).
  - [ ] F4. `App.test.tsx`: Tab from input → first row anchor; empty list → Tab skips to next page element; Shift+Tab from first row → input; Escape on row → input focused; Cmd/Ctrl+Z no-op (D1); existing indicator-second-tab-stop tests (:657-673, :675-694) stay green — when failures exist the order is input → indicator → (failed Retry/Dismiss) → first normal-row anchor.
  - [ ] F5. `CaptureInput.test.tsx`: Escape with text clears the draft and keeps focus; Escape with empty input is a no-op; existing autofocus + clear-refocus-on-submit tests stay green.
  - [ ] F6. `App.firstInteractive.test.tsx` MUST stay green untouched: the capture input remains `interactive[0]` (roving `-1` anchors leave the selector; bare `input`/`button` elements still match it, so `interactive.length > 1` holds with a seeded list).
  - [ ] F7. e2e (new): `e2e/tests/ui/keyboard-navigation.spec.ts` tagged `@p1` — the NFR3-E2E-001 slice in a real browser (jsdom cannot verify real Tab traversal): seed 3 todos; Tab from input → first row anchor; ArrowDown ×2 / ArrowUp / Home / End; Space toggles; Escape → input focused; keyboard-only delete (anchor → Tab → Delete → Enter → wait past 300 ms → Confirm → Enter) → row removed and focus lands on adjacent anchor (AC 7). Use `ui-fixtures` (`test`, `expect`, `seedTodos`) + role selectors; toggle via the anchor keys, NOT `checkbox.check()`. The FULL committed suite remains Story 3.4.
- [ ] **G. Full-gate verification (all ACs)**
  - [ ] G1. `npm run test --workspace apps/web` (all green incl. untouched suites), `npm test` in apps/api under **Node 24** (`nvm use 24` — better-sqlite3 ABI), `typecheck`, `eslint`, `stylelint` + `lint:css:selftest`, `contrast:check`, `build`, `size:check` (ratchet: 91,505 B gz baseline + 512 B tolerance as of 2.3 — the hook is plain-React and should fit; if legitimately over, rebaseline per the established ratchet convention and say so in completion notes).
  - [ ] G2. `npm run test:e2e` (harness merged to main 2026-07-04; Playwright config at repo root, isolated `DATABASE_PATH=./data/e2e.db`, webServer auto-starts `npm run dev`).

### Review Findings

_(populated by code review)_

## Dev Notes

### Where the pieces live (established stack — reuse, don't reinvent)

| Concern | Owner | 3.1 change |
|---|---|---|
| Roving anchor state (which id is `0`) + Arrow/Home/End + removal fallback | **NEW** `useRovingTabindex` (hooks/) | Create. Plain `useState`/`useReducer` — arch: "local UI state… no global state library"; NOT TanStack Query. |
| `role="list"` container, per-row wiring, armed-delete coordination | `<TodoList>` (TodoList.tsx) | Attach container keydown, thread tabIndex/onFocus/refs. `useArmedDelete` untouched. |
| Row anchor `<label>`, Space/Enter toggle, delete button + Escape, commit-focus | `<TodoItem>` (TodoItem.tsx) | `tabIndex` prop-driven; inner-control tabIndex per B3. NOTHING else rewritten. |
| Escape-clears-draft + `focus()` handle | `<CaptureInput>` (CaptureInput.tsx) | Add `onKeyDown` + `useImperativeHandle`. TextInput primitive unchanged (it already forwards `onKeyDown` first). |
| `onListEscape` wiring, Cmd/Ctrl+Z regression test | `App` (App.tsx) | Pass callback + capture ref. No global keydown handler added. |

### The keymap is COMMITTED — implement it verbatim (UX "Keyboard Navigation — Resolved", lines 1367-1405)

Chosen model B, roving tabindex ("used by Gmail, Linear, Things, GitHub"). Contract table at UX lines 1385-1397 — AC 1-5 restate it; on any ambiguity the UX table wins. Two normative details easy to miss:
- Tab **on a row** exits the list ("focus exits to the browser" — there is no page chrome below). With B3's delete-stop the exit is: anchor → active row's Delete → out. See "Delete reachability" below.
- The roving anchor is "a wrapping element with `role='listitem'`… the focusable element" (line 1399). In our DOM the `<li role="listitem">` wraps the `<label>` anchor — the label IS the committed anchor (established 1.6→2.3, `rowAnchorRef` already on it). Do not move the anchor to the `<li>`; the 2.3 Escape/commit-focus paths and tests target the label.

### Delete reachability — the one spec gap, and this story's resolution

The committed keymap has no key that moves focus from the anchor INTO the delete affordance, yet the spec requires Escape-on-affordance (line 1396), blur-disarms (line 1048), and keyboard parity (WCAG 2.1.1; test-design NFR3-E2E-001 "keyboard-only: create/toggle/**delete** reachable & operable" is P1). The rejected Option C was *arrow-into-row*; Tab-into-the-focused-row's-affordance is the standard refinement and is the spec's own pattern for failed rows ("Within a failed row, Tab moves between its Retry and Dismiss" — line 1390). **Resolution (default, flagged in Open Questions):** the delete button is tabbable ONLY on the roving-anchor row (`0`/`-1` per B3). Tab order from the anchored row: anchor → its Delete/Confirm → exit list. Every other row contributes zero tab stops — the "100 items ≠ 200 tabs" goal holds (today EVERY row leaks 3 native stops: label, checkbox input, delete button; B3 fixes that too).

### Reorder & removal are the hard cases — key by id, fall back by index

- **Toggle reorders**: canonical order is `completed ASC, updated_at DESC`; toggling the focused row re-sorts it after `onSettled` invalidate+refetch. `key={todo.id}` preserves the DOM node, so id-keyed anchoring means focus simply travels with the row. Assert this (F2) — an index-keyed implementation would visibly jump.
- **Delete removes**: the committing row stays visible (honest-pending) until refetch drops it. 2.3 already parks focus on its anchor at commit; when the row unmounts, TODAY focus strands to `<body>` — that is exactly the 2.3→3.1 handoff (TodoItem.tsx:122-126; 2.3 Open Q3 "Proceeding with anchor-at-commit; adjacent-row follow is 3.1"). AC 7/A3/A4 close it: fallback anchor = row at the removed index (clamped), focus it only under the stranded-guard; input if the list emptied.
- **Failed-create rows are pinned FIRST** (`App.tsx:251`: `[...visibleFailedCreates, ...(data ?? [])]`) and render a `<div>` (no label, no anchor, natively tabbable Retry/Dismiss — TodoItem.tsx:144-176). They are NOT navigable by arrows (default, see Open Questions): the hook receives only normal-row ids; "first row anchor" for AC 2 means the first NORMAL row. The failed-row Tab-through contract (UX line 1390) already works natively — leave it alone.

### In-flight rows stay focusable — never `disabled`, never skip

Pending/committing rows are `aria-disabled` + toggle-inert (`busy = pending || deleting`, 2.3's race guard) but remain FOCUSABLE — "preserving focus visibility for keyboard users" (UX line 999/1417). Arrows must traverse them normally; Space/Enter on them is already a guarded no-op (`if (busy) return`). Do not filter busy rows out of the navigable list — only failed rows lack anchors.

### Keydown layering — three handlers, strict non-interference

1. **Delete button `onKeyDown`** (2.3): `stopPropagation()` ALWAYS — list handler never sees its keys. Its Escape → anchor. **Highest-risk regression in this story** (2.2/2.3 both flagged it): Enter on Delete must not toggle the row.
2. **Row label `handleKeyDown`** (1.8): Space (target-guarded) / Enter toggle with `preventDefault`. Extend nothing here except what B2 threads through; arrows/Home/End/Escape bubble past it untouched.
3. **NEW `<ul>` container keydown** (this story): Arrow/Home/End/Escape-to-input, with A5's modifier guard, acting only when the event target is a row anchor (check the ref map / `target === anchor`), never when it bubbles from inner controls or failed-row buttons.

### First-interactive invariant & Tab order (CI tripwire — epics note #8)

Capture input MUST remain `interactive[0]` (App.firstInteractive.test.tsx, selector `'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'`). Roving `-1` labels drop OUT of that selector; native inner elements still match it regardless of their tabIndex attribute value, so the seeded-list `length > 1` assertion survives B3. Full Tab order after this story: input → [UnreadErrorIndicator if failures] → [failed Retry/Dismiss…] → roving anchor → anchored row's Delete → exit. Indicator tests (App.test.tsx:657-694) must stay green.

### Focus ring — already enforced, add no CSS

Anchors are already focusable labels; `:focus-visible` ring (`outline: 2px solid var(--color-focus); outline-offset: 2px`) is the established pattern and stylelint REJECTS `outline: none` without a paired `:focus-visible` + `--color-focus` rule. No new CSS expected; if any style is touched, tokens only (no raw values), and `contrast:check` + `lint:css:selftest` gate it.

### Cmd/Ctrl+Z — the contract is "bind nothing"

UX lines 1309-1332 (Resolved, option A): "The application does not bind any handler to Cmd+Z, Ctrl+Z, or related undo key combinations… Future engineers must not add an undo handler without first revisiting NG-6 in the PRD." Implementation = A5's modifier guard on the ONLY new handler + the D1 regression test + the code comment. Nothing else.

### No new components, no new dependencies

Component layer is frozen at 4 primitives + 8 recipes ("no new components in v1 without explicit architectural decision" — a hook is not a component and is the sanctioned home: hooks/ camelCase). Radix/headless libs explicitly NOT adopted in v1 — hand-roll the roving logic (it's ~80 lines of state + a keydown switch). Bundle: no code-splitting, one small bundle; `size:check` ratchet catches growth (G1).

### Files being modified (current state → what changes)

- `apps/web/src/hooks/useRovingTabindex.ts` (NEW) + `useRovingTabindex.test.ts` (NEW) — the hook (A1-A5, F1). Pure `.ts`, no query client needed.
- `apps/web/src/components/recipes/TodoList.tsx` (UPDATE) — currently: `<ul role="list">` mapping rows, `useArmedDelete` coordination, comment ":34 No roving-tabindex yet (Epic 3)". **Add** hook call, container keydown, per-row roving props + `onListEscape` prop. Preserve: render order (derivative of query — never re-sort), armed coordination, divider CSS structure.
- `apps/web/src/components/recipes/TodoItem.tsx` (UPDATE) — currently: hard `tabIndex={0}` (:214), `handleKeyDown` toggle (:193-199), delete Escape (:269-275), commit-focus (:127-135), busy guards. **Change** `tabIndex` to prop, checkbox/delete `tabIndex` per B3, anchor-ref registration. Preserve everything listed in "What is already built".
- `apps/web/src/components/recipes/CaptureInput.tsx` (UPDATE) — currently: internal `inputRef`, autofocus, clear+refocus on submit, NO Escape, NO exposed handle. **Add** Escape-clears (C1) + `focus()` imperative handle (C2).
- `apps/web/src/App.tsx` (UPDATE) — currently: no global keydown, owns announce/LiveRegion, builds `rows` with failed-first pinning. **Add** capture handle ref + `onListEscape` wiring. Do NOT touch create/toggle/delete/indicator logic.
- `apps/web/src/components/recipes/TodoList.test.tsx`, `TodoItem.test.tsx`, `CaptureInput.test.tsx`, `App.test.tsx` (UPDATE) — per F2-F5.
- `e2e/tests/ui/keyboard-navigation.spec.ts` (NEW) — per F7.
- `_bmad-output/implementation-artifacts/deferred-work.md` (UPDATE) — E1 decision record.
- **NOT touched:** `Checkbox.tsx`/`Button.tsx`/`TextInput.tsx`/`LiveRegion.tsx` primitives (tabIndex flows through existing prop spread — Button spreads unknown props; Checkbox already forwards `aria-*`, confirm it forwards `tabIndex` to the input, extend the pass-through ONLY if missing), `useArmedDelete.ts`, `useDeleteTodo.ts`/`useToggleTodo.ts`/`useCreateTodo.ts`/`usePendingPresentation.ts`, `packages/contracts/*`, `apps/api/*`, `Dockerfile`, `playwright.config.ts`, CSS modules (expected zero CSS).

### Project Structure Notes

- Hook: `apps/web/src/hooks/useRovingTabindex.ts` + co-located `.test.ts` (pure-DOM hook → `.ts` test, no `renderWithClient`); components PascalCase co-located `.test.tsx` — matches every existing file.
- e2e lives at REPO ROOT (`e2e/`, `playwright.config.ts`) — the framework-setup deviation is recorded and intentional; `architecture.md`'s older `apps/web/e2e/` path is superseded. Fixtures: import `test`/`expect` from `e2e/support/ui-fixtures.ts`; factory `createTodo()` from `e2e/support/factories/todo-factory.ts`; tag `@p1`; run scoped via `npx playwright test e2e/tests/ui/keyboard-navigation.spec.ts` or `npm run test:e2e:p1`.
- No timers in this story → no `PendingClock` needed (it exists in `usePendingPresentation.ts:34-45` if a debounce ever seems tempting — it shouldn't).

### References

- [Source: epics.md#Story 3.1: List-wide keyboard navigation] — the 6 ACs + ownership note.
- [Source: epics.md#Notes #7, #8, #21] — primitives keyboard-ready so Epic 3 "adds only the roving coordination"; first-interactive CI tripwire; list-wide a11y is Epic 3's remit.
- [Source: ux-design-specification.md lines 1367-1405] — "Keyboard Navigation — Resolved": the committed keymap table (1385-1397), roving note (1399), rejected alternatives (/, Cmd+K — 1401-1405).
- [Source: ux-design-specification.md lines 1309-1332] — "Cmd+Z / Ctrl+Z Behaviour — Resolved": bind nothing; NG-6.
- [Source: ux-design-specification.md lines 387, 1459] — first-interactive-element invariant; Tab order = DOM order: input → list rows (roving) → page exit.
- [Source: ux-design-specification.md lines 1390, 1048, 1396] — failed-row Tab-through; blur disarms Confirm; Escape-on-affordance → anchor.
- [Source: ux-design-specification.md lines 999, 1417, 1458] — inert-but-focusable `aria-disabled` rows; No Keyboard Trap ("Escape from any focused element returns to the input or to the row anchor").
- [Source: architecture.md lines 200, 251, 259-263, 77/202] — local UI state rule; naming (hooks camelCase); test placement; frozen component set.
- [Source: architecture.md line 300] — `<TodoList>` render is derivative of query order; must not re-sort (roving must key by id, not resort).
- [Source: test-design-qa.md NFR3-E2E-001 (P1)] — keyboard-only create/toggle/delete reachable & operable, E2E level.
- [Source: epic-2-retro-2026-07-01.md action item 6 + §Epic 3 mapping line 98] — nested-label decision owned by 3.1; "roving tabindex + adjacent-row focus-follow (2.3 deferred; rows are all tabIndex={0} today)".
- [Source: 2-3-delete-accessibility-state-race-hardening.md Dev Notes + Completion Notes] — the built Escape/commit-focus/busy-guard layer this story sits on.
- Code precedents to mirror: `useArmedDelete.ts` (list-owned per-row coordination hook shape), `LiveRegion.tsx:6-21` (`useImperativeHandle` handle), `TodoItem.tsx:193-199` (target-guarded key handling), `e2e/tests/ui/capture-and-complete.smoke.spec.ts` (fixture usage + role selectors + label-click toggle caveat).

## Previous Story Intelligence (Story 2.3 → 3.1)

Binding handoffs from `2-3-delete-accessibility-state-race-hardening.md`:

- **2.3 built this story's floor**: `rowAnchorRef` on the label, Escape-on-affordance → anchor, commit-focus reclaim with the `activeElement === body` guard. 3.1 EXTENDS (adjacent-row follow, roving `0`/`-1`) — it must not re-derive or relocate any of it.
- **2.3 Open Q3 answered by proceeding**: "anchor-at-commit; adjacent-row follow deferred to 3.1" — that deferral is AC 7 here.
- **The delete button's `stopPropagation` is the highest-risk regression** (flagged in BOTH 2.2 and 2.3): the row label toggles on Enter for ANY bubbled target; the new container handler adds a third layer — keep the "Enter on Delete does not toggle" test green as the canary.
- **`busy = pending || deleting` gates the toggle** (2.3's race fix): roving traversal must include busy rows (focusable) while Space/Enter stays inert on them. Don't "optimize" busy rows out of navigation.
- **Test style**: deterministic, no `vi.useFakeTimers` (injectable clock precedent — irrelevant here, no timers); RTL role/name queries; delete queries use enriched aria-label names (`/^Delete '/`, `/^Confirm deletion of/`).
- **Full gate as of 2.3**: web 173 tests, api 49 (Node 24), typecheck/eslint/stylelint/contrast(7/7)/build/size (91,674 B gz vs 91,505 B baseline, within +512 B tolerance). Expect the web count to grow; size to stay within tolerance or be rebaselined explicitly.

## Git Intelligence Summary

`main` now contains the merged Playwright harness (PR #20, 2026-07-04): root `playwright.config.ts` (two projects: browserless `api` + `chromium`; webServer `npm run dev` on isolated `DATABASE_PATH=./data/e2e.db`; baseURL `http://localhost:5173`), `e2e/support/` fixtures (mergeTests: seedTodos + apiRequest + interceptNetworkCall + networkErrorMonitor), factory, 4 passing sample specs, scripts `test:e2e`/`test:e2e:p0`/`test:e2e:p1`/`test:e2e:report`. New root devDeps: `@playwright/test ^1.61.1`, `@seontechnologies/playwright-utils ^4.4.0`, `@faker-js/faker ^10.5.0`. Harness selector guidance (from its README + smoke spec): accessible roles only, checkbox named by description, toggle via label/keys not `checkbox.check()` (real input hidden behind styled indicator). Before that: PR #17 (2.3 a11y layer), PR #16 (2.2 state machine) — the delete stack this story navigates around is stable and green.

## Latest Tech Information

Stack fixed and current (June 2026); **zero new dependencies** in this story. Relevant specifics:

- **React 19** — refs as props (no `forwardRef` needed on function components); `useImperativeHandle` for the CaptureInput `focus()` handle mirrors LiveRegion. For the ref map use a `Map<string, HTMLLabelElement>` in a `useRef`; register via callback refs (React 19 callback-ref cleanup functions are supported).
- **Roving tabindex** (WAI-ARIA APG "Keyboard Navigation Inside Components") — anchor moves with `tabIndex` swap + `.focus()`; `onFocus` on each anchor syncs state when focus arrives by other means (click). Our list is `role="list"` (NOT `listbox`/`grid` — no `aria-activedescendant`, real focus moves; matches UX line 1399's focus-event announcement model).
- **jsdom limits** — `user-event`'s `tab()` simulates tab order well, but REAL browser Tab semantics (exit-to-chrome, focus-visible heuristics) are why F7's Playwright spec exists. Do not write jsdom assertions about exiting the document.
- **Playwright 1.61** — `page.keyboard.press('Tab' | 'ArrowDown' | 'Space')`; `expect(locator).toBeFocused()`; `:focus-visible` triggers naturally under keyboard input in Chromium.

## Project Context Reference

- Config: `_bmad/bmm/config.yaml` — planning artifacts `_bmad-output/planning-artifacts`, implementation artifacts `_bmad-output/implementation-artifacts`.
- No `project-context.md` in the repo — `epics.md` + `ux-design-specification.md` + `architecture.md` + story 2-3 + the harness progress doc are the authoritative context, cited inline.
- Project memory: **api tests need Node 24** (`nvm use 24`); **code review is run externally by Keith** — mark review and stop, don't self-review; Docker not needed this story.

## Story Completion Status

Ultimate context engine analysis completed — comprehensive developer guide created. Status: ready-for-dev.

### Open questions / scope confirmations for Keith (non-blocking — sensible defaults chosen)

1. **Keyboard path to the delete affordance.** The committed keymap never says how focus reaches the delete button; parity (WCAG 2.1.1, NFR3-E2E-001) requires it. **Default: Tab from the anchored row reaches THAT row's Delete/Confirm only (tabbable on the anchor row, `-1` elsewhere)** — the spec's own failed-row Tab-through pattern, and Tab still exits the list one stop later. Flag if you'd rather keep the spec's literal "Tab on a row exits immediately" and accept a different delete-reachability mechanism.
2. **Roving anchor resets to the first row when focus leaves the list** (so Tab-from-input always lands on row 1, per the spec's letter). Gmail-style position persistence is the alternative. Default: reset.
3. **Failed rows are excluded from arrow navigation** (no anchor; reached via the indicator/Tab exactly as today). Including them would need a synthetic anchor on a `<div>` row — more DOM churn for little gain. Default: exclude.
4. **One `@p1` keyboard e2e spec ships in this story** (F7) — real-browser Tab/arrow semantics can't be verified in jsdom, and the harness is now on main. The FULL committed suite stays in 3.4. Default: include the single spec.
5. **Nested-label item** (your "dev decides" call): evidence says it was fixed in 1.8 (`rootAsLabel={false}` + guard test), so the expected outcome is verify + formally record closure in deferred-work.md rather than new DOM work. Dev will fix instead if verification finds a residual path.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-05: Story 3.1 created (create-story). Scope: convert the existing always-`tabIndex={0}` row anchors to a list-owned roving tabindex (`useRovingTabindex`, id-keyed, no-wrap Arrow/Home/End, reset-to-first on exit), Tab in/out semantics with inner controls removed from the page tab sequence (delete reachable only on the anchored row), Escape triad (input-clears net-new, row→input net-new via CaptureInput focus handle, delete→anchor preserved from 2.3), Cmd/Ctrl+Z bind-nothing + regression test, adjacent-row focus-follow after delete removal (AC 7, the 2.3 handoff), formal closure of the nested-label deferred item, one `@p1` keyboard e2e spec on the new harness. SR-contract changes, browser emulation gates, and the full e2e suite remain 3.2/3.3/3.4. Status → ready-for-dev.
