---
baseline_commit: 215aef2e4424167bcc0cd99a3e99c0f784f0d783
---

<!-- Powered by BMAD-CORE™ -->

# Story 3.3: Responsive, forced-colors & reduced-motion verification

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Primary User on any device or accessibility preference,
I want the app to remain usable and calm across viewport sizes, high-contrast modes, and reduced-motion,
So that the experience holds up regardless of how or where I use it.

## Acceptance Criteria

1. **Given** a viewport < 640px, **When** rendered, **Then** the single column fills the width with 16px padding and all touch targets are ≥48px; **Given** ≥640px, **Then** content is centred in a 640px container with 32px padding, paper extends to the edges, and hover states activate on pointer devices.
2. **Given** any toggle/complete/delete action, **When** it occurs, **Then** nothing reflows — row height is stable per state and pending→settled changes affect color/opacity only.
3. **Given** forced-colors mode, **When** active, **Then** the focus ring (via `outline`) survives, completion cues (strikethrough + checkbox) survive, and the delete armed-state reads via its label change.
4. **Given** `prefers-contrast: more`, **When** active, **Then** `--color-on-surface-muted` resolves to full contrast (pending then rests on `aria-busy`).
5. **Given** `prefers-reduced-motion: reduce`, **When** active, **Then** all motion tokens except `--motion-none` collapse to 0ms and the pending-cue minimum-hold collapses to zero, while the 5s delete auto-revert and 300ms no-commit safety windows are unchanged.
6. **Given** CI, **When** it runs, **Then** Playwright forced-colors, reduced-motion, and 200%-zoom (1280×800, no horizontal scroll) emulation gates pass. *(Scope note: this story delivers the gate SPECS, green under `npm run test:e2e`; the CI `e2e` job that invokes them is owned by Story 3.4 per the epic-2 retro handoff — see Dev Notes "CI-wiring seam" and Open Question 2.)* [Source: deferred-work.md line 7; sprint-status.yaml 2026-07-04 note; .github/workflows/ci.yml:8-13 header comment]

