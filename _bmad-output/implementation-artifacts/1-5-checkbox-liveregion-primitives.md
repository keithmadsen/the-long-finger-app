---
baseline_commit: a32f852
---

# Story 1.5: Checkbox & LiveRegion primitives

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer on the team,
I want accessible `<Checkbox>` and `<LiveRegion>` primitives,
so that completion state has a robust cross-browser visual that survives forced-colors mode, and the app has a single polite announcement channel that recipes can drive without re-implementing ARIA.

## Acceptance Criteria

1. **Given** `<Checkbox>`, **When** rendered, **Then** it uses a visually-hidden native `<input type="checkbox">` with a styled `::before` indicator on its label for a consistent cross-browser visual, exposes the full Radix-aligned prop surface (`checked`, `onCheckedChange`, `disabled`, `aria-label`) even where only a static `checked` is passed, **And** its checked state remains distinguishable in forced-colors mode (the checked cue does not rely on `background-color` alone). [Source: _bmad-output/planning-artifacts/epics.md#Story-1.5; _bmad-output/planning-artifacts/ux-design-specification.md#Implementation-Approach (UX-DR5); _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility-Considerations]
2. **Given** `<LiveRegion>`, **When** mounted, **Then** it renders exactly one element with `role="status"` and `aria-live="polite"`, exposes an imperative `announce(message)` API, **And** it is never `aria-live="assertive"`. [Source: _bmad-output/planning-artifacts/epics.md#Story-1.5; _bmad-output/planning-artifacts/ux-design-specification.md#Implementation-Approach (UX-DR6); _bmad-output/planning-artifacts/ux-design-specification.md#2.6-Live-Region-Announcements]
3. **Given** an announcement is made, **When** `announce(message)` fires, **Then** the message text renders into the polite region **And** it does not move/steal focus (the active element is unchanged). [Source: _bmad-output/planning-artifacts/epics.md#Story-1.5; _bmad-output/planning-artifacts/ux-design-specification.md#2.6-Live-Region-Announcements]
4. **Given** the primitives, **When** inspected, **Then** prop names mirror Radix conventions (`checked`/`onCheckedChange`) **And** unit tests cover Checkbox checked + toggle + disabled + accessible-name behavior and LiveRegion announce + politeness + no-focus-steal behavior. [Source: _bmad-output/planning-artifacts/epics.md#Story-1.5; _bmad-output/planning-artifacts/ux-design-specification.md#Post-MVP-Option-Preservation]

## Tasks / Subtasks

- [x] **Task 1 - Create the new primitive module files (AC: 1-4)**
  - [x] Add `Checkbox.tsx`, `Checkbox.module.css`, `Checkbox.test.tsx`, `LiveRegion.tsx`, `LiveRegion.module.css`, `LiveRegion.test.tsx` under `apps/web/src/components/primitives/`.
  - [x] Extend `apps/web/src/components/primitives/index.ts` to export `Checkbox` + `CheckboxProps` and `LiveRegion` + `LiveRegionProps` (and the imperative handle type if one is exported). Keep exporting only primitives and their prop/handle types.
  - [x] Do NOT create `TodoItem`, the `<App>` page shell, `LiveRegion` singleton wiring, recipes, hooks, or any `App.tsx` integration. Those are later stories (1.6+). This story is the primitive layer only.

- [x] **Task 2 - Implement `<Checkbox>` (AC: 1, 4)**
  - [x] Render a native `<input type="checkbox">` that is **visually hidden but still in the accessibility tree and operable** (clip/transform technique — NOT `display:none` and NOT `aria-hidden`), paired with a styled visual indicator drawn via a `::before` on the label/visual element.
  - [x] Prop surface: `checked: boolean`, `onCheckedChange?: (checked: boolean) => void`, `disabled?`, `aria-label?`, plus native pass-through. Use the Radix name `onCheckedChange` (NOT `onChange`); internally wrap the native `onChange` and call `onCheckedChange(event.target.checked)`.
  - [x] Accept React 19 refs as a `ref` prop forwarded to the native input; do not use `forwardRef`.
  - [x] Style with CSS Modules and existing design tokens only. Use `--color-border`, `--color-surface`, `--color-accent`/`--color-focus`, `--radius-sm`, `--border-width-thin`, `--space-*`, and motion tokens as needed. No literal colors / off-scale px (the Story 1.3 CSS lint gate will reject them).
  - [x] **Focus ring on the visible box:** because the native input is visually hidden, the global `:focus-visible` rule paints nothing visible. Translate input focus to a ring on the styled indicator, e.g. `.input:focus-visible + .indicator { outline: 2px solid var(--color-focus); outline-offset: 2px; }`. This adds an outline (it does not remove one), so it complies with the focus-ring lint rule; do not define a bare `:focus` rule.
  - [x] **Forced-colors survival (AC 1):** the checked indicator must convey "checked" by something that survives `forced-colors: active` — i.e. not `background-color` alone (system flattens backgrounds). Use a border-/glyph-based checkmark and/or a `@media (forced-colors: active)` block using system colors (`CanvasText`/`Highlight`) so the checked state stays visible. The native checkbox semantics already survive; this guarantees the *visual* does too.

- [x] **Task 3 - Implement `<LiveRegion>` (AC: 2, 3, 4)**
  - [x] Render a single element with `role="status"` and `aria-live="polite"`. Never emit `aria-live="assertive"` (no assertive code path exists in v1).
  - [x] Expose an imperative `announce(message: string)` API via `useImperativeHandle` on a React 19 `ref` prop (e.g. `LiveRegionHandle = { announce(message: string): void }`). `announce` sets internal state that renders the message text into the region.
  - [x] `announce` must NOT move focus and must not call `.focus()` on anything (AC 3). The region is a passive status surface.
  - [x] Visually hide the region (same clip technique as Checkbox) so it is present in the a11y tree but not painted — there is no visible status text in the v1 design. Do not use `display:none` or `aria-hidden` (either would silence the announcement).
  - [x] Keep it a pure primitive: do NOT implement the singleton-ownership, the announcement copy ("{desc} added.", etc.), de-dupe/no-re-announce rules, or `<App>` wiring. Those belong to `<App>` and the mutation hooks in later stories. The primitive only renders whatever message it is told to announce.

- [x] **Task 4 - Unit-test the primitives (AC: 1-4)**
  - [x] Checkbox tests: renders with `role="checkbox"`; reflects `checked` prop (checked/unchecked); toggling via click calls `onCheckedChange` with the new boolean (assert `true` then `false`); `disabled` is forwarded and a disabled checkbox does not fire `onCheckedChange`; `aria-label` sets the accessible name; keyboard Space toggles (focusable + operable).
  - [x] LiveRegion tests: exactly one `role="status"` element exists with `aria-live="polite"`; it is never `assertive`; calling `announce('…')` via the ref renders that text into the region; a second `announce` replaces/updates the rendered text; `announce` does not change `document.activeElement` (no focus steal — assert active element before == after).
  - [x] Use `userEvent.setup()` for interactions. Import `describe`, `it`, `expect`, and `vi` from `vitest` (no globals). Assert positive AND negative paths (Story 1.4 review learning), and prove the discriminating branch where relevant.
  - [x] Do NOT attempt to assert rendered forced-colors appearance or `:focus-visible` painting in jsdom — neither is observable there. Forced-colors visual survival is satisfied structurally (CSS technique + the deferred Playwright forced-colors gate, Story 3.3); the unit test proves the structural/semantic contract, not pixels.

- [x] **Task 5 - Verify gates (AC: 1-4)**
  - [x] Run `npm run typecheck`.
  - [x] Run `npm run lint:css`.
  - [x] Run `npm run lint:css:selftest`.
  - [x] Run `npm run test --workspace apps/web`.
  - [x] Run `npm run test:unit` and `npm run test:integration` (with Node 24 first in `PATH`, matching the repo engine / CI — see Story 1.4 debug note).
  - [x] Run `npm run build --workspace apps/web`.

## Dev Notes

### Scope Guardrails

- This story creates ONLY the `Checkbox` and `LiveRegion` primitives plus their unit tests. With this, all four v1 primitives (`Button`, `TextInput`, `Checkbox`, `LiveRegion`) exist and the primitive layer is **terminal** — new visual product components must be recipes that compose primitives, not new primitives. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Implementation-Approach; #Post-MVP-Option-Preservation]
- Do NOT build `<TodoItem>`, `<App>` page shell, `CaptureInput`, list rendering, the `<LiveRegion>` singleton, TanStack Query, hooks, API calls, or any `App.tsx` wiring. The LiveRegion *singleton ownership* and the *announcement copy/de-dupe rules* are `<App>` + mutation-hook concerns in Stories 1.6+. [Source: _bmad-output/planning-artifacts/epics.md#Notes (10, 11); _bmad-output/planning-artifacts/ux-design-specification.md (UX-DR6/UX-DR7/UX-DR19)]
- No third-party headless library. Do NOT install Radix for this story; only mirror its prop naming (`checked`/`onCheckedChange`). Installing Radix is reserved for a specific reassessment trigger (date picker, combobox, popover, focus-trapped overlay) — none apply here. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Post-MVP-Option-Preservation]
- Primitives are built keyboard-**ready** with their full prop surface now (e.g. `Checkbox` ships `checked`/`onCheckedChange` even though Epic 1 may pass only a static `checked`). Epic 3 adds only roving-tabindex coordination + screen-reader announcement orchestration on top — it must not need to reopen these primitives. [Source: _bmad-output/planning-artifacts/epics.md#Notes (7); UX-DR25]

### Existing Foundation From Stories 1.3 & 1.4

- **Test harness already exists (added in Story 1.4):** `apps/web/vite.config.ts` carries `test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] }`; `apps/web/src/test/setup.ts` imports `@testing-library/jest-dom/vitest` and registers an explicit `afterEach(cleanup)` (RTL auto-cleanup was not firing in this config). `apps/web` has `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`, and a `"test": "vitest run"` script. **No new dependencies are needed for this story.** The CI web-test step (`npm run test --workspace apps/web`) is already wired. [Source: _bmad-output/implementation-artifacts/1-4-button-textinput-primitives.md]
- **Tokens + global focus ring exist:** `apps/web/src/styles/tokens.css` and `global.css` are imported by `main.tsx`. The global rule `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }` is the single source of the focus ring. `--color-border` (#dddcd5) is the committed form-control border for TextInput/Checkbox. [Source: apps/web/src/styles/tokens.css; apps/web/src/styles/global.css; _bmad-output/implementation-artifacts/1-3-design-tokens-typography-foundation.md]
- **CSS lint gate is live:** `npm run lint:css` rejects literal colors, off-scale `px`, and `outline: none` not paired with a `:focus-visible` `--color-focus` ring; `npm run lint:css:selftest` guards the gate. Component CSS must use tokens only. Adding an outline on the indicator is allowed; never write a bare `:focus` or unpaired `outline: none`. [Source: _bmad-output/implementation-artifacts/1-3-design-tokens-typography-foundation.md]
- **No `visually-hidden` utility and no `forced-colors` media query exist in `apps/web/src` yet** — this story introduces both. Keep the visually-hidden styles local to each component's CSS Module (the two primitives are the only consumers in v1; do not prematurely extract a shared util). Use the standard accessible clip pattern (`position:absolute; width:1px; height:1px; overflow:hidden; clip-path: inset(50%); white-space:nowrap;`), NOT `display:none`/`visibility:hidden`/`aria-hidden`, all of which remove the element from the a11y tree.

### React 19 Ref Pattern

- The web app is on React 19; `forwardRef` is deprecated. Both primitives take `ref` as a normal prop. `LiveRegion` exposes its imperative API via `useImperativeHandle(ref, () => ({ announce }))`; `Checkbox` forwards `ref` to the native `<input>`. Type accordingly; do not wrap in `forwardRef`. [Source: _bmad-output/implementation-artifacts/1-4-button-textinput-primitives.md; https://react.dev/reference/react/useImperativeHandle]

### Prop Convention Clarification

- `Checkbox` is the canonical toggle, so it uses the Radix names **`checked` / `onCheckedChange`** (authoritative per UX-DR5 and the Component Inventory). Do not name it `onChange` on the public API — internally adapt the native `onChange` to call `onCheckedChange(e.target.checked)`. This keeps a future swap to `Radix.Checkbox` a one-file change. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Implementation-Approach; #Post-MVP-Option-Preservation; #Discipline-Lever]

### Accessibility & Forced-Colors Detail (load-bearing for AC1/AC2/AC3)

- **Checkbox forced-colors:** under `forced-colors: active` the OS replaces author colors; `background-color`-only checked cues vanish. Convey "checked" with a border/glyph (e.g. a CSS checkmark drawn with borders) and/or a `@media (forced-colors: active)` block using system color keywords (`CanvasText`, `Highlight`). The native input's own checked semantics survive regardless; AC1 is about the *visual* surviving too. This is verified for real by the deferred Playwright forced-colors gate (Story 3.3 / UX CI gate 3), not in jsdom. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility-Considerations (Forced-colors); #CI-Test-Gates]
- **LiveRegion politeness is permanent:** `aria-live="polite"` + `role="status"` only. Assertive is reserved for nothing in v1 — it would interrupt typing during burst capture. Errors carry urgency visually (the later unread-error indicator), not via assertive announcements. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#2.6-Live-Region-Announcements]
- **No focus steal (AC3):** a status region is passive — rendering text into it must not call `.focus()` or change the active element. This is the property the unit test pins. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#2.6-Live-Region-Announcements]
- **Re-announce nuance (informational, not this story's job):** some screen readers do not re-announce identical text re-set into a polite region. The v1 announcement rules (announce-once, no re-announce on repeated same-submit failure) live in the mutation hooks / `<App>`, not the primitive. The primitive renders whatever message it is given; do not bake de-dupe logic into it. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#2.6-Live-Region-Announcements; epics.md UX-DR19]

### Previous Story Intelligence (Story 1.4 — same primitive layer, fresh)

- Story 1.4 shipped `Button`/`TextInput` and the harness; its code review produced reusable learnings to apply here:
  - **Test both polarities.** 1.4 had an all-negative Button suite that would have masked a guard-always-on regression. For Checkbox, assert both that toggling fires `onCheckedChange` (positive) and that `disabled` suppresses it (negative).
  - **Prove the discriminating branch.** 1.4's IME test could pass for the wrong reason. For LiveRegion, prove `announce` is what renders the text (e.g. region empty before, contains the message after), and that politeness is `polite` not merely "not assertive."
  - **Don't assert what jsdom can't render.** 1.4 correctly avoided asserting `:focus-visible` pixels. Same here for forced-colors and the focus ring on the indicator — assert structure/semantics, lean on the CSS lint + deferred Playwright gates for rendering.
  - **`userEvent.setup()` + explicit imports** from `vitest`; rely on the existing `afterEach(cleanup)` in `setup.ts`.
  - **Node 24 for the API test step** — 1.4 hit a `better-sqlite3` ABI mismatch under Node 22; run `test:unit`/`test:integration` with Node 24 first in `PATH`. Web tests (jsdom) are unaffected. [Source: _bmad-output/implementation-artifacts/1-4-button-textinput-primitives.md#Review-Findings; #Debug-Log-References]

### Project Structure Notes

- New files live in `apps/web/src/components/primitives/` alongside `Button`/`TextInput`, matching the architecture's frontend layout (`components/primitives/` for the 4 primitives; `components/recipes/` for later recipes). [Source: _bmad-output/planning-artifacts/architecture.md#Complete-Project-Directory-Structure]
- Frontend components are PascalCase; tests co-located as `src/**/*.test.tsx`; styles via CSS Modules. Primitives know nothing of data or network state. [Source: _bmad-output/planning-artifacts/architecture.md#Naming-Patterns; #Structure-Patterns; #Architectural-Boundaries]
- No new libraries, no version research required: the stack is unchanged from Story 1.4 (React 19, Vitest 4, Testing Library, jsdom — already pinned in `apps/web/package.json`). Forced-colors and the visually-hidden clip pattern are standard CSS, not dependencies.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.5] — story statement and acceptance criteria.
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR5] — Checkbox primitive requirements (visually-hidden input + styled `::before`, `checked`/`onCheckedChange`, forced-colors survival).
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR6] — LiveRegion primitive (single `role="status" aria-live="polite"`, imperative `announce`, never assertive).
- [Source: _bmad-output/planning-artifacts/epics.md#Notes (7, 10, 11)] — primitive a11y baseline, split primitive batch, terminal primitive layer.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Implementation-Approach] — native HTML substrate, CSS Modules/tokens, primitive layer is terminal, no v1 headless library.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#2.6-Live-Region-Announcements] — polite-only politeness, announcement-pattern ownership, focus rules.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility-Considerations] — forced-colors / high-contrast behavior; checkbox state survives forced-colors.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Post-MVP-Option-Preservation; #Discipline-Lever] — Radix prop-name discipline concentrated in the primitive layer.
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete-Project-Directory-Structure; #Naming-Patterns; #Structure-Patterns; #Architectural-Boundaries] — file location, naming, co-located tests, component boundary.
- [Source: _bmad-output/implementation-artifacts/1-4-button-textinput-primitives.md] — existing harness, React 19 ref pattern, and code-review learnings to carry forward.
- [Source: _bmad-output/implementation-artifacts/1-3-design-tokens-typography-foundation.md] — token vocabulary + CSS lint/focus-ring gates.
- [Source: https://react.dev/reference/react/useImperativeHandle] — React 19 imperative-handle pattern for the LiveRegion `announce` API.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — dev-story workflow.

### Debug Log References

- **CSS Modules class naming:** initial `.nativeInput` class failed `stylelint`'s `selector-class-pattern` (config-standard enforces kebab-case). Renamed to the single-word `.input` (module-scoped, matches the existing `Button`/`TextInput` single-word idiom and avoids any camelCase/localsConvention coupling).
- **Forced-colors system keywords pass the color lint:** `Canvas`/`CanvasText`/`Highlight` are not flagged by `color-named`/`color-no-hex` (they are not in the CSS named-color list). Kept the documenting `stylelint-disable-next-line color-named` comments to record intent; the lint stays green.
- **API regression tests:** ran `test:unit`/`test:integration` with Node 24 first in `PATH` (per Story 1.4's `better-sqlite3` ABI note); both green. Web (jsdom) tests are Node-version-agnostic.

### Completion Notes List

- Added the final two v1 primitives, completing the terminal primitive layer (`Button`, `TextInput`, `Checkbox`, `LiveRegion`).
- **Checkbox:** native `<input type="checkbox">` visually hidden via the accessible clip pattern (kept in the a11y tree + operable), paired with a styled `.indicator` whose `::before` draws a `✓` glyph. Checked state is conveyed by the foreground glyph (present/absent) plus accent border/background — not background-color alone — so it survives forced-colors; a `@media (forced-colors: active)` block pins border/glyph to system colors (`Highlight`/`Canvas`/`CanvasText`). Public surface is Radix-aligned `checked`/`onCheckedChange` (native `onChange` adapted internally); React 19 `ref` forwarded to the input; keyboard focus translated to a ring on `.indicator` via `.input:focus-visible + .indicator` (additive outline, lint-compliant).
- **LiveRegion:** single element with explicit `role="status"` + `aria-live="polite"` (never assertive), imperative `announce(message)` via `useImperativeHandle` on a React 19 `ref` prop. `announce` only sets state — no `.focus()`, no active-element change. Visually hidden via the same clip pattern (not `display:none`/`aria-hidden`, which would silence it). No singleton/copy/de-dupe logic — that is `<App>`/mutation-hook scope in later stories.
- Scope held to the primitive layer only: no `TodoItem`, `<App>` shell, recipes, hooks, singleton wiring, or new dependencies.
- Tests follow Story 1.4 learnings: both polarities asserted (toggle fires vs. disabled suppresses; renders text vs. empty-before), discriminating branches proven (`onCheckedChange` reports `true` then `false` under controlled re-render; `announce` is what renders the text), and no attempt to assert forced-colors/`:focus-visible` pixels in jsdom.
- Gates: typecheck ✓, `lint:css` ✓, `lint:css:selftest` (14/14) ✓, ESLint ✓, web tests 26/26 ✓ (10 new across the two primitives), API `test:unit` 13/13 ✓ + `test:integration` 9/9 ✓ (Node 24), web build ✓.

### File List

- `apps/web/src/components/primitives/Checkbox.tsx` (new)
- `apps/web/src/components/primitives/Checkbox.module.css` (new)
- `apps/web/src/components/primitives/Checkbox.test.tsx` (new)
- `apps/web/src/components/primitives/LiveRegion.tsx` (new)
- `apps/web/src/components/primitives/LiveRegion.module.css` (new)
- `apps/web/src/components/primitives/LiveRegion.test.tsx` (new)
- `apps/web/src/components/primitives/index.ts` (modified — added Checkbox/LiveRegion exports)

## Change Log

| Date       | Change |
|------------|--------|
| 2026-06-19 | Story 1.5 created; status -> ready-for-dev. |
| 2026-06-19 | Implemented `Checkbox` + `LiveRegion` primitives with unit tests; all gates green; status -> review. |
