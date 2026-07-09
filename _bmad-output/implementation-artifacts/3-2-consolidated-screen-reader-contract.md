---
baseline_commit: 7b8a05238181e0abdbe673ec4fb456b1684c7741
---

<!-- Powered by BMAD-CORE™ -->

# Story 3.2: Consolidated screen-reader contract

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Primary User using a screen reader,
I want every state change and control announced consistently and verified on real screen readers,
So that I can operate the entire app non-visually with confidence.

## Acceptance Criteria

1. **Given** the app, **When** audited, **Then** the single `<LiveRegion>` (`role="status"`, polite) carries all status messages; `aria-busy="true"` marks pending rows from t=0; pending/failed rows use `aria-disabled` (not HTML `disabled`) to preserve focus visibility; failed rows expose the committed `aria-describedby` text; and no extra ARIA landmarks beyond the documented structure are added.
2. **Given** each user action, **When** it confirms, **Then** the announcement matches the committed patterns: "{description} added.", "marked complete.", "marked active.", "{description} deleted.", create/mutation/load failure messages — with the verb + minimal-disambiguator rule and no announcement storm during burst capture.
3. **Given** the empty and loading states, **When** rendered, **Then** they are plain text with no extra `aria-live` (so they don't announce on every load).
4. **Given** a release candidate, **When** the scripted NVDA (Windows) + VoiceOver (macOS) smoke test runs, **Then** it passes as a **gating** criterion — pending→settled transitions announce correctly and focus is never stranded.
5. **Given** two identical consecutive announcements (e.g. deleting two same-named tasks, or two identical mutation failures), **When** the second fires, **Then** the screen reader announces it again — the `<LiveRegion>` primitive no longer silently drops repeated identical messages. *(Inherited scope: the epic-2 retro + deferred-work.md explicitly assign the "LiveRegion identical-consecutive-message re-announce fix (nonce / clear-then-set on the shared primitive)" to 3.2.)* [Source: deferred-work.md line 9; epic-2-retro-2026-07-01.md items 37, 73, 99]

*Ownership note: this story is the consolidated AUDIT + the primitive fix + the manual-gate artifact. The per-control SR behavior (armed-delete names, failure announcements, describedby wiring) shipped with its control in Epics 1–2 and already works — this story verifies, locks, and documents; it does not rebuild.*

### What is already built and COMPLIES (verify + lock with tests — do NOT rebuild)

- **Single polite live region** — `LiveRegion.tsx` renders the app's only `role="status"` `aria-live="polite"` element, mounted unconditionally as the first child of `<main>` (App.tsx:270). Imperative `announce` handle (React 19 ref-as-prop), never assertive, never steals focus. Its own tests cover politeness/no-focus-steal.
- **All seven committed announcement strings exist** with announce-once guards (see the call-site table in Dev Notes). Create failure has an `announcedRef` guard — a retry that fails again does NOT re-announce (useCreateTodo.ts:97-99, 188-194; tested at useCreateTodo.test.tsx:330). Load failure announces once per error episode (`errorAnnouncedRef`, App.tsx:146-155).
- **`aria-busy` from t=0** — `usePendingPresentation.ts:120` returns `ariaBusy: pending` ungated by the 150 ms visual threshold; applied on the `<li>` (TodoItem.tsx:216) for all three busy variants (Pending create / PendingToggle / Committing delete — each sets its marker in `onMutate` = t=0). Tested (TodoItem.test.tsx:65, :547).
- **`aria-disabled`, never HTML `disabled`** — row label + Checkbox get `aria-disabled={busy}` (TodoItem.tsx:224, :242) with behavioral guards (keydown bail, `onCheckedChange` guard, affordance unmount). Zero HTML `disabled` anywhere in apps/web/src; `Button` uses a guarded-click pattern that keeps focus (Button.tsx:23-33).
- **Failed-row `aria-describedby`** — id `failed-create-help` (App.tsx:25), exact committed hidden text `'Your typed text is saved here until you retry, dismiss, or refresh.'` (App.tsx:28-29), rendered accessible-clip (not display:none) only while a failed row exists (App.tsx:322-326), wired to the failed variant's inner `<div>` (TodoItem.tsx:162). Tested (TodoItem.test.tsx:324; App.test.tsx:415).
- **Landmark structure** — exactly one `<main>` (App.tsx:269); explicit `role="list"` (TodoList.tsx:95) / `role="listitem"` (TodoItem.tsx:160, :216); no header/nav/aside. Matches the UX "no additional ARIA roles or landmarks" rule.
- **Empty/loading states are plain text** — all three `EmptyState` variants are plain `<p>` text, no aria-live, no role (comment at EmptyState.tsx:21 documents why). CharCounter and UnreadErrorIndicator have no live semantics. AC 3 already complies in behavior — it lacks only a locking test.
- **axe gate exists** — `App.axe.test.tsx` (vitest-axe, color-contrast rule off → separate contrast gate) covers populated / empty / failed-load / pending states.
- **Story 3.1 roving layer** — anchor tabIndex, Escape triad, adjacent-row focus-follow after delete, stranded-focus guards (`document.activeElement === document.body`). 224 web tests green. Nothing here may regress.

### Explicitly OUT of scope (do NOT build here)

- **Forced-colors / reduced-motion / 200%-zoom Playwright emulation gates** → Story 3.3.
- **Full committed e2e suite, CI `e2e` job, @p0/@p1 coverage thresholds, full WCAG-matrix gate mapping, k6** → Story 3.4. This story adds at most the single SR-contract e2e spec below.
- **Contrast matrix / bundle-budget rework** → Story 3.4.
- **New components or a global announcement library** — the component layer is frozen (4 primitives + 8 recipes); the fix happens INSIDE the existing `LiveRegion` primitive. [Source: architecture.md lines 77, 202]
- **Assertive announcements, toasts, extra live regions** — "Assertive politeness is reserved for nothing in v1." [Source: ux-design-specification.md §2.6]

## Tasks / Subtasks

- [x] **A. LiveRegion identical-message re-announce fix (AC 5, 1)**
  - [x] A1. Fix inside `apps/web/src/components/primitives/LiveRegion.tsx` (currently `announce: setMessage` — a same-string call is a React bail-out no-op and even a re-render leaves the DOM text node unchanged, so AT fires nothing). Default technique: **nonce — append an alternating zero-width invisible suffix** (U+200B, written as `'\u200B'` in code — never paste it literally) so the text node mutates while the spoken output is unchanged. See Dev Notes "Re-announce technique" for the trade-off analysis (clear-then-set is timing-flaky across AT; a second alternating region violates the committed single-region contract).
  - [x] A2. The primitive stays data-ignorant (primitives know nothing of data — architecture.md line 424): the dedupe-busting lives in the primitive's own state, not in callers. Callers keep calling `announce(message)` unchanged; no hook or recipe edits for this task.
  - [x] A3. Preserve the announce-once guards' semantics: `useCreateTodo`'s repeated-same-submit-failure suppression (committed UX rule — "Repeated failures of the same submit do not re-announce") must still suppress. The fix makes *distinct events with identical text* announce; it must NOT defeat deliberate suppression (those guards sit above the primitive, so no interaction is expected — assert it).
  - [x] A4. Tests (`LiveRegion.test.tsx` + one integration-level case): identical consecutive `announce()` calls produce a DOM mutation both times (assert text-node change/nonce alternation, since jsdom can't observe AT); existing tests stay green ('renders exactly one polite status region and never assertive', 'does not steal focus'); App-level: deleting two same-named todos yields two observable announcement events (App.test.tsx).
- [x] **B. Audit-locking tests — freeze the contract so 3.3/3.4 can't drift it (AC 1, 3)**
  - [x] B1. App-wide single-live-region invariant: with a populated list + a pending row + a failed row rendered, assert exactly ONE `[aria-live]`/`role="status"` element exists in the document (App.test.tsx).
  - [x] B2. No-extra-landmarks invariant: assert the rendered tree contains exactly one `<main>` landmark and no `nav`/`aside`/`header`/`footer`/`region` roles; `role="list"`/`role="listitem"` only where documented (App.test.tsx).
  - [x] B3. EmptyState lock: loading, empty, and failed-load variants carry NO `aria-live` and no live role (EmptyState.test.tsx — behavior already complies, no test locks it).
  - [x] B4. Document the one deliberate exception in a code comment where it lives: `AppErrorBoundary.tsx:44` renders `role="alert"` — but only in the crashed-app fallback where App (and the LiveRegion) is unmounted, so the single-region contract holds in any running state.
  - [x] B5. Extend `App.axe.test.tsx` to the states it misses: failed-create row present, and armed-delete state (epic-2 retro assigns "axe-core scan" to 3.2; keep color-contrast rule disabled per the established pattern).
- [x] **C. Announcement copy + edge audit (AC 2)**
  - [x] C1. Verify all seven call-site strings against the committed §2.6 patterns (table in Dev Notes). Fix the one inconsistency: toggle/delete failure copy uses curly DOUBLE quotes (`Couldn’t update “X”…`, useToggleTodo.ts:99-101, useDeleteTodo.ts:101-103) while create failure uses curly single quotes and the committed copy uses single quotes — align mutation-failure copy to the single-quote style (`‘…’`) and update the paired tests (useToggleTodo.test.tsx:122 area, useDeleteTodo.test.tsx:165, App.test.tsx:359).
  - [x] C2. Empty-disambiguator hardening: toggle/delete read `description` from the cache at announce time and fall back to `''` (would announce "` deleted.`") if the row left the cache (useToggleTodo.ts:112-117, useDeleteTodo.ts:118-123). Snapshot the description into the mutation variables at call time (the row is guaranteed present when the user acts on it) so the announcement never renders an empty disambiguator. Small change; test with a cache-evicted row.
  - [x] C3. Burst-capture no-storm assertion: rapid consecutive creates each announce once on their own confirm, replacing the region text (no queue, no storm) — one test firing 3 staggered creates and asserting the region shows each "{description} added." as it lands and never concatenates. Document the replace-not-queue semantics decision in Dev Notes (see "append and rotate" note).
  - [x] C4. Verify the silent cases stay silent: on-load canonical reorder announces nothing; Dismiss announces nothing (deliberate — no committed string exists); pending→confirmed generates exactly one announcement per lifecycle. Assert where cheap; cite existing tests where already covered.
- [x] **D. Scripted NVDA + VoiceOver smoke-test artifact (AC 4)**
  - [x] D1. Author `docs/screen-reader-smoke-test.md` — the scripted, repeatable manual gate the UX spec commits ("NVDA on Windows + VoiceOver on macOS, scripted, before each release"). Script the full loop with exact expected utterances: load (title + list discovery), burst-add 3 tasks (each "{description} added.", no storm), toggle complete + active (announcements + aria-busy pending→settled silence), keyboard-only two-step delete (idle/armed accessible names, "deleted." announcement, focus lands on adjacent row — never stranded), create failure (failure announcement once, describedby text discoverable, retry re-announce behavior), identical-consecutive delete (AC 5 verification on real AT), empty/loading states NOT self-announcing. Include environment capture per SM-1 (OS, browser, AT + version), pass/fail per step, and the two named pass criteria: pending→settled transitions announce correctly; no announcement storm during burst capture.
  - [x] D2. Record the gate's standing in the doc header: gating before each release; VoiceOver runnable on this dev machine; NVDA requires a Windows environment (see Open Questions — Keith decides who/when for the NVDA leg).
  - [x] D3. Run the VoiceOver leg against the dev server for this story's changes and record the result in the doc + completion notes. (The NVDA leg's first recorded run may land with the release candidate per D2's decision.)
- [x] **E. SR-contract e2e spec (AC 1, 2, 5 at browser level)**
  - [x] E1. `e2e/tests/ui/screen-reader-contract.spec.ts` tagged `@p1`, using `ui-fixtures` (`test`/`expect`/`seedTodos`) + `todo-factory`: assert via `role="status"` locator that create → "added.", toggle → "marked complete.", delete → "deleted." land in the region; two same-named deletes produce a second observable announcement (AC 5 in a real DOM); exactly one `[aria-live]` element app-wide; `aria-busy` appears on the row during a slowed mutation (use `interceptNetworkCall` to delay) and clears on settle. Scope GET /todos responses to the spec's rows via the 3.1 `page.route` precedent if list-wide assertions are needed (parallel suite shares one DB). The FULL suite remains 3.4.
- [x] **F. Decision records (AC 1 wording reconciliations — write into this file's Dev Notes + code comments where they live)**
  - [x] F1. Failed rows and `aria-disabled`: AC 1's "pending/failed rows use aria-disabled" reads as "never HTML `disabled`"; the UX variant table commits Failed as `aria-disabled=false` (Retry/Dismiss are interactive; the failed row's *toggle/delete surfaces* don't exist — empty checkbox slot, no delete affordance). Current behavior (TodoItem.tsx:155-156 comment) is CORRECT — record it, change nothing.
  - [x] F2. "UX-DR25" is epics.md's inventory label; the UX spec has no UX-DR ids — cite the section "Screen Reader Support — Consolidated Contract" (~lines 1407-1424) in tests/comments.
  - [x] F3. "Focus never stranded" (AC 4) binds to the built commitments: aria-disabled-not-disabled focus preservation, delete blur-disarm, Escape triad, 3.1 adjacent-row focus-follow + stranded guards. The smoke script (D1) is where it's verified end-to-end on real AT.
- [x] **G. Full-gate verification (all ACs)**
  - [x] G1. `npm run test --workspace apps/web` (all green incl. untouched 3.1 suites), `npm test` in apps/api under **Node 24** (`nvm use 24`), `typecheck`, eslint, `lint:css` + `lint:css:selftest`, `contrast:check`, `build`, `size:check` (baseline 92,295 B gz + 512 B tolerance; the nonce fix is bytes — if legitimately over, rebaseline per convention and say so).
  - [x] G2. `npm run test:e2e` (existing 5 + the new spec; harness attaches to `npm run dev` locally, isolated `DATABASE_PATH=./data/e2e.db`).
  - [x] G3. VoiceOver smoke run per D3.

## Dev Notes

### Announce call sites — the audit table (current strings, verified 2026-07-08)

| Event | File:line | Exact current string | Committed §2.6 pattern | Verdict |
|---|---|---|---|---|
| Create success | useCreateTodo.ts:216 | `` `${body.description} added.` `` | "{task description} added." | ✅ |
| Create failure | useCreateTodo.ts:190-192 | `` `Couldn’t save ‘${desc}’. Use Retry to try again.` `` | "Couldn't save '{task description}'. Use Retry to try again." | ✅ (curly single quotes) |
| Toggle success | useToggleTodo.ts:81-85 | `marked complete.` / `marked active.` (destination boolean decides) | same | ✅ |
| Toggle failure | useToggleTodo.ts:99-101 | `` `Couldn’t update “${desc}”. The list refreshed to current state.` `` | "Couldn't update '{task description}'. …" | ⚠️ C1: double→single quotes |
| Delete success | useDeleteTodo.ts:88 | `` `${description} deleted.` `` | same; fires on 404-as-success too | ✅ |
| Delete failure | useDeleteTodo.ts:101-103 | shared mutation-failure copy | same | ⚠️ C1 |
| Load failure | App.tsx:19 + :149 | `Couldn’t load your list. Refresh to try again.` (once per episode) | same | ✅ |

Timing contract (committed, "Auditory–visual parity" §2.6): announce **on backend confirm, never on submit**; pending is silent-but-`aria-busy`; pending→confirmed produces exactly one announcement. The 150 ms flicker threshold is a *sighted-user* affordance — ARIA state and visual state deliberately diverge in timing. Do not add pending announcements. [Source: ux-design-specification.md §2.6 ~line 443; architecture.md lines 199, 284]

Silent by design: on-load canonical reorder ("A future engineer must not add an announcement here" — Decision 1 ~line 720); Dismiss (no committed string; useCreateTodo.ts:286-289 deliberately silent); `<title>` count changes (browser-managed).

### Re-announce technique (Task A) — why nonce is the default

- **Root cause:** `announce: setMessage` (LiveRegion.tsx:21). Same string → React state bail-out → no render; and even forcing a render leaves the text node byte-identical, so no DOM mutation event reaches the AT. Both layers must change for a repeat to fire.
- **Nonce (default):** keep one region; append an alternating invisible suffix (`` zero-width space, toggled per announce, or a keyed remount of the text node). Spoken output unchanged; DOM mutation guaranteed; single-region contract intact; trivially assertable in jsdom (text/key alternation).
- **Clear-then-set (named alternative in the deferred item):** set `''` then the message on a delay. Reliable only with a real timing gap (rAF is NOT enough for some AT; ~50-100 ms setTimeout is typical) — introduces a timer into a primitive that has none, and risks dropping the announcement if a third announce lands inside the window. Choose only if VoiceOver testing shows the nonce being read (it shouldn't be — U+200B has no spoken rendering in NVDA/VoiceOver).
- **Two alternating regions (react-aria's LiveAnnouncer pattern):** most robust across AT but violates the committed contract — "one instance", "Single live region" — and the existing test 'renders exactly one polite status region'. Do not use without a recorded spec amendment.
- The region keeps `role="status"` + explicit `aria-live="polite"` (both, as today — the explicit attribute maximizes AT compat). The primitive stays presentation-only; no data knowledge, no timers if nonce is chosen.

### "Append and rotate" — recorded reconciliation (C3)

The UX primitives table (~line 1192) says "announcements append and rotate"; the implementation replaces the single message (each `announce` overwrites). Replace-semantics satisfies every committed behavior test and the no-storm rule (§2.3: "Pending → confirmed transitions do not generate additional announcements"; anti-pattern: toast storms), at the cost that a very fast successor can supersede a message before AT finishes queueing it — polite regions queue at the AT layer, so in practice each landed confirm is announced. **Decision: keep replace-semantics; document here + assert in C3.** If the D3 VoiceOver run shows burst announcements being swallowed, escalate to Keith before inventing a queue (that would be a spec-level change to the calm posture).

### Decision records (Task F — recorded 2026-07-09 during implementation)

- **F1 — Failed rows and `aria-disabled`:** AC 1's "pending/failed rows use aria-disabled" is read as "never HTML `disabled`". The UX per-variant table (~lines 1233-1241) commits Failed as `aria-disabled=false`: Retry/Dismiss are fully interactive, and the failed row's toggle/delete surfaces simply don't exist (empty checkbox slot, no delete affordance) — there is nothing to mark disabled. Current behavior (documented at the TodoItem failed-variant comment, TodoItem.tsx:155-156) is CORRECT; nothing changed. Pending rows keep `aria-disabled={busy}` on label + Checkbox.
- **F2 — "UX-DR25" is epics.md's inventory label only:** the UX spec has no UX-DR ids. Tests and comments cite the section name "Screen Reader Support — Consolidated Contract" (ux-design-specification.md ~lines 1407-1424) instead — done in the B2 landmark-lock test comment (App.test.tsx) and this story's references.
- **F3 — "Focus never stranded" (AC 4) binds to the built commitments:** aria-disabled-not-disabled focus preservation (Button guarded-click, row keydown bail), delete blur-disarm, the Escape triad, and 3.1's adjacent-row focus-follow + stranded guards (`document.activeElement === document.body` fallbacks). No new mechanism exists or is needed; the smoke script (docs/screen-reader-smoke-test.md steps 4d/4e/7a) is where the chain is verified end-to-end on real AT.
- **C2 addendum — cache-miss bail:** the description snapshot lives in the mutation variables (captured at call time). When the acted-on row is absent from the cache at call time, the action is stale (backend truth already dropped it; reconcile is about to remove it from view) — both hooks now bail instead of firing a mutation whose announcement would render an empty disambiguator (" deleted."). This also prevents a pointless DELETE→404 round-trip announcing an empty string.
- **D3/G3 — VoiceOver leg recorded as PENDING (Keith's decision, 2026-07-09):** the story closes on the scripted artifact + automated evidence (jsdom mechanics + browser-level e2e); the VoiceOver run is recorded against the release candidate alongside the NVDA leg's first run. docs/screen-reader-smoke-test.md carries both "pending" rows.

### Where the pieces live (established stack — reuse, don't reinvent)

| Concern | Owner | 3.2 change |
|---|---|---|
| The polite region + announce handle | `LiveRegion.tsx` primitive (28 lines) | Task A fix INSIDE it. Only file whose runtime behavior changes materially. |
| announce() distribution | `App.tsx:80-82` stable callback → passed into the three mutation hooks | Untouched (C2 adjusts what hooks *pass*, not the channel). |
| Message strings + once-guards | `useCreateTodo.ts` / `useToggleTodo.ts` / `useDeleteTodo.ts` + `App.tsx:19` | C1 quote alignment, C2 description snapshot. Nothing else. |
| `aria-busy` | `usePendingPresentation.ts:120` → `TodoItem.tsx:216` | Verify + cite; no change. |
| `aria-disabled` / guards | `TodoItem.tsx:121, 224, 242`; `Button.tsx:23-33` | Verify + F1 record; no change. |
| `aria-describedby` help text | `App.tsx:25-29, 322-326` → `TodoItem.tsx:162` | Verify; no change. |
| Empty/loading plain text | `EmptyState.tsx` | B3 test only. |
| Landmarks | `App.tsx:269` `<main>`; `AppErrorBoundary.tsx:44` `role="alert"` (crash fallback only) | B2 test + B4 comment. |
| Roving/focus layer | `useRovingTabindex.ts`, TodoItem/TodoList (3.1) | MUST NOT regress; no edits expected. |

### Files being modified (current state → what changes)

- `apps/web/src/components/primitives/LiveRegion.tsx` (UPDATE) — nonce re-announce fix (A1); currently 28 lines, `useState` + `useImperativeHandle`, renders `{message}` into the status div.
- `apps/web/src/components/primitives/LiveRegion.test.tsx` (UPDATE) — A4; existing 4 tests stay green (note: 'replaces the message text on a subsequent announce' asserts *different*-text replacement — extend, don't delete).
- `apps/web/src/hooks/useToggleTodo.ts`, `useDeleteTodo.ts` (UPDATE) — C1 quote style; C2 description snapshot into mutation variables (both hooks currently read the cache at announce time with `''` fallback). Their `.test.tsx` files updated in step.
- `apps/web/src/App.test.tsx`, `EmptyState.test.tsx`, `App.axe.test.tsx` (UPDATE) — B1/B2/B3/B5 locking tests, A4 app-level case.
- `apps/web/src/components/AppErrorBoundary.tsx` (UPDATE, comment only) — B4.
- `docs/screen-reader-smoke-test.md` (NEW) — D1/D2/D3.
- `e2e/tests/ui/screen-reader-contract.spec.ts` (NEW) — E1.
- `_bmad-output/implementation-artifacts/deferred-work.md` (UPDATE) — mark the LiveRegion re-announce item resolved with a pointer here.
- **NOT touched:** `Checkbox.tsx`/`Button.tsx`/`TextInput.tsx`, `usePendingPresentation.ts`, `useCreateTodo.ts` announce logic (its once-guard is committed behavior; only verify), `useRovingTabindex.ts`, `useArmedDelete.ts`, `TodoItem.tsx`/`TodoList.tsx`/`CaptureInput.tsx` runtime behavior, `packages/contracts/*`, `apps/api/*`, CSS (expected zero CSS — visually-hidden idiom already exists in App.module.css).

### Project Structure Notes

- Tests co-located per convention (`src/**/*.test.tsx`); the manual-gate doc goes in `docs/` (project_knowledge per config; no competing SR doc exists anywhere — verified). e2e at repo root under `e2e/tests/ui/`, fixtures from `e2e/support/ui-fixtures.ts`, factory `createTodo()`, tag `@p1`.
- Component layer frozen: the fix is inside the existing primitive; a hook is not needed (no timers if nonce). No new dependencies — `vitest-axe` is already a devDep (imported per-file in App.axe.test.tsx; there is no global test setup file).
- jsdom cannot observe AT output: unit tests assert DOM mechanics (text-node/nonce alternation, attribute presence); the e2e spec asserts region content in a real DOM; ONLY the D-task manual runs verify actual utterances. Don't write jsdom assertions about what a screen reader "says".

### References

- [Source: epics.md#Story 3.2 lines 425-436] — the 4 ACs; epic-3 preamble ("per-control accessibility already shipped… genuinely list-wide and packaging concerns", line 406); note #21 (list-wide a11y only).
- [Source: deferred-work.md line 9; epic-2-retro-2026-07-01.md lines 37, 73, 99] — AC 5's inherited scope: re-announce fix + axe scan + consolidated SR contract owned by 3.2.
- [Source: ux-design-specification.md §2.6 "Live Region Announcements" ~lines 427-445] — the seven committed strings verbatim, politeness rule ("Assertive… reserved for nothing in v1"), verb + minimal-disambiguator extension rule, auditory–visual parity, once-per-failure rule.
- [Source: ux-design-specification.md "Screen Reader Support — Consolidated Contract" ~lines 1407-1424] — the full surface table this story audits (single region, pending semantic, describedby text, armed names, inert rows, list structure, plain-text empty/loading, indicator name, title changes) + the no-extra-landmarks rule ~1424.
- [Source: ux-design-specification.md ~line 688] — CI gate 6: "Manual screen-reader smoke test. NVDA on Windows + VoiceOver on macOS, scripted, before each release. Pending → settled transitions announce correctly; no announcement storm during burst capture." (The spec's entire commitment — the script itself is this story's D1 deliverable.)
- [Source: ux-design-specification.md ~lines 1233-1241] — per-variant aria-busy/aria-disabled table (Failed: busy=false, disabled=false — F1's authority); ~line 999 inert-rows rule; Decision 2 ~line 730 (describedby text verbatim); Decision 5 ~lines 766-768 (armed name + the 5 s floor exists because SR read-time ≈ 4 s); Decision 1 ~line 720 (silent reorder); ~line 1192 (primitive: "append and rotate"); ~line 1050 (delete-404 announces as normal).
- [Source: architecture.md lines 199, 284] — `aria-busy` at t=0 is the only ARIA the architecture doc itself mandates; honest-pending shape. Lines 77/202/424 — frozen component set; primitives are data-ignorant. Line 305 — intentional deviations recorded as amendments.
- [Source: test-design-qa.md NFR3-E2E-002 (P1)] — axe zero critical violations; R-014 WCAG risk row.
- [Source: 3-1-list-wide-keyboard-navigation.md] — the roving/focus layer this story must not regress; e2e parallel-DB `page.route` scoping precedent; live-browser verification precedent.
- Code precedents to mirror: `App.axe.test.tsx` (per-file vitest-axe pattern), `useCreateTodo.ts:97-99` (once-guard shape), `e2e/tests/ui/keyboard-navigation.spec.ts` (fixture usage, route-scoping), `App.test.tsx:883` (region assertion via `getByRole('status')`).

## Previous Story Intelligence (Story 3.1 → 3.2)

- **3.1 is merged to main (PR #21)** with a post-review IME fix (7c0cda6). Web suite is **224 tests / 20 files**; api 49 (Node 24); e2e 5/5. Bundle ratchet baseline is now **92,295 B gz** (+512 B tolerance) after 3.1's pre-authorized rebaseline.
- **Live-browser verification before commit caught a real AC bug in 3.1** (Tab-from-input landed mid-list after incremental creates — a path no seeded-in-one-shot test exercised). The same lesson applies here with more force: jsdom cannot hear announcements. Run the real-AT (VoiceOver) leg BEFORE marking review, not after.
- **e2e parallel-run gotcha:** the harness runs fully parallel against ONE shared e2e DB; 3.1's spec needed a `page.route` filter scoping GET /todos to its own rows. Reuse that pattern in E1 if asserting list-wide state.
- **Focus-follow contracts from 3.1 are this story's "never stranded" substrate:** adjacent-row focus after delete-refetch removal, emptied-list → input, stranded-guard (`activeElement === body`). The smoke script exercises them on real AT; no code changes to them.
- **Test style:** deterministic, injectable clocks (no `vi.useFakeTimers` for app timers), RTL role/name queries, delete queries via enriched names (`/^Delete '/`, `/^Confirm deletion of/`).
- **3.1 changed nothing about announcements** (explicitly out of its scope; focus moves announce natively via the focus event) — the announcement layer is exactly as Epics 1-2 left it.

## Git Intelligence Summary

Recent main history: PR #22 (CLAUDE.md docs), PR #21 (Story 3.1 roving tabindex + IME escape fix), PR #20 (Playwright harness, 2026-07-04 — root config, two projects, ui/api fixtures, 4 sample specs). The delete stack (PRs #16/#17) and the announcement layer beneath this story are stable and green. No dependency changes since the harness landed (`@playwright/test ^1.61.1`, `@faker-js/faker ^10.5.0`, `@seontechnologies/playwright-utils ^4.4.0`). Working from worktree `dev-3-2`; branch from current main (97dc4bd).

## Latest Tech Information

Stack fixed and current (July 2026); **zero new dependencies** expected. Story-relevant specifics:

- **Live-region re-announce is an AT-layer behavior, not a React one**: NVDA/VoiceOver/JAWS announce on DOM *mutation* inside the live region. Identical-text replacement produces no mutation record → silence. The zero-width-space nonce (U+200B) has no spoken rendering in current NVDA (2025.x) and VoiceOver (macOS 15/26) — it is the minimal mutation that re-triggers announcement. Some older AT read "zero width space" for U+200B in *braille/character* navigation only, never in live-region flow.
- **`role="status"` implies `aria-live="polite"` + `aria-atomic="true"`** — keeping the explicit `aria-live` attribute (as today) is the compat-maximizing pattern. Atomic=true means the whole region text is re-read per mutation — another reason replace-semantics (one message at a time) is right.
- **vitest-axe** (already in use): per-file import, `expect.extend`; axe-core can't detect announcement behavior — it checks structure (4.1.2/4.1.3 partially). The B5 states extend structural coverage only.
- **Playwright 1.61**: `page.getByRole('status')` + `toHaveText` polls — good for settled announcements; for transient text during bursts assert sequential states, not concatenation. `interceptNetworkCall` (seon utils) can delay a PATCH to hold `aria-busy` observable.
- **VoiceOver caveat for D3:** Safari + VoiceOver is the canonical pairing; Chromium's VO support is good but announce timing differs — script the run against the browser named in the doc (default: Safari for VO, Chromium+NVDA on Windows) and record it per SM-1 environment capture.

## Project Context Reference

- Config: `_bmad/bmm/config.yaml` — planning artifacts `_bmad-output/planning-artifacts`, implementation artifacts `_bmad-output/implementation-artifacts`, project docs `docs/`.
- No `project-context.md` in the repo — epics.md + ux-design-specification.md + architecture.md + story 3-1 + deferred-work.md are the authoritative context, cited inline above.
- Project memory: **api tests need Node 24** (`nvm use 24` before apps/api tests — better-sqlite3 ABI); **code review is run externally by Keith** — mark review and stop, don't self-review.

## Story Completion Status

Ultimate context engine analysis completed — comprehensive developer guide created. Status: ready-for-dev.

### Open questions / scope confirmations for Keith (non-blocking — sensible defaults chosen)

1. **NVDA leg of the gating smoke test (AC 4).** VoiceOver runs on this machine (D3, in-story). NVDA needs Windows. **Default: the story delivers the scripted artifact + a recorded VoiceOver pass; the first NVDA run is recorded against the release candidate (Story 3.5 timeframe), with the doc marking the NVDA leg "pending first run".** Flag if you have a Windows box/VM and want the NVDA run to block THIS story instead.
2. **Re-announce mechanism = nonce (zero-width suffix alternation)** rather than clear-then-set (timing-flaky, adds a timer to a timerless primitive) or dual regions (violates the committed single-region contract). Dev verifies on VoiceOver in D3 and falls back to clear-then-set only if the nonce is ever audible.
3. **Mutation-failure quote style aligned to single quotes** (C1) — the committed §2.6 copy uses single quotes around the description; today toggle/delete failure uses double. Trivial diff, updates ~3 tests. Flag if the double-quote style was a deliberate choice you want re-committed instead.
4. **One `@p1` SR-contract e2e spec ships in this story** (E1) — same rationale as 3.1's single keyboard spec: real-DOM region behavior can't be trusted to jsdom, and the full suite stays 3.4. Default: include.
5. **"Append and rotate" reconciled to replace-semantics** (C3 note) — the implementation replaces the single region text per announce; the UX primitives table says "append and rotate". Replace satisfies every committed behavioral rule and the calm posture; escalating to a queue would be a spec change. Default: record replace as the standing interpretation.

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5) via Claude Code, 2026-07-08/09.

### Debug Log References

- Web `tsc -b` (build) is stricter than the root typecheck (`noUncheckedIndexedAccess`): three new test-file index accesses needed guards (App.test.tsx, App.axe.test.tsx, LiveRegion.test.tsx). Fixed; both checkers green.
- e2e parallel-run collision found and fixed: BOTH stamp-scoped specs (3.1 keyboard + new 3.2 spec) used `Date.now()`; parallel workers starting in the same millisecond produced identical stamps, defeating both GET-scoping filters (each spec saw 6 rows, expected 3). The 3.2 spec now uses a random token that can never equal or contain an epoch stamp; 3.1's spec is untouched and passes. Full suite run twice consecutively — 6/6 green both times.
- Playwright `toHaveAttribute('aria-busy', 'false')` fails on settle: React removes `aria-busy={false}` from the DOM entirely (attribute absent, not "false"). Assertion is `not.toHaveAttribute('aria-busy', 'true')`.
- Worktree had no local node_modules (module resolution silently walked up to the main checkout); ran `npm install` under Node 24 in the worktree.
- Pre-existing, out-of-scope: one eslint warning (unused eslint-disable directive) in `useRovingTabindex.ts:99` — file untouched by this story, zero errors, exit 0.

### Completion Notes List

- **A (AC 5, 1):** Re-announce fix implemented INSIDE `LiveRegion` with the nonce technique: `announce` now stores `{ message, nonce: !prev.nonce }` and renders an alternating zero-width-space suffix, so identical consecutive announces always mutate the region's text node while spoken output is unchanged. Primitive stays data-ignorant and timerless; callers unchanged. RED→GREEN: 2 new primitive tests (consecutive-identical + 4-in-a-row runs) plus an App-level test deleting two same-named todos and asserting two observable announcement events. The announce-once guards sit above the primitive and are untouched — their suppression tests (useCreateTodo.test.tsx repeated-failure, App.tsx load-failure episode) stay green.
- **B (AC 1, 3):** Contract locked by tests: B1 exactly one `[aria-live]`/`role="status"` (polite, nothing assertive) with populated+pending+failed rows simultaneously rendered; B2 landmark lock (one `<main>`, no nav/aside/header/footer/section, explicit role set exactly {status, list, listitem}); B3 EmptyState variants carry no aria-live/live role (it.each over all three); B4 comment recorded at the `role="alert"` crash fallback in AppErrorBoundary.tsx; B5 axe extended with failed-create-row and armed-delete states (color-contrast off per pattern).
- **C (AC 2):** C1 audit result: 5 of 7 strings verbatim-correct; toggle/delete failure copy aligned from curly double to committed curly single quotes (2 hooks, 3 test assertions). C2: description was already snapshotted into mutation variables at call time; the remaining `?? ''` hole is closed by bailing when the acted-on row is absent from the cache (stale action; prevents a " deleted." empty-disambiguator announcement AND a pointless DELETE→404 round trip) — new test per hook with a cache-evicted row. C3: burst test (3 held-open POSTs released in order) asserts silence-before-confirm and exact region text per confirm — replace-not-queue recorded in Dev Notes. C4: new test asserts initial load announces nothing and Dismiss is byte-identical-silent (not even a nonce mutation); pending→confirmed-once is covered by C3 + existing 1.7/2.3 announce-once tests.
- **D (AC 4):** `docs/screen-reader-smoke-test.md` authored — 7-step scripted loop with exact expected utterances, environment capture (SM-1), pass/fail per step, both named pass criteria, gating standing in the header. Per Keith's decision (2026-07-09): the VoiceOver run is recorded as **pending**, to be performed against the release candidate alongside the NVDA first run; the story closes on the artifact + automated evidence (D3/G3 resolved by decision).
- **E (AC 1, 2, 5):** `e2e/tests/ui/screen-reader-contract.spec.ts` (@p1): single-[aria-live] invariant, create/toggle/delete strings landing in the region, aria-busy held observable through an 800 ms `interceptNetworkCall`-delayed PATCH then cleared, and the identical-consecutive delete producing a second observable region mutation. Self-cleaning (seed fixture + by-description reconcile for the UI-created row).
- **F (AC 1):** Decision records appended to Dev Notes (F1 failed rows correctly `aria-disabled=false`, F2 cite the UX section name not "UX-DR25", F3 focus-never-stranded binds to the built commitments) — no runtime changes.
- **G:** All gates green under Node 24 — web 239/239 (20 files; was 224 baseline, +15), api 49/49, typecheck, eslint (0 errors), lint:css + selftest, contrast (7/7 pairs), build, size 92,358 B gz vs 92,295 B baseline (+63 B, within +512 B tolerance — no rebaseline), e2e 6/6 twice consecutively.

### File List

- apps/web/src/components/primitives/LiveRegion.tsx (modified — nonce re-announce fix)
- apps/web/src/components/primitives/LiveRegion.test.tsx (modified — A4 re-announce tests)
- apps/web/src/App.test.tsx (modified — A4 app-level, B1/B2 locks, C3 burst, C4 silent-cases, C1 assertion)
- apps/web/src/App.axe.test.tsx (modified — B5 failed-create + armed-delete axe states)
- apps/web/src/components/recipes/EmptyState.test.tsx (modified — B3 no-live-semantics lock)
- apps/web/src/components/AppErrorBoundary.tsx (modified — B4 comment only)
- apps/web/src/hooks/useToggleTodo.ts (modified — C1 quote style, C2 cache-miss bail)
- apps/web/src/hooks/useToggleTodo.test.tsx (modified — C1 assertion, C2 test)
- apps/web/src/hooks/useDeleteTodo.ts (modified — C1 quote style, C2 cache-miss bail)
- apps/web/src/hooks/useDeleteTodo.test.tsx (modified — C1 assertion, C2 test)
- docs/screen-reader-smoke-test.md (new — D1/D2 scripted manual gate)
- e2e/tests/ui/screen-reader-contract.spec.ts (new — E1 @p1 spec)
- _bmad-output/implementation-artifacts/deferred-work.md (modified — LiveRegion re-announce item resolved)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — status transitions)
- _bmad-output/implementation-artifacts/3-2-consolidated-screen-reader-contract.md (modified — this file: frontmatter, checkboxes, Dev Notes decision records, Dev Agent Record, Change Log, Status)

## Change Log

- 2026-07-09: Story 3.2 implemented (dev-story). LiveRegion nonce re-announce fix (AC 5); SR-contract audit locked by tests — single-region, landmarks, EmptyState, extended axe states (AC 1, 3); announcement copy audit — quote alignment, cache-miss bail hardening, burst no-storm + silent-cases tests (AC 2); scripted NVDA/VoiceOver smoke-test artifact authored, both AT runs recorded as pending per decision — release-candidate timeframe (AC 4); @p1 SR-contract e2e spec added and stabilized against a parallel-stamp collision. All gates green (web 239, api 49, e2e 6/6 ×2, size +63 B within tolerance). Status → review.
- 2026-07-08: Story 3.2 created (create-story). Scope: consolidated SR-contract audit locked by tests (single polite region invariant, no-extra-landmarks, plain-text empty/loading, extended axe states), the inherited LiveRegion identical-consecutive-message re-announce fix (nonce inside the primitive), announcement-copy audit (quote-style alignment + description-snapshot hardening + burst no-storm assertion), the scripted NVDA/VoiceOver smoke-test artifact in docs/ with an in-story VoiceOver run, and one `@p1` SR-contract e2e spec. Per-control SR behavior from Epics 1-2 is verified, not rebuilt; forced-colors/zoom gates are 3.3; full e2e/CI/WCAG-matrix suite is 3.4. Status → ready-for-dev.