*Ownership note: this is a VERIFICATION story. Nearly all of ACs 1–4 is already implemented and shipped with its owning story (breakpoint/padding in 1.6, touch targets in 1.4/1.5, hover gating + armed-label fallback in 2.2/2.3, `prefers-contrast` + reduced-motion token collapse in 1.3's tokens). This story verifies, locks with browser-level gates, and closes exactly ONE runtime gap: the reduced-motion pending-minimum-hold collapse (AC 5). It does not rebuild anything.*

### What is already built and COMPLIES (verify + lock with gates — do NOT rebuild)

- **640px breakpoint + padding (AC 1)** — `App.module.css:15-26`: `.column { max-width: 40rem; margin-inline: auto; padding-inline: var(--space-4) }` (16px mobile), `@media (width >= 40rem) { padding-inline: var(--space-6) }` (32px desktop). Breakpoint is `40rem` not `640px` — the token lint forbids raw px in media queries (comment at App.module.css:7-9). Paper-to-the-edges: `.app { width: 100% }` with `--color-surface` on the page, content centred in `.column`.
- **≥48px touch targets (AC 1)** — `--row-height-touch: 48px` (tokens.css:68) consumed as `min-height` by TodoItem.module.css:9, Button.module.css:5, TextInput.module.css:2.
- **Hover states pointer-only (AC 1)** — the single `@media (hover: hover)` block (TodoItem.module.css:183-203) owns delete reveal-on-hover AND `.item:hover { background: var(--color-surface-hover) }`. Touch devices: delete always visible, no hover styles.
- **Row-height stability (AC 2)** — `min-height: var(--row-height-touch)` + 2-line `-webkit-line-clamp` (TodoItem.module.css:9, 22-34); failed variant inherits the same min-height (comment :92-96); `.slot` reserves the checkbox footprint on failed rows (:103-107); `.delete::after { content: "Confirm"; visibility: hidden; height: 0 }` (:163-169) pre-reserves the wider armed label's width so idle→armed cannot change geometry. Every transition in the app touches ONLY `color`, `background-color`, `border-color`, `opacity`, or the EmptyState `grid-template-rows` fade (full inventory table in Dev Notes).
- **Forced-colors survivals (AC 3)** — focus ring is `outline: 2px solid var(--color-focus); outline-offset: 2px` on `:focus-visible` (global.css:45-48) — `outline` survives forced-colors by design. Checkbox has an explicit `@media (forced-colors: active)` block using `Highlight`/`Canvas`/`CanvasText` system colors (Checkbox.module.css:86-97) and the check glyph is a foreground `::before` "✓", not background-only (:38-60). Strikethrough is plain `text-decoration: line-through` (TodoItem.module.css:55) — color-independent. Armed-delete signal is the visible label flip `Delete`→`Confirm` + `aria-pressed` + accessible-name change (TodoItem.tsx:279-311), already locked by a jsdom test (TodoItem.test.tsx:527-540 "the armed cue is the visible label change").
- **`prefers-contrast: more` (AC 4)** — tokens.css:88-98 already redefines `--color-on-surface-muted: var(--color-on-surface)` and `--color-pending: var(--color-on-surface)`. Implemented; has NO test at any level — this story adds the browser-level lock.
- **Reduced-motion token collapse (AC 5, first half)** — tokens.css:108-113 collapses `--motion-instant` and `--motion-settle` to `0ms` under `prefers-reduced-motion: reduce`; `--motion-none` untouched. Single global collapse; no component defines its own reduced-motion query (verified by grep — keep it that way).
- **Safety windows unchanged under reduced-motion (AC 5, last clause)** — `useArmedDelete.ts:20-23` documents and implements exactly this: the 300ms (`DELETE_NO_COMMIT_WINDOW_MS`, :33) and 5s (`DELETE_AUTO_REVERT_MS`, :37) JS timers run on the injectable clock and are deliberately NOT reduced-motion-sensitive. Verify + cite; no change.
- **Playwright harness (AC 6 substrate)** — root `playwright.config.ts` with `api` + `chromium` projects, webServer attach (`reuseExistingServer: !CI`, `DATABASE_PATH=./data/e2e.db`), ui-fixtures (`seedTodos` self-cleaning fixture, `interceptNetworkCall`), todo-factory, 4 spec files / 6 tests green. Commented-out project stubs for `reduced-motion` and `forced-colors` already sit at playwright.config.ts:54-59 as extension points.

### The gaps this story closes (the actual work)

1. **AC 5 runtime gap — pending minimum-hold does not collapse.** `usePendingPresentation.ts` hardcodes `PENDING_MIN_HOLD_MS = 500` (:29) and never consults `prefers-reduced-motion` (repo-wide grep: zero `matchMedia` references in `apps/web/src`). Under reduced motion today the *fade* is instant (CSS token collapse) but a fast-confirming mutation still holds the pending visual for up to 500ms — motion-derived timing the spec says must collapse to zero. This is the story's ONLY app-code behavior change.
2. **AC 6 — zero Playwright emulation coverage.** No spec anywhere uses `page.emulateMedia`, `page.setViewportSize`, or project-level `forcedColors`/`reducedMotion` options. The 200%-zoom gate has no stub at all. All three gates are net-new specs.
3. **ACs 1/2/4 have no browser-level locks** — implemented in CSS but unverifiable in jsdom (jsdom doesn't evaluate media queries or layout). The viewport/reflow/contrast assertions can only live in the Playwright layer.

### Explicitly OUT of scope (do NOT build here)

- **The CI `e2e` job itself, @p0/@p1 coverage thresholds, full WCAG-matrix gate mapping, contrast-matrix rework, absolute bundle budget, k6, slow-3G TTI** → Story 3.4. This story's specs must be green via `npm run test:e2e` locally; wiring them into `.github/workflows/ci.yml` is 3.4's "expanded CI quality gates" (the ci.yml header comment at lines 8-13 already records this deferral). [Source: deferred-work.md lines 7-8, 13]
- **Hardened static-serving headers, container/durability verification** → Story 3.5.
- **NVDA/VoiceOver recorded runs** → release-candidate gates per Keith's 3.2 decision (docs/screen-reader-smoke-test.md carries both pending rows). Nothing here touches that.
- **Dark mode** (`prefers-color-scheme: dark`) — explicitly out of MVP scope; do not add a media block for it. [Source: ux-design-specification.md ~line 675]
- **New components, new dependencies, CSS restructuring** — component layer is frozen (4 primitives + 8 recipes). The AC 5 fix happens INSIDE the existing `usePendingPresentation` hook. Zero new npm packages: Playwright 1.61 already supports every emulation this story needs (`forcedColors` v1.15+, `reducedMotion` v1.12+, `contrast` v1.51+).
- **Whole-suite re-runs under emulation projects** — do NOT wire the existing 4 ui specs to run under new emulation projects (4× suite duplication). See Dev Notes "Gate shape decision" — default is per-test emulation in dedicated spec files.

## Tasks / Subtasks

- [x] **A. Reduced-motion pending minimum-hold collapse (AC 5) — the one runtime change**
  - [x] A1. In `apps/web/src/hooks/usePendingPresentation.ts`, collapse the minimum-hold to zero when `prefers-reduced-motion: reduce` matches. The FLICKER threshold (150ms) is NOT motion — it is the anti-flicker promise (a submit confirming <150ms never paints pending) and stays unchanged under reduced motion. Only `PENDING_MIN_HOLD_MS` collapses. [Source: ux-design-specification.md ~line 672 — "The pending-cue minimum hold duration also collapses to zero (settled state appears immediately on confirm)"; the flicker threshold appears nowhere in the reduced-motion commitments]
  - [x] A2. Design constraints: keep the hook clock-injectable and deterministic (no `vi.useFakeTimers` — inject the existing `PendingClock` seam); make the reduced-motion read injectable/mockable too (e.g. an optional `prefersReducedMotion: () => boolean` param or a tiny exported helper module defaulting to a jsdom-safe `matchMedia` read — `window.matchMedia` is UNDEFINED in jsdom, so the default must guard: `typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false`). No context/provider plumbing — App.tsx and TodoList.tsx call these hooks with default params in production and that must not change (TodoList.tsx:76-81 comment).
  - [x] A3. Decide + document (Dev Notes decision record): read-once-per-mount vs live `change` listener. Default: read at hook init per mount — a mid-session OS toggle applies from the next mutation; a live listener is extra machinery for a vanishingly rare event. Record whichever is chosen.
  - [x] A4. Unit tests (usePendingPresentation.test.ts / TodoItem-level where cheaper): with reduced-motion mocked true — a confirm arriving after the flicker threshold settles immediately (no 500ms hold); the flicker threshold still suppresses a <150ms confirm (anti-flicker survives); with reduced-motion false — existing hold behavior byte-identical (all existing tests stay green untouched). There is NO matchMedia mock precedent in this repo (setup.ts registers none) — mock via the injectable seam, not by polyfilling global matchMedia.
  - [x] A5. Confirm `useArmedDelete` timers untouched: cite its existing tests + the :20-23 comment in the story completion notes; do not add reduced-motion awareness there.
- [x] **B. Playwright forced-colors gate (AC 3, 6)**
  - [x] B1. New spec `e2e/tests/ui/a11y-modes.spec.ts` (or split into three files if cleaner — dev's call, record it), tagged `@p1`, importing from `e2e/support/ui-fixtures.ts` (`test`, `expect`, `seedTodos`) + `createTodo` factory. Forced-colors tests call `page.emulateMedia({ forcedColors: 'active' })` (Chromium supports emulation; the suite's only browser project is chromium — no cross-browser concern).
  - [x] B2. Assertions per the committed gate ("Focus ring visible; all interactive elements visibly bordered"): (a) keyboard-focus the capture input and a row anchor → `getComputedStyle(...).outlineStyle !== 'none'` and `outlineWidth !== '0px'` on the focused element; (b) seed one completed todo → its text has `text-decoration-line: line-through` and the checkbox indicator's `::before` check glyph is present (evaluate `getComputedStyle(el, '::before').content`); (c) arm a delete → the affordance's visible text is `Confirm` and `aria-pressed="true"` (the label IS the forced-colors signal — asserting the `--color-error` color here would be wrong, forced-colors overrides it). [Source: ux-design-specification.md ~line 771 — "the armed-state signal is carried entirely by the text label change… Do not add a fallback icon"]
  - [x] B3. Data isolation: use the `seedTodos` fixture (self-cleaning) and scope list assertions to seeded descriptions — follow the 3.2 spec's random-token description precedent (NOT `Date.now()` stamps; that collided across parallel workers — see 3-2 Debug Log). The suite runs fully parallel against ONE shared e2e DB.
- [x] **C. Playwright reduced-motion gate (AC 5, 6)**
  - [x] C1. Same spec file/family, `page.emulateMedia({ reducedMotion: 'reduce' })`. Assert the token collapse where it lands: `getComputedStyle` on a transitioning element (e.g. a row's `.description`, the delete affordance) shows `transition-duration: 0s`; `--motion-none`-based behavior unaffected.
  - [x] C2. Assert safety windows unchanged (the AC's last clause) at the cheapest browser-observable level: arm a delete under reduced-motion → a second click within ~300ms does NOT commit (row still present), and the affordance is still armed well before 5s (e.g. at ~1s still shows `Confirm`). Do NOT write a wall-clock 5s-wait assertion for the auto-revert itself — that exact race is already deterministically unit-tested against the injectable clock (2.3's suite); here only assert the window is not instant. Keep e2e time cheap.
  - [x] C3. The A-task min-hold collapse is unit-tested (A4), not e2e-tested — observing a sub-500ms hold difference in a live browser is inherently flaky. Do not attempt.
- [x] **D. Playwright 200%-zoom gate (AC 6) + responsive/reflow locks (AC 1, 2)**
  - [x] D1. 200% zoom on 1280×800: Playwright has NO native browser-zoom API — emulate by `page.setViewportSize({ width: 640, height: 400 })` (1280×800 CSS px at 200% zoom ≡ 640×400 CSS px layout viewport; this is the standard WCAG 1.4.4/1.4.10 testing equivalence). Assert: no horizontal scroll (`document.documentElement.scrollWidth <= document.documentElement.clientWidth`) with a seeded list including one 200-char description (worst case for overflow); capture input, a row toggle, and the delete affordance all still visible + clickable.
  - [x] D2. Responsive lock, mobile: viewport 320×568 (NFR-4 floor) → no horizontal scroll, `.column` computed `padding-inline` is 16px, a row's bounding-box height ≥48. Desktop: viewport 1280×800 → `.column` width caps at 640 CSS px, `padding-inline` 32px, body background (`--color-surface`) paints edge-to-edge (paper-to-the-edges).
  - [x] D3. Reflow lock (AC 2): with a seeded list, record a row's `boundingBox()` → toggle it complete → assert the boundingBox (x, y, width, height) is unchanged after the mutation settles and NO sibling row moved. Repeat for arm-delete (idle→armed geometry identical — the `::after` width reservation makes this pass). Pending→settled color-only is already guaranteed by the transition inventory (Dev Notes) + unit tests; the geometry assertion is the e2e-observable half.
- [x] **E. Playwright `prefers-contrast: more` lock (AC 4)**
  - [x] E1. `page.emulateMedia({ contrast: 'more' })` (Playwright ≥1.51; repo has 1.61) → seed one completed todo → its muted text computes to the full-contrast color: assert `getComputedStyle(descriptionEl).color` equals the computed `--color-on-surface` value (compare against a live active row's color rather than hardcoding an rgb literal — no literal colors anywhere, even in tests, per the lint's spirit).
  - [x] E2. AC 4's "pending then rests on aria-busy" — already locked by 3.2's aria-busy tests + the tokens.css `--color-pending` collapse; cite, don't re-test.
- [x] **F. Config + docs seam (AC 6)**
  - [x] F1. Resolve the playwright.config.ts commented stubs (lines 54-59): with the per-test-emulation default (see Dev Notes "Gate shape decision"), DELETE the stale stubs and leave a one-line comment pointing at the a11y-modes spec(s); if Keith opts for projects instead (Open Question 1), implement `testMatch`-scoped projects so ONLY the emulation specs run under them — never the whole ui suite ×4.
  - [x] F2. Do NOT touch `.github/workflows/ci.yml` (3.4 owns the e2e job; the header comment lines 8-13 stays accurate). Update `deferred-work.md`: mark the "prerequisite for Story 3.3" clause of the harness item as satisfied-and-consumed (gates authored here; CI invocation still 3.4).
- [x] **G. Full-gate verification (all ACs)**
  - [x] G1. `npm run test --workspace apps/web` (web baseline 239 tests / 20 files — all green + new A4 tests), `npm test` for apps/api under **Node 24** (`nvm use 24`; 49 tests), `npm run typecheck`, eslint, `lint:css` + `lint:css:selftest`, `contrast:check` (7/7 pairs), `build`, `size:check` (baseline 92,295 B gz + 512 B tolerance; 3.2 landed at 92,358 B so ~449 B headroom remains — the A-task matchMedia read is tens of bytes; if legitimately over, rebaseline per convention and say so).
  - [x] G2. `npm run test:e2e` — existing 6 tests + all new emulation specs, green **twice consecutively** (the 3.1/3.2 flake-hunting convention; parallel workers + shared DB). Locally the harness attaches to a running `npm run dev` (`reuseExistingServer`), `DATABASE_PATH=./data/e2e.db`.
  - [x] G3. Live-browser sanity pass (the 3.1 lesson — do this BEFORE marking review): macOS actually supports checking two of the three modes interactively — System Settings → Accessibility → Display → "Reduce motion" and "Increase contrast" — plus real browser zoom at 200%. Chrome DevTools Rendering tab can force `forced-colors: active` + `prefers-reduced-motion` + `prefers-contrast`. Spot-check each gate's subject matter by eye once; the specs are the repeatable gate, the eyeball run catches what the assertions didn't think to ask.

### Review Findings

- [x] [Review][Patch] Add a pointer-hover browser gate for the row hover treatment and delete reveal required by AC 1 [e2e/tests/ui/a11y-modes.spec.ts:266]
- [x] [Review][Patch] Assert visible forced-colors borders for the capture input, checkbox indicator, and delete affordance as required by the committed gate [e2e/tests/ui/a11y-modes.spec.ts:72]
- [x] [Review][Patch] Cover both timed motion tokens and confirm `--motion-none` remains zero; the current reduced-motion assertions sample only `--motion-settle` consumers [e2e/tests/ui/a11y-modes.spec.ts:148]
- [x] [Review][Patch] Measure the always-visible mobile delete affordance so the 48px gate covers all touch targets [e2e/tests/ui/a11y-modes.spec.ts:255]
- [x] [Review][Patch] Exercise the capture input at the 200%-zoom equivalent viewport instead of checking visibility alone [e2e/tests/ui/a11y-modes.spec.ts:220]
- [x] [Review][Patch] Remove the wall-clock delay from the inside-300ms delete assertion so event-loop stalls cannot turn the safety-window gate into a commit [e2e/tests/ui/a11y-modes.spec.ts:179]
- [x] [Review][Patch] Compare the edge background with the live surface token; non-transparency alone does not lock paper-to-the-edges continuity [e2e/tests/ui/a11y-modes.spec.ts:287]

## Dev Notes

### Transition inventory (verified 2026-07-13) — the AC 2 "color/opacity only" evidence base

Every `transition` in `apps/web/src/**/*.css` (there are NO `@keyframes` anywhere):

| File:line | Element | Properties | Token |
|---|---|---|---|
| App.module.css:42-44 | EmptyState instruction-line collapse | `grid-template-rows`, `opacity` | `--motion-settle` |
| Checkbox.module.css:33-35 | indicator | `background-color`, `border-color` | `--motion-instant` |
| TodoItem.module.css:80 | `.item:not(.pending) .description` (settle-back) | `color` | `--motion-settle` |
| TodoItem.module.css:156 | `.delete` | `color` | `--motion-settle` |
| TodoItem.module.css:186-188 | `.delete` (hover-reveal, inside `@media (hover: hover)`) | `color`, `opacity` | `--motion-settle` |
| TodoItem.module.css:215 | `.committing` | `opacity` | `--motion-settle` |
| Button.module.css:15-18 | button | `background-color`, `border-color`, `color` | `--motion-instant` |
| TextInput.module.css:14-16 | input | `border-color`, `background-color` | `--motion-instant` |

The one non-color/opacity property is the EmptyState `grid-template-rows` collapse — it is the committed instruction-line disappearance treatment and is explicitly permitted by the UX layout-stability rule ("the instruction line fades out via `--motion-settle` opacity transition, then its container collapses with the same duration; reduced-motion collapses to instant"). It transitions once ever, is not triggered by toggle/complete/delete, and collapses to 0ms under reduced motion via the token. Do not "fix" it. [Source: ux-design-specification.md ~line 603]

Pending ONSET is deliberately transition-free (comment TodoItem.module.css:74-77 — instant, honest, never animated); only the settle-back fades. Preserve this asymmetry.

### AC 5 semantics — what collapses and what doesn't (the exact line)

| Timing | Value | Under `prefers-reduced-motion: reduce` | Why |
|---|---|---|---|
| Flicker threshold | 150ms (`FLICKER_THRESHOLD_MS`, usePendingPresentation.ts:25) | **UNCHANGED** | Anti-flicker promise, not motion — a fast confirm never paints pending at all. Collapsing it would ADD flicker for reduced-motion users. |
| Pending minimum-hold | 500ms (`PENDING_MIN_HOLD_MS`, :29) | **→ 0** (this story's A-task) | Motion-derived hold ("cannot flash-and-vanish" is a motion-comfort rule); spec: "settled state appears immediately on confirm". |
| CSS `--motion-instant`/`--motion-settle` | 120ms/220ms | **→ 0ms** (already done, tokens.css:108-113) | Motion tokens. |
| `--motion-none` | 0ms | untouched | Already zero; the honest-pending swap. |
| Delete no-commit window | 300ms (`DELETE_NO_COMMIT_WINDOW_MS`, useArmedDelete.ts:33) | **UNCHANGED** | Muscle-memory safety window, not motion. |
| Delete auto-revert | 5s (`DELETE_AUTO_REVERT_MS`, :37) | **UNCHANGED** | SR-read-time safety window (the 5s floor exists because a screen reader takes ~4s to read the armed announcement). |
| 10s pending timeout | wall-clock deadline (1.9) | UNCHANGED | Failure detection, not motion. |

[Source: ux-design-specification.md "Reduced Motion" ~lines 1436-1444 + ~line 672 + ~line 768; useArmedDelete.ts:20-23 design comment]

### Gate shape decision — per-test emulation, not per-project re-runs (default; Open Question 1)

Two ways to run emulation gates in this harness:

- **(chosen default) Per-test emulation inside the existing `chromium` project**: `page.emulateMedia({ forcedColors: 'active' | reducedMotion: 'reduce' | contrast: 'more' })` + `page.setViewportSize(...)` in dedicated spec file(s). Targeted assertions, zero config change, no suite duplication, all gates visible in one place. This matches the UX gate wording, which names *specific assertions* ("Focus ring visible; all interactive elements visibly bordered"), not whole-suite re-runs.
- **(alternative) Dedicated Playwright projects** (the commented stubs at playwright.config.ts:54-59): would re-run every matched spec under emulation. Only correct if `testMatch`-scoped to the emulation specs themselves — at which point it's the same specs with extra config. Broader whole-suite-under-emulation runs are a 3.4-scale decision (it owns the CI gate suite), not this story's.

Whichever shape ships, delete or activate the stubs — don't leave stale commented config lying.

Playwright API facts (repo has `@playwright/test ^1.61.1`): `page.emulateMedia` supports `colorScheme` (v1.9+), `reducedMotion` (v1.12+), `forcedColors` (v1.15+), `contrast` (v1.51+). All work in Chromium — the only browser project in this suite. Values reset with `null`. [Source: playwright.dev/docs/api/class-page#page-emulate-media, verified 2026-07-13]

### 200%-zoom emulation — the viewport-halving equivalence (Open Question 3)

Playwright cannot drive real browser zoom (Ctrl/Cmd-+). Browser zoom scales CSS pixels, which is layout-equivalent to shrinking the viewport: **200% zoom on a 1280×800 window ≡ a 640×400 CSS-px viewport**. `page.setViewportSize({ width: 640, height: 400 })` is the standard WCAG 1.4.4 testing approach and is deterministic. (`deviceScaleFactor` is the wrong knob — it changes DPR, not layout.) The related-but-distinct WCAG 1.4.10 reflow criterion (320 CSS px) is covered by the D2 mobile-floor assertion at 320×568. If a future reviewer wants "real" zoom, CDP `Page.setPageScaleFactor` emulates pinch-zoom, not browser zoom — don't swap it in.

### CI-wiring seam (Open Question 2)

AC 6 as written in epics.md says "Given CI". The recorded project history splits that: the epic-2 retro + deferred-work.md assign the "single CI `e2e` job" to Story 3.4, and name the harness "prerequisite for Story 3.3 (browser forced-colors/reduced-motion gates)" — i.e. 3.3 AUTHORS the gates, 3.4 WIRES them into CI alongside the rest of the expanded gate suite. The ci.yml header comment (lines 8-13) already records the deferral. This story is done when the emulation specs are green under `npm run test:e2e`; do not add a CI job here (it would land 3.4's work piecemeal and complicate its "gate suite blocks merge" AC). [Source: deferred-work.md lines 7-8; epic-2 retro carry-forward; sprint-status.yaml 2026-07-04 log line]

### Where the pieces live (established stack — reuse, don't reinvent)

| Concern | Owner | 3.3 change |
|---|---|---|
| Motion tokens + reduced-motion collapse | `tokens.css:76-79, 108-113` | Verify via e2e; no change |
| `prefers-contrast: more` | `tokens.css:88-98` | Verify via e2e; no change |
| Breakpoint/padding/column | `App.module.css:7-26` | Verify via e2e; no change |
| Row geometry stability | `TodoItem.module.css:9, 22-34, 92-107, 163-169` | Verify via e2e; no change |
| Checkbox forced-colors | `Checkbox.module.css:86-97` (system colors, lint-escaped) | Verify via e2e; no change |
| Focus ring | `global.css:45-48` (+ Checkbox.module.css:68-71 indicator ring) | Verify via e2e; no change |
| Pending hold/flicker timing | `usePendingPresentation.ts` (`PendingClock` seam :34-45) | **A-task: min-hold collapses under reduced motion — the only runtime edit** |
| Delete safety timers | `useArmedDelete.ts` (same clock seam) | None (assert unchanged) |
| e2e fixtures/factory | `e2e/support/ui-fixtures.ts` (`seedTodos`), `todo-factory.ts` | Consume as-is |
| Playwright config | `playwright.config.ts` (stubs :54-59) | F1: resolve stubs |
| CI | `.github/workflows/ci.yml` | **None** (3.4) |

### Files being modified (current state → what changes)

- `apps/web/src/hooks/usePendingPresentation.ts` (UPDATE) — currently: `FLICKER_THRESHOLD_MS = 150`, `PENDING_MIN_HOLD_MS = 500`, injectable `PendingClock`, no media-query awareness. Change: reduced-motion-aware min-hold (A1-A3), jsdom-safe default read, injectable for tests.
- `apps/web/src/hooks/usePendingPresentation.test.ts` (UPDATE) — A4 cases; every existing case stays green unmodified.
- `e2e/tests/ui/a11y-modes.spec.ts` (NEW; or a small family — dev's call, record it) — B/C/D/E gates, tagged `@p1`, ui-fixtures + factory, random-token descriptions.
- `playwright.config.ts` (UPDATE) — F1 stub resolution only.
- `_bmad-output/implementation-artifacts/deferred-work.md` (UPDATE) — F2 note.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE) — status transitions.
- **NOT touched:** all CSS files (zero CSS changes expected — the CSS side of every AC already exists), `useArmedDelete.ts`, `TodoItem.tsx`/`TodoList.tsx`/`App.tsx`, all primitives, `apps/api/*`, `packages/contracts/*`, `.github/workflows/ci.yml`, `docs/screen-reader-smoke-test.md`.
- If ANY CSS gap is discovered while writing the gates (e.g. a forced-colors edge the specs surface), fix it in the owning module file with tokens/system-colors per the established lint-escape pattern (Checkbox.module.css:87, 93 precedent) and record it in completion notes — but expect none.

### Project Structure Notes

- e2e specs live at repo root `e2e/tests/ui/` (NOT `apps/web/e2e/` — the architecture doc's tree predates the PR #20 harness; CLAUDE.md + the 3.1/3.2 specs are the current authority). Import `test`/`expect` from `e2e/support/ui-fixtures.ts`; test data from `e2e/support/factories/todo-factory.ts`; tag `@p1` (these are gates, not the core-loop smoke — `@p0` is reserved for the capture/complete/delete loop).
- Unit tests co-located (`src/**/*.test.ts(x)`). No global matchMedia polyfill exists in `apps/web/src/test/setup.ts` — don't add one; mock through the hook's injectable seam (keeps jsdom honest about what it can't do, per the 3.2 lesson "don't write jsdom assertions about what a screen reader says" — same applies to media queries).
- The suite runs `fullyParallel` against one shared e2e DB (`./data/e2e.db`): seed via `seedTodos` (self-cleaning), scope by unique random-token descriptions, never `Date.now()` stamps (3.2 collision precedent).
- Node 24 required for apps/api tests (better-sqlite3 ABI) — `nvm use 24`.

### References

- [Source: epics.md#Story 3.3 lines 438-451] — the 6 ACs verbatim; epic-3 preamble line 406 ("genuinely list-wide and packaging concerns"); notes #14 (Epic 3 broadens gates: forced-colors, reduced-motion, 200%-zoom) and #21 (list-wide only; per-control a11y shipped with its control).
- [Source: ux-design-specification.md "Breakpoint Strategy" ~lines 1346-1357] — the two-row viewport table (16px/32px padding, hover on pointer, no tablet breakpoint); "Touch and Pointer Affordances" ~1359-1365 (touch always-visible delete, `(hover: hover)` posture, hybrid devices).
- [Source: ux-design-specification.md "Forced-Colors and Higher-Contrast Modes" ~lines 1426-1434] — the consolidated AC 3/4 commitments; ~line 771 (armed-state = label change only, no fallback icon); ~line 494 (prefers-contrast collapses the pending visual onto aria-busy).
- [Source: ux-design-specification.md "Reduced Motion" ~lines 1436-1444] — the AC 5 clause set, incl. both safety windows unchanged; ~line 672 (min-hold collapses to zero); ~line 768 (WHY 5s is SR-read-time, not motion).
- [Source: ux-design-specification.md "CI Test Gates" ~lines 679-698] — gates 3/4/5 verbatim: forced-colors ("Focus ring visible; all interactive elements visibly bordered"), reduced-motion ("No transitions execute; state changes are instant; non-color cues present"), 200% zoom ("1280×800… No horizontal scroll; all interactive targets remain tappable"). Gate 5 maps to WCAG 1.4.4.
- [Source: ux-design-specification.md "Spacing & Layout Foundation" ~lines 561-605] — layout-stability rules (nothing reflows, fixed per-state row height, pending affects color only, instruction-line + state-line reservations); "WCAG Conformance Statement" ~1446-1466 (1.4.4 / 1.4.10 / 2.5.5 verification lines this story's gates make real).
- [Source: architecture.md lines 39-40] — NFR-3 WCAG 2.2 AA / NFR-4 320px–desktop single 640px breakpoint; line 305 (intentional deviations recorded as amendments); frozen component set lines 77, 202.
- [Source: deferred-work.md lines 6-8, 13] — harness delivered (PR #20), prerequisite-for-3.3 satisfied; CI e2e job + coverage thresholds + absolute bundle budget = 3.4.
- [Source: 3-2-consolidated-screen-reader-contract.md Dev Agent Record] — current green baseline (web 239 / api 49 / e2e 6), bundle 92,358 B of 92,295+512 budget, parallel-stamp collision fix, `not.toHaveAttribute('aria-busy', 'true')` React-attribute-removal gotcha.
- Code precedents to mirror: `e2e/tests/ui/keyboard-navigation.spec.ts` + `screen-reader-contract.spec.ts` (fixture usage, seeding, tagging, parallel-safe scoping); `Checkbox.module.css:86-97` (forced-colors system-color + stylelint-escape pattern); `usePendingPresentation.test.ts` (fake-`PendingClock` style).
- [Source: playwright.dev/docs/api/class-page#page-emulate-media, checked 2026-07-13] — `emulateMedia` option/version matrix quoted in Dev Notes.

## Previous Story Intelligence (Story 3.2 → 3.3)

- **3.2 merged to main (PR #23)** with review patches: LiveRegion nonce is now a monotonic sequence (not boolean); toggle/delete receive the rendered row description from TodoList and bail rather than silently no-op on cache miss. Web suite **239 tests / 20 files**, api 49, e2e **6/6 (4 spec files)**, bundle **92,358 B gz** against the 92,295 + 512 budget (~449 B headroom — no rebaseline occurred in 3.2).
- **The recurring 3.1/3.2 lesson, now load-bearing:** jsdom cannot observe the thing this story verifies (media queries, layout, computed styles) any more than it could hear announcements. Assert DOM mechanics in unit tests (via the injectable seam), real rendering in Playwright, and eyeball once in a live browser BEFORE marking review (3.1's live-browser pass caught a real AC bug no test saw).
- **e2e parallel-run discipline:** fully parallel workers, one shared DB. 3.2's spec collided with 3.1's on `Date.now()` description stamps (same-millisecond workers) — fixed with a random token. Every new spec: unique random-token descriptions + `seedTodos` self-cleaning.
- **React attribute-removal gotcha:** asserting an attribute is *gone* needs `not.toHaveAttribute('attr', 'true')` — React removes false-y ARIA attributes entirely (never `="false"`).
- **Worktree gotcha:** a fresh worktree has no `node_modules` — module resolution silently walks up to the main checkout. Run `npm install` (under Node 24) in the worktree before anything.
- **Web `tsc -b` build is stricter than root typecheck** (`noUncheckedIndexedAccess`) — new test files with index accesses need guards; run `build` not just `typecheck` before declaring green.
- **Deterministic clocks, not fake timers:** the codebase convention is injecting `PendingClock`, never `vi.useFakeTimers` for app timers. A4 extends that seam; don't introduce a second timing idiom.

## Git Intelligence Summary

Recent main: PR #23 (3.2 SR contract — LiveRegion nonce, hook description-plumbing, SR e2e spec), PR #22 (CLAUDE.md), PR #21 (3.1 roving tabindex + IME fix), PR #20 (Playwright harness — root config, api/chromium projects, seon-utils fixtures). No dependency changes since the harness (`@playwright/test ^1.61.1`, `@faker-js/faker ^10.5.0`, `@seontechnologies/playwright-utils ^4.4.0`). Working from worktree `dev-3-3`, branched at current main (215aef2). The last three stories all followed: feature branch → story-file commit → implementation commit → review-fix commit → squash-merge PR.

## Latest Tech Information

Stack fixed and current (July 2026); **zero new dependencies**. Story-relevant specifics:

- **`page.emulateMedia()` option matrix** (verified against playwright.dev 2026-07-13): `media` (screen/print), `colorScheme` (v1.9), `reducedMotion` (v1.12), `forcedColors` (v1.15), `contrast` (v1.51 — `'no-preference' | 'more'`). Repo's 1.61 has all of them. Same names work as context/`use` options for project-level emulation if Open Question 1 flips.
- **Chromium forced-colors emulation** flattens author backgrounds and applies system colors exactly as Windows High Contrast does for CSS purposes — good enough for the gate; it does not replicate every Windows-specific palette, which is why the checkbox CSS uses semantic system keywords (`Highlight`/`Canvas`/`CanvasText`) rather than palette assumptions.
- **`getComputedStyle` pseudo-element reads in Playwright** go through `page.evaluate` / `locator.evaluate((el) => getComputedStyle(el, '::before').content)` — there is no locator-native pseudo-element API.
- **Browser zoom ≠ pinch zoom ≠ DPR:** browser zoom rescales CSS px (viewport-halving equivalence, D1); CDP `Page.setPageScaleFactor` is pinch-zoom (visual viewport only — text does NOT reflow); `deviceScaleFactor` is DPR (rendering density, zero layout effect). Only the first is what WCAG 1.4.4 means.
- **jsdom still has no `matchMedia`** (and no layout at all) — the A-task default read must feature-detect, and no unit test should assert breakpoint/forced-colors/zoom behavior.

## Project Context Reference

- Config: `_bmad/bmm/config.yaml` — planning artifacts `_bmad-output/planning-artifacts`, implementation artifacts `_bmad-output/implementation-artifacts`, project docs `docs/`.
- No `project-context.md` in the repo — epics.md + ux-design-specification.md + architecture.md + stories 3-1/3-2 + deferred-work.md are the authoritative context, cited inline above.
- Project memory: **api tests need Node 24** (`nvm use 24` first — better-sqlite3 ABI); **code review is run externally by Keith** — mark review and stop, don't self-review.

## Story Completion Status

Ultimate context engine analysis completed — comprehensive developer guide created. Status: ready-for-dev.

### Open questions / scope confirmations for Keith (non-blocking — sensible defaults chosen)

1. **Gate shape = per-test `page.emulateMedia()` in dedicated `@p1` spec file(s)**, not new Playwright projects. The config stubs (playwright.config.ts:54-59) get deleted in favor of a pointer comment. Projects would re-run specs wholesale under emulation — a 3.4-scale decision if ever wanted. Flag if you prefer the project shape now.
2. **AC 6 "Given CI" is satisfied at the `npm run test:e2e` level in this story; the CI `e2e` job stays with 3.4** per the epic-2 retro handoff and the ci.yml header comment. Flag if you want the CI job pulled forward into 3.3 instead (it would then need the webServer-in-CI boot path that 3.4 was going to own).
3. **200% zoom emulated as a 640×400 viewport** (exact CSS-px equivalence of 200% on 1280×800) — Playwright has no real browser-zoom API. The G3 live pass includes one real Cmd-+ 200% eyeball check as compensation.
4. **AC 5's min-hold collapse is read per-mount** (no live `change` listener for mid-session OS toggles) and the **150ms flicker threshold stays** under reduced motion (it's anti-flicker, not motion — collapsing it would cause flicker). Both recorded as decision A3 defaults.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Code)

### Debug Log References

- Initial a11y-modes run: 3/7 green (forced-colors, reduced-motion, 200%-zoom), 4 failures with three distinct causes:
  1. `main > div` locator ambiguity — matched the LiveRegion status `<div>` as well as the column. Fixed with `main > div:not([aria-live])`.
  2. prefers-contrast one-shot color read raced the 220ms `--motion-settle` transition (flipping `emulateMedia({ contrast: 'more' })` live ANIMATES the color change; read caught frame 1: `rgb(89,88,83)`, one interpolation step from muted). Debug probe confirmed the emulation itself works (`matchMedia` flips, token resolves to `#1a1a18`). Fixed by asserting via retrying `toHaveCSS` against the live active-row color.
  3. REAL CSS GAP (below) — armed delete grew 129.72→139.94px wide.
- G3 probe artifact (not a bug): arming then pressing Tab reverts armed via onBlur (by design, 2.3); a one-shot `evaluate` read immediately after `click()` can race React's commit — the spec's retrying assertions are the correct idiom.

### Completion Notes List

- **A (the one runtime change):** `usePendingPresentation` takes an optional third param `reducedMotionRead: () => boolean` defaulting to exported `prefersReducedMotion()` — a jsdom-safe guarded `window.matchMedia('(prefers-reduced-motion: reduce)')` read. When it matches, the effective min-hold is 0; `FLICKER_THRESHOLD_MS` (150ms) is untouched (anti-flicker promise, not motion). No context/provider plumbing; TodoItem/TodoList/App call sites unchanged.
- **Decision record (A3, default confirmed):** reduced-motion is read ONCE PER MOUNT via a `useState` initializer — a mid-session OS toggle applies from the next mutation/mount; no live `change` listener. The injectable seam (not a global matchMedia polyfill) is how tests mock it, matching the `PendingClock` idiom.
- **A5:** `useArmedDelete` untouched — its `:20-28` design comment explicitly documents the 300ms no-commit and 5s auto-revert as safety windows that do NOT collapse under reduced motion; its 13 existing unit tests remain green unmodified. The new e2e reduced-motion gate additionally asserts both windows browser-observably (double-press absorbed; still armed at ~1s).
- **CSS gap found and fixed (the story's "expect none" contingency): the `.delete::after` "Confirm" width reservation never worked.** The Button primitive is `display: inline-flex`, so the zero-height `::after` sat BESIDE the label as a flex item — adding "Confirm"'s width in every state instead of reserving max-width, and the armed flip still grew the button by Confirm−Delete ≈ 10.2px (stealing clamped-description space, exactly what the reservation was meant to prevent). Fix in the owning module (TodoItem.module.css): `flex-direction: column` on `.delete` stacks the reservation under the label so width = max(label, "Confirm") in both states. Caught by the D3 reflow gate; now locked by it (idle→armed button boundingBox identical). Net effect: delete buttons are ~10px narrower and geometry-stable.
- **Gate shape (Open Question 1, default confirmed):** per-test `page.emulateMedia()`/`setViewportSize()` in one spec file `e2e/tests/ui/a11y-modes.spec.ts` (7 tests, all `@p1`) inside the existing chromium project. The stale config stubs are deleted; a pointer comment marks the seam. Single file chosen over a three-file split: the gates share helpers (`scopeListTo`, `descriptionEl`, `noHorizontalScroll`) and read as one inventory.
- **AC 6 / CI (Open Question 2, default confirmed):** specs green under `npm run test:e2e` (13/13 twice consecutively); `.github/workflows/ci.yml` untouched — the CI e2e job remains Story 3.4. deferred-work.md updated: prerequisite-for-3.3 clause marked satisfied-and-consumed.
- **G1 numbers:** web 243/243 (20 files; 239 baseline + 3 new A4 cases + 1 from 3.2's post-review merge), api 49/49 under Node 24, typecheck clean, `lint:css` + selftest clean, contrast 7/7, build clean, size gate 92,498 B gz ≤ 92,295+512 budget (+140 B over 3.2's 92,358: the matchMedia helper + the CSS fix; no rebaseline needed). Pre-existing (untouched, not merge-blocking — eslint is not a CI gate): one unused-eslint-disable warning in `useRovingTabindex.ts:99`.
- **G3 (live-browser eyeball):** real Chromium screenshots at desktop 1280×800, forced-colors (armed delete), contrast-more, reduced-motion, 640×400 (200%-zoom equivalence), 320×568. Verified by eye: centred 640px column with paper to the edges, focus ring, forced-colors ✓-glyph + strikethrough + black ButtonText/borders, contrast-more full-contrast completed text, clamped 200-char row, no horizontal scroll at any size. No further gaps.
- **E2 cite (not re-tested):** pending-rests-on-aria-busy is locked by 3.2's aria-busy e2e assertions + the tokens.css `--color-pending` collapse block.

### File List

- `apps/web/src/hooks/usePendingPresentation.ts` (modified — reduced-motion min-hold collapse + `prefersReducedMotion` helper)
- `apps/web/src/hooks/usePendingPresentation.test.ts` (modified — 3 new A4 cases; existing cases untouched)
- `apps/web/src/components/recipes/TodoItem.module.css` (modified — `.delete` flex-direction column: the ::after width-reservation fix)
- `e2e/tests/ui/a11y-modes.spec.ts` (new — 7 `@p1` emulation gate tests: forced-colors, reduced-motion, 200%-zoom, mobile floor, desktop breakpoint, reflow lock, prefers-contrast)
- `playwright.config.ts` (modified — stale emulation-project stubs deleted, pointer comment added)
- `_bmad-output/implementation-artifacts/deferred-work.md` (modified — harness prerequisite clause satisfied-and-consumed)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status transitions)
- `_bmad-output/implementation-artifacts/3-3-responsive-forced-colors-reduced-motion-verification.md` (modified — this file)

## Change Log

- 2026-07-13: Story 3.3 implemented (dev-story). Reduced-motion min-hold collapse in usePendingPresentation (injectable `prefersReducedMotion` seam, read-once-per-mount; flicker threshold + delete safety windows unchanged) with 3 new unit tests. New `e2e/tests/ui/a11y-modes.spec.ts`: 7 `@p1` browser gates (forced-colors, reduced-motion + safety windows, 200%-zoom via 640×400 equivalence, 320px mobile floor, 640px desktop breakpoint, reflow lock, prefers-contrast) — 13/13 e2e green twice. One CSS gap found by the reflow gate and fixed in TodoItem.module.css (`.delete` ::after width reservation was defeated by the Button primitive's inline-flex; column direction restores it — armed delete no longer grows ~10px). playwright.config stubs resolved (deleted, pointer comment); ci.yml untouched (3.4); deferred-work.md prerequisite clause closed. All gates green: web 243, api 49, typecheck, lint:css + selftest, contrast 7/7, build, size 92,498 B ≤ budget. Live-browser eyeball pass completed. Status → review.
- 2026-07-13: Story 3.3 created (create-story). Scope: verification story — browser-level Playwright gates for responsive (320px floor, 640px breakpoint, paper-to-the-edges), reflow-stability, forced-colors, prefers-contrast, reduced-motion, and 200%-zoom (viewport-equivalence); ONE runtime change (reduced-motion collapses the 500ms pending min-hold in usePendingPresentation; flicker threshold + delete safety windows unchanged); playwright.config stub resolution. CSS already complies everywhere (verified by code audit — transition inventory, forced-colors checkbox block, prefers-contrast token block, reduced-motion token collapse all pre-exist). CI e2e job explicitly deferred to 3.4; deploy hardening 3.5. Status → ready-for-dev.
