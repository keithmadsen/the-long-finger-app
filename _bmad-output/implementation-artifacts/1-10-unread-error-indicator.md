---
baseline_commit: 53e5f329c6a52c1e129641dc2c048eeb24158391
---

# Story 1.10: Unread-error indicator

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Primary User capturing tasks quickly,
I want a small "N error(s) above" indicator near the input when creates fail,
so that I'm alerted to failures without my typing being interrupted or focus being stolen.

## Acceptance Criteria

1. **Indicator appears, never steals focus.** Given one or more **unacknowledged** failed-create rows exist, when the list renders, then a focusable `<UnreadErrorIndicator>` shows `"N error(s) above"` aligned **right of the capture input** in `--color-error` (`--font-size-secondary` 14px, `--font-weight-medium` 500), **without stealing focus from the input** (it is rendered, never auto-focused) and **without preceding the input in DOM order** (the first-interactive-element invariant — AC of Story 1.7 — must stay green). N is the count of failed-create rows above the list; it climbs as failures accumulate. Pluralize: 1 → `"1 error above"`, ≥2 → `"N errors above"`. [Source: epics.md#Story-1.10 (line 328); ux-design-specification.md#Decision-2 (line 736); #Step-7-§2.5 (lines 413–415)]

2. **Tab reaches it; Enter navigates to the first failed row's Retry.** Given focus is in the input, when I press Tab, then focus moves to the indicator (it is the **second** interactive element, immediately after the input). When I press Enter (or Space/click — native `<button>` activation) on it, then the **first failed row** scrolls into view (`scrollIntoView`) **and** focus moves to **that row's Retry affordance** (the `<Button>` rendered by the Failed `<TodoItem>` variant from Story 1.9). [Source: epics.md#Story-1.10 (line 329); ux-design-specification.md#Decision-2 (line 736); #Journey-5 (line 1065)]

3. **Clears on resolution OR on focus (unread acknowledgement); failures themselves are not dismissed.** Given the indicator, when **all failures are resolved** (every failed row retried successfully or dismissed), then it hides (nothing to indicate). When **I focus it via Tab** (acknowledge), then the current failures are marked **read** and the indicator clears (hides once focus leaves it) **even though the failed rows remain visible and actionable** — i.e. acknowledging the indicator does **not** dismiss the errors; only resolving each row removes it. A **new, later** failure is unread again and re-surfaces the indicator. (This is the only reading that reconciles "shows when failed rows exist", AC 1, with "clears on focus", and is why an `acknowledged`-by-id set is required — see Dev Notes.) [Source: epics.md#Story-1.10 (line 330); ux-design-specification.md#Step-7-§2.5 (line 414 — "clears when … resolves … or focuses the indicator via Tab. It is not dismissible by acknowledgement alone")]

4. **Accessible name.** Given the indicator, when inspected, then its accessible name is exactly `"N error(s) above. Press Enter to view the first failed task."` (same pluralization of the leading count as AC 1, e.g. `"2 errors above. Press Enter to view the first failed task."`). The visible text `"N error(s) above"` is contained within the accessible name (WCAG 2.5.3 Label-in-Name satisfied). [Source: epics.md#Story-1.10 (line 331); ux-design-specification.md#A11y-affordances (line 1421)]

5. **No regressions.** Given the existing suite, when CI runs, then `App.firstInteractive.test.tsx` (input stays first interactive), `App.axe.test.tsx` (0 serious/critical), `contrast:check`, `lint`, `lint:css`, `typecheck`, and the ratcheting `size:check` all stay green. The Story 1.9 Failed-row / Retry / Dismiss / `beforeunload` behavior is unchanged. [Source: epics.md Notes #8 (line 138); #C (line 148); 1-9-failed-create-recovery.md]

## Tasks / Subtasks

- [x] **Frontend: `<UnreadErrorIndicator>` recipe** (AC 1, 2, 4) — new files `apps/web/src/components/recipes/UnreadErrorIndicator.tsx` + `UnreadErrorIndicator.module.css`
  - [x] A presentational recipe wrapping the existing `<Button>` primitive (REUSE it — it owns the `:focus-visible` ring, forced-colors border, `type="button"`; do NOT build a new focusable element). Props:
    ```ts
    export interface UnreadErrorIndicatorProps {
      /** Number of failed-create rows above the list (the visible count). Caller renders this component only when it should be visible; if count <= 0 the component renders null defensively. */
      count: number
      /** Activate (Enter/Space/click): scroll the first failed row into view + focus its Retry. Owned by App. */
      onActivate: () => void
      /** Fired when the button receives focus — App marks the current failures "read" (AC 3). */
      onFocus?: () => void
      /** Fired on blur — App uses it to drop the kept-mounted-while-focused state (AC 3). */
      onBlur?: () => void
    }
    ```
  - [x] Visible label text: `count === 1 ? '1 error above' : \`${count} errors above\``. Set the full accessible name via `aria-label` = `${visibleText}. Press Enter to view the first failed task.` (AC 4). Define both as module-level helpers/constants so the test can assert exact strings. Use the existing copy style (no curly punctuation needed here — plain ASCII, matching `EmptyState`/`CharCounter` plain strings; the curly-quote rule in 1.9 applied to quoted task descriptions, not to this label).
  - [x] Wire `<Button onClick={onActivate} onFocus={onFocus} onBlur={onBlur} className={styles.indicator} aria-label={accessibleName}>{visibleText}</Button>`. `onClick` covers Enter, Space and mouse via native button semantics — do **not** add a custom `onKeyDown` (the spec says "press Enter"; native button activation already includes it and Space). The button is NOT pending/disabled, so the `<Button>` click-guard never blocks it.
  - [x] If `count <= 0` return `null` (defensive; App also gates rendering — see App task).

- [x] **Frontend: `<UnreadErrorIndicator>` styles** (AC 1)
  - [x] In `UnreadErrorIndicator.module.css`, style `.indicator`: `color: var(--color-error)`, `font-size: var(--font-size-secondary)`, `font-weight: var(--font-weight-medium)`. The shared `<Button>` already provides padding/hit-area/focus-ring/forced-colors border; this class only adds the error-text typography (override the Button's default text color/size). Keep it a text affordance (no background/border of its own beyond what `<Button>` supplies); align with the input's first line (`align-self: flex-start` if the parent row is `align-items` stretched). Under `forced-colors: active` the `--color-error` is overridden by the system — that is acceptable because the label TEXT ("N errors above") carries the meaning (mirror the 1.9 / UX-DR26 "label change, not color" discipline). Do NOT introduce literal colors or off-scale px (token-name lint, Story 1.3).

- [x] **Frontend: compose the indicator beside the input + own the unread/visibility state in `App.tsx`** (AC 1, 2, 3) — the central wiring of this story
  - [x] Import `UnreadErrorIndicator`. Render it **immediately after `<CaptureInput>`**, both wrapped in a new flex-row container (`styles.captureRow`) so the indicator sits to the right of the input while the input stays first in DOM order (AC 1 / first-interactive invariant). The instruction line stays ABOVE this row, unchanged.
  - [x] **Unread state (AC 3).** Add:
    - `const [acknowledgedIds, setAcknowledgedIds] = useState<ReadonlySet<string>>(() => new Set())` — failed ids the user has acknowledged by focusing the indicator.
    - `const [indicatorFocused, setIndicatorFocused] = useState(false)` — keeps the indicator mounted while focused so Enter/click can fire even right after focus marked everything read.
    - `const unreadCount = visibleFailedCreates.filter((t) => !acknowledgedIds.has(t.id)).length`
    - `const failedCount = visibleFailedCreates.length` (the displayed N — total failures above, never 0 while shown).
    - `const showIndicator = failedCount > 0 && (unreadCount > 0 || indicatorFocused)`.
  - [x] **Prune acknowledged ids that are no longer failing** (so the set can't grow unbounded and a *resolved-then-new* failure with a fresh id is correctly unread): an effect keyed on `visibleFailedCreates` that, when `acknowledgedIds` contains ids absent from `visibleFailedCreates`, sets the set to its intersection with current failed ids. Guard the set-state so it only runs when the intersection actually differs (avoid render loops) — mirror the `clearFailedCreates` reconcile effect already in App.
  - [x] **Handlers:**
    - `onFocus` → `setIndicatorFocused(true)` AND mark current failures read: `setAcknowledgedIds((prev) => new Set([...prev, ...visibleFailedCreates.map((t) => t.id)]))`.
    - `onBlur` → `setIndicatorFocused(false)`.
    - `onActivate` → find the first failed row's Retry button and `scrollIntoView` + `focus` it (next task).
  - [x] Render: `{showIndicator && <UnreadErrorIndicator count={failedCount} onActivate={activateFirstFailed} onFocus={...} onBlur={...} />}`.
  - [x] **Do NOT auto-focus the indicator** when it appears (AC 1 — focus must stay in the input during burst capture).

- [x] **Frontend: scroll-to + focus the first failed row's Retry** (AC 2)
  - [x] Mark the Retry `<Button>` in the **Failed** branch of `TodoItem.tsx` with a stable, queryable attribute so App can find it without depending on hashed CSS-module class names: add `data-failed-retry` to the Retry `<Button>` (the `<Button>` primitive spreads unknown props onto the native `<button>` via `{...props}`, so `data-failed-retry` lands on the DOM node — verify by reading `Button.tsx`). Do NOT change anything else in the Failed branch (1.9 contract).
  - [x] In `App.tsx`, add a ref on the surface container that holds the list (e.g. wrap `renderSurface()` so the `<TodoList>` area has a stable parent, or put a `ref` on a wrapping element). `activateFirstFailed()` = `const el = surfaceRef.current?.querySelector<HTMLElement>('[data-failed-retry]'); el?.scrollIntoView({ block: 'nearest' }); el?.focus()`. Because failed rows are **pinned at the top** of `rows` (1.9), `querySelector` (document order) returns the **first** failed row's Retry — exactly the target. No need to mark "only the first"; the first match is correct.
  - [x] Keep it null-safe: if there is no failed Retry in the DOM (race where the last failure resolved between render and activation), do nothing (no throw).

- [x] **Frontend tests** (AC 1–5)
  - [x] `apps/web/src/components/recipes/UnreadErrorIndicator.test.tsx` (new): renders `"1 error above"` for `count={1}` and `"3 errors above"` for `count={3}`; accessible name is `"3 errors above. Press Enter to view the first failed task."` (assert via `getByRole('button', { name: ... })`); `onActivate` fires on click and on `{Enter}`/`{ }` keydown (use `userEvent`); `onFocus`/`onBlur` fire; `count={0}` renders null.
  - [x] `apps/web/src/App.test.tsx` (extend): (a) after a create fails, the indicator appears with `"1 error above"` and **focus is still on the capture input** (assert `document.activeElement` is the input — it did not steal focus); (b) `userEvent.tab()` from the input moves focus to the indicator (it is the next tab stop after the input); (c) pressing `{Enter}` on the focused indicator calls `scrollIntoView` (spy) and moves focus to the failed row's Retry button (`data-failed-retry`); (d) **focus-acknowledge**: focusing the indicator then blurring it hides the indicator while the failed row is still present (AC 3); (e) resolving the only failure (Retry → success, or Dismiss) hides the indicator (AC 3); (f) a **second, later** failure after acknowledging the first re-shows the indicator with the new count (unread re-arms). Stub `Element.prototype.scrollIntoView` with `vi.fn()` in this file (jsdom does not implement it — calling it unstubbed throws); restore in cleanup.
  - [x] Keep `App.firstInteractive.test.tsx` green and **add a case**: with a failed row present (indicator visible), the capture input is STILL the first interactive element and the indicator is the second (AC 1). The existing `INTERACTIVE_SELECTOR` already captures `button` — extend a test to assert order `[input, indicator-button, ...retry/dismiss]`.
  - [x] `App.axe.test.tsx`: keep green with the indicator present (a focusable button with a clear accessible name and token-driven error color — should pass; verify contrast of `--color-error` text on `--color-surface` is already covered by `contrast:check`).

- [x] **Gates** (all ACs)
  - [x] Under **Node 24** (`nvm use 24` — the api native binding requires it; this story is frontend-only but run the full workspace suite): `npm run typecheck`, `npm test`, `npm run lint --workspace apps/web`, `npm run lint:css --workspace apps/web`, `npm run contrast:check --workspace apps/web`, then `npm run build --workspace apps/web` and `npm run size:check --workspace apps/web`. This story adds a small recipe + a little App state — **no new dependency**. Rebaseline `size:check` with `-- --update` ONLY if the genuine additions exceed the 512 B tolerance, and call it out in the Completion Notes (a deliberate, reviewed bump — same as 1.9's `f4b5d4b`).

## Dev Notes

### This story is frontend-only and builds entirely on Story 1.9

Story 1.9 already shipped everything the indicator points at: the `failedCreates` client-state collection (in `useCreateTodo`, NOT the `['todos']` cache), the `App`-level merge `rows = [...visibleFailedCreates, ...data]` with failed rows **pinned at the top**, the Failed `<TodoItem>` variant rendering a **Retry** `<Button>` + Dismiss, and the `retry`/`dismiss` handlers. **Do not re-derive or modify any of that.** This story adds (a) a new presentational recipe, (b) App-level unread/visibility state, and (c) one `data-failed-retry` attribute on the existing Retry button. No backend, contract, schema, or hook-logic changes. [Source: 1-9-failed-create-recovery.md; App.tsx as it stands today]

### The one interpretive decision: the "unread" model (why an acknowledged-id set is needed)

AC 1 says the indicator shows when failed rows exist; AC 3 says it clears when you focus it via Tab. Those only reconcile if the indicator tracks which failures the user has **acknowledged**:

- `acknowledgedIds: Set<string>` — failed ids the user has focused/acknowledged.
- `unreadCount` = failed creates whose id is **not** acknowledged.
- **Visibility** = `failedCount > 0 && (unreadCount > 0 || indicatorFocused)`. (Kept mounted while focused so Enter/click still works the instant after focus marked everything read.)
- **Displayed N** = `failedCount` (total failures above) — never `unreadCount`, so the label never reads "0 errors above" while shown, and it "climbs" as failures accumulate (UX line 1090).
- **Focus acknowledges**: on the indicator's `focus`, add all current failed ids to `acknowledgedIds` → `unreadCount` drops to 0 → on blur the indicator hides. **The failed rows stay** (still red-bordered, still Retry/Dismiss-able). This is precisely "clears … or focuses the indicator via Tab. It is not dismissible by acknowledgement alone" (UX line 414): the *unread notification* clears; the *errors* do not.
- **A new, later failure** has a fresh UUIDv7 id not in `acknowledgedIds` → unread again → indicator re-appears. Keying by client id is the same discipline used everywhere in this codebase (1.9 Dev Notes "single keying discipline").
- **Prune** `acknowledgedIds` down to the intersection with current failed ids whenever failures resolve, so the set cannot grow unbounded.

> Open question for Keith (does not block dev — flagged at hand-off): the source has a mild tension — UX spec line 414 lists "focus via Tab" as a clear trigger, while epics AC 3 adds "not dismissible by acknowledgement alone while failures remain." The model above resolves it by clearing only the *unread notification* on focus while leaving the failed rows fully intact. If instead you want the indicator to **stay visible** as long as ANY failed row exists (focus does nothing but navigate), that's a one-line change (`showIndicator = failedCount > 0`) — confirm at review.

### DOM order is load-bearing (first-interactive invariant)

The capture input MUST remain the **first** interactive element (`App.firstInteractive.test.tsx`, a CI tripwire from Story 1.7 / epics Notes #8). The indicator is focusable, so it must be placed **after** the input in DOM order — render it as the input's right-hand sibling inside a flex row, with `<CaptureInput>` first. Tab order then reads: input → indicator → (first failed row's) Retry → Dismiss → … which is exactly what AC 2 wants (Enter on the indicator jumps focus forward to that same Retry). Do NOT render the indicator above or before the input even though it's visually small and adjacent. [Source: epics.md Notes #8 (line 138); App.firstInteractive.test.tsx]

### Finding the Retry target — query, don't thread a ref

Threading a React ref to "the first failed row's Retry" through `TodoList` → `TodoItem` for a dynamic, pinned-at-top list is awkward and fragile. Instead: mark the Failed-variant Retry `<Button>` with `data-failed-retry` (the `<Button>` primitive spreads `{...props}` to the native `<button>`, so the attribute reaches the DOM), keep a `surfaceRef` on the list's container in App, and on activate do `surfaceRef.current?.querySelector('[data-failed-retry]')` → `scrollIntoView` + `focus`. `querySelector` returns document-order-first, and failed rows are pinned at the top of `rows`, so the first match is the first failed row's Retry by construction. This mirrors the codebase's "query a stable selector" precedent (e.g. the first-interactive test queries by selector, not by ref). [Source: TodoItem.tsx Failed branch; Button.tsx `{...props}` spread; App.tsx `rows = [...visibleFailedCreates, ...data]`]

### Files to touch — current state vs. what to add

**Frontend only:**

- `apps/web/src/components/recipes/UnreadErrorIndicator.tsx` — **NEW.** Presentational recipe over `<Button>`. Count → visible text + `aria-label`; `onActivate`/`onFocus`/`onBlur`. Returns null when `count <= 0`.
- `apps/web/src/components/recipes/UnreadErrorIndicator.module.css` — **NEW.** `.indicator`: `--color-error` text, `--font-size-secondary`, `--font-weight-medium`. Typography override only; `<Button>` supplies the rest.
- `apps/web/src/App.tsx` — ADD: import + render the indicator beside `<CaptureInput>` (new `captureRow` flex wrapper); `acknowledgedIds` + `indicatorFocused` state; `unreadCount`/`failedCount`/`showIndicator` derivations; the prune effect; `onFocus`/`onBlur`/`activateFirstFailed` handlers; a `surfaceRef` to query `[data-failed-retry]`. Do NOT disturb the existing 1.9 merge/`beforeunload`/help-text logic — extend, don't rewrite. The header comment currently says "Explicitly NOT here (later stories): the unread-error indicator (1.10) …" — **this is that story**; update that comment to reflect the indicator now lives here (leave Epic-2 delete out). [verified — App.tsx lines around 40–45]
- `apps/web/src/App.module.css` — ADD `.captureRow` (flex row: `<CaptureInput>` grows, indicator to its right; `align-items: flex-start` so the indicator aligns with the input's top line, since the char-counter can sit beneath the input). Reuse spacing tokens (`--space-*`); no literal px (lint).
- `apps/web/src/components/recipes/TodoItem.tsx` — ADD only `data-failed-retry` to the Failed-branch Retry `<Button>`. Nothing else changes (1.9 row contract intact; Epic 2 still adds a sibling delete to the *Active/Complete* `<label>` branch).
- Tests: `UnreadErrorIndicator.test.tsx` (new), extend `App.test.tsx`, extend `App.firstInteractive.test.tsx`; keep `App.axe.test.tsx` green.

There is **no** `recipes/index.ts` barrel — recipes are imported by direct path (see App.tsx importing `./components/recipes/CaptureInput`). Import the new recipe the same way. [verified — `ls components/recipes/` shows no index]

### Design tokens (all already exist — verified in `apps/web/src/styles/tokens.css` via 1.9)

`--color-error` (`#a02d2d`), `--font-size-secondary` (14px), `--font-weight-medium` (500), `--color-focus` (the `<Button>` ring), `--space-*` for the row gap, `--motion-*` (no new motion needed — the indicator may simply appear; no entrance animation is specified). **No new token required, no literal color, no off-scale px.** [Source: 1-9-failed-create-recovery.md#Design-tokens; tokens.css]

### Testing standards

- Vitest + Testing Library, co-located `*.test.tsx`. Mirror the existing `App.test.tsx` fetch-stub pattern (`vi.stubGlobal('fetch', …)`, `renderWithClient`) and the `App.firstInteractive.test.tsx` `INTERACTIVE_SELECTOR` query.
- **`scrollIntoView` is not implemented in jsdom** — stub `Element.prototype.scrollIntoView = vi.fn()` before activating the indicator (and restore it). The grep confirms no existing `scrollIntoView` usage, so there is no shared stub to reuse — add it locally in the test that exercises AC 2.
- Drive focus/keyboard with `@testing-library/user-event` (`userEvent.tab()`, `userEvent.keyboard('{Enter}')`) so Tab order and native button activation are exercised realistically.
- Assert the indicator does NOT steal focus by checking `document.activeElement === <the input>` immediately after a failure surfaces.
- CI gates to keep green: `typecheck`, `lint`, `lint:css`, `contrast:check`, `size:check` (rebaseline only if intentional), unit. Keep `App.axe.test.tsx` + `App.firstInteractive.test.tsx` green. Run api/integration too (they should be untouched) — under **Node 24** (api native ABI requires it; see 1.9 environment note).

### Previous story intelligence (Stories 1.7–1.9)

- **1.9** put failed creates in `useCreateTodo`'s `failedCreates` state, pinned them above the server list in App (`rows = [...visibleFailedCreates, ...data]`), and rendered the Failed `<TodoItem>` (non-`<label>` row, empty checkbox slot, Retry + Dismiss `<Button>`s, `.failed` left border, `aria-describedby`). The indicator points at that Retry. `clearFailedCreates(ids)` + a reconcile effect (failed id later appears server-side → hide the failed copy) already exist — your `acknowledgedIds` prune effect should follow the same "compute the diff, only set-state when it changes" shape to avoid render loops. [Source: 1-9-failed-create-recovery.md; App.tsx]
- **1.7/1.8** precedent: App owns the mutations so their client state reaches the list; recipes/primitives never reach the network; client-only presentation state (now also `acknowledgedIds`, `indicatorFocused`) is NEVER a field on the `Todo` contract — keep it in App state. Reuse `<Button>`; never re-implement focus/forced-colors. [Source: 1-7…md, 1-8…md]
- **Recent commits** (`53e5f32` 1.9 merge, `c403bd4` 1.9 race fixes) confirm the pattern: small, token-driven UI added without touching the backend; bundle-size rebaselined intentionally only when justified.

### Scope boundaries (do NOT implement here)

- **Delete affordance / Epic 2** — out. The indicator only knows about failed *creates*. (UX line 414 mentions "delete removes the failed row" as a future resolution path, but delete does not exist until Epic 2; do not anticipate it.)
- **Roving tabindex / Arrow / Home / End** → Story 3.1. The indicator and the failed rows' buttons are natural tab stops; do not add custom list key-handling here.
- **Bulk "Retry all"** — explicitly forbidden (UX line 1090): per-item recovery is the discipline; the indicator navigates to ONE row, never offers a batch action.
- **localStorage / persistence of unread state** — out; unread/acknowledged state is in-memory only, consistent with 1.9 (`beforeunload` is the protection, not persistence).
- **Assertive announcements** — the indicator carries urgency *visually*; the `<LiveRegion>` failure announcement (1.9, polite, once) is unchanged. Do NOT add a new announcement for the indicator (UX lines 415, 431).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1 — Story 1.10 ACs (lines 320–333); Notes #8 first-interactive invariant (line 138); Notes #12 split of UnreadErrorIndicator from 1.9 (line 144)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-DR10 (line 72); Step 7 §2.5 recovery + unread indicator (lines 413–419); Decision 2 indicator spec (line 736); Journey 5 flow (lines 1065, 1090); recipe inventory (line 1201); a11y accessible-name (line 1421)]
- [Source: _bmad-output/implementation-artifacts/1-9-failed-create-recovery.md — failedCreates client state, App merge/pinning, Failed TodoItem variant + Retry button, clearFailedCreates reconcile effect]
- [Source: _bmad-output/planning-artifacts/architecture.md — Frontend Architecture: App owns mutations so client state reaches the list; recipes/primitives never reach the network; token-driven styling]
- Code verified this story: `apps/web/src/App.tsx`, `App.module.css`, `components/recipes/{CaptureInput,TodoList,TodoItem,CharCounter}.tsx` (+ `.module.css`), `components/primitives/{Button,index}.tsx`, `hooks/useCreateTodo.ts` (return shape), `App.firstInteractive.test.tsx`, `test/setup.ts`, `scripts/check-bundle-size.mjs`, `styles/tokens.css`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

None — no HALT conditions hit. The only deviation from the literal task text was
required by the project's lint rules (caught by `npm run lint`/`lint:css`, fixed
before completion):

- The recipe's `visibleText`/`accessibleName` helpers are **module-level but NOT
  exported** (`react-refresh/only-export-components` forbids non-component exports
  from a component file). The tests assert the literal strings directly, so the
  helpers did not need to be exported to be testable.
- The flex wrapper class is `.capture-row` (kebab-case) referenced as
  `styles['capture-row']`, not `.captureRow` (`selector-class-pattern` enforces
  kebab-case, matching `.instruction-wrap`/`.visually-hidden`).
- The prune effect carries an `eslint-disable-next-line
  react-hooks/set-state-in-effect` with justification, mirroring the existing
  `hasEverHadTodos` session-latch effect.

### Completion Notes List

- **`<UnreadErrorIndicator>` recipe** (new) wraps the shared `<Button>` primitive
  (reused for the focus-visible ring, forced-colors border, `type="button"`).
  `count` → visible `"N error(s) above"` + `aria-label` `"N error(s) above. Press
  Enter to view the first failed task."` (visible text contained in the
  accessible name → WCAG 2.5.3). `onClick` covers Enter/Space/mouse via native
  button semantics (no custom `onKeyDown`). Returns `null` when `count <= 0`.
- **Unread model in `App.tsx`**: `acknowledgedIds` (failed ids the user focused →
  acknowledged) + `indicatorFocused` (keeps it mounted while focused).
  `failedCount` = total failures above (the displayed N, never 0 while shown);
  `unreadCount` = unacknowledged failures; `showIndicator = failedCount > 0 &&
  (unreadCount > 0 || indicatorFocused)`. Focusing the indicator acknowledges the
  current failures (unread → 0) **without dismissing** the failed rows (AC 3); a
  later failure with a fresh id re-arms unread. A guarded prune effect intersects
  `acknowledgedIds` with current failures so the set can't grow unbounded and a
  resolved-then-new failure is correctly unread.
- **First-interactive invariant preserved**: indicator is the capture input's
  right-hand sibling in a new `.capture-row` flex wrapper — input stays first in
  DOM order, indicator is the second tab stop. Never auto-focused (AC 1).
- **Activate → first failed Retry**: marked the Failed-branch Retry `<Button>`
  with `data-failed-retry`; App keeps a `surfaceRef` on the surface wrapper and on
  activate does `querySelector('[data-failed-retry]')` → `scrollIntoView({ block:
  'nearest' })` + `focus()`. Failed rows are pinned at the top, so document order
  makes the first match the first failed row. Null-safe if the last failure
  resolved between render and activation.
- **Resolved the source tension** (Dev Notes "Open question for Keith") in favour
  of the acknowledged-id model: focus clears the *unread notification* only; the
  failed rows stay fully intact and actionable. If you instead want the indicator
  to stay visible while ANY failed row exists, it's the one-line
  `showIndicator = failedCount > 0` change — flagging for your review.
- **Bundle size — deliberate, reviewed rebaseline**: the new recipe + App state +
  CSS grew the gzipped bundle from 76146 B to **76983 B** (+837 B, over the 512 B
  tolerance by 325 B). Rebaselined `bundle-size-baseline.json` with
  `size:check -- --update` (same discipline as Story 1.9's `f4b5d4b`). No new
  dependency was added.
- **Gates (all green under Node 24)**: `typecheck`, full `test` (api 38 + web
  130), `lint`, `lint:css`, `contrast:check` (`--color-error` on `--color-surface`
  = 6.91:1 AA), `build`, `size:check`. `App.firstInteractive.test.tsx` and
  `App.axe.test.tsx` stay green with the indicator present; the Story 1.9
  Failed/Retry/Dismiss/`beforeunload` behavior is unchanged.

### File List

- `apps/web/src/components/recipes/UnreadErrorIndicator.tsx` — NEW
- `apps/web/src/components/recipes/UnreadErrorIndicator.module.css` — NEW
- `apps/web/src/components/recipes/UnreadErrorIndicator.test.tsx` — NEW
- `apps/web/src/App.tsx` — MODIFIED (import + `.capture-row` wrapper + indicator render; `acknowledgedIds`/`indicatorFocused`/`surfaceRef`; `failedCount`/`unreadCount`/`showIndicator`; prune effect; `handleIndicatorFocus`/`handleIndicatorBlur`/`activateFirstFailed`; memoized `visibleFailedCreates`; header comment updated)
- `apps/web/src/App.module.css` — MODIFIED (added `.capture-row`)
- `apps/web/src/components/recipes/TodoItem.tsx` — MODIFIED (added `data-failed-retry` to the Failed-branch Retry `<Button>`)
- `apps/web/src/App.test.tsx` — MODIFIED (added "App unread-error indicator (Story 1.10)" describe block: scenarios a–f + scrollIntoView stub)
- `apps/web/src/App.firstInteractive.test.tsx` — MODIFIED (added indicator-order case + userEvent import)
- `apps/web/bundle-size-baseline.json` — MODIFIED (rebaselined to 76983 B gz)

## Change Log

| Date       | Change                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-30 | Story 1.10 created — `<UnreadErrorIndicator>` recipe (focusable "N error(s) above" right of the input), App-owned unread/acknowledged + focus-visibility state, Enter→scroll+focus first failed Retry. Status → ready-for-dev. |
| 2026-06-30 | Story 1.10 implemented — new `<UnreadErrorIndicator>` recipe + styles; App `acknowledgedIds`/`indicatorFocused`/`surfaceRef` state, prune effect, focus-acknowledge + `activateFirstFailed` handlers, `.capture-row` wrapper; `data-failed-retry` on the Failed Retry button. Tests added (recipe + App a–f + first-interactive order). Bundle-size baseline rebaselined 76146→76983 B gz (reviewed, no new dep). All gates green under Node 24. Status → review. |
