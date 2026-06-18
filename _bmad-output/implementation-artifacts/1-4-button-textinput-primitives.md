---
baseline_commit: ea6e33ba8eb3fe120fcbe2191a01c95a6684c647
---

# Story 1.4: Button & TextInput primitives

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer on the team,
I want accessible `<Button>` and `<TextInput>` primitives,
so that recipes compose consistent, keyboard-ready controls without re-implementing focus or input normalization.

## Acceptance Criteria

1. **Given** `<Button>`, **When** rendered, **Then** it exposes `onClick`, `disabled`, `aria-pressed`, `aria-busy`, `aria-disabled`, shows the `:focus-visible` ring, has a >=44px hit area, and reflects disabled and pending states. [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4; _bmad-output/planning-artifacts/ux-design-specification.md#Component-Inventory]
2. **Given** `<TextInput>`, **When** rendered, **Then** font-size is >=16px (no iOS zoom), it is controlled (`value`/`onChange`), supports `maxLength`, `placeholder`, `aria-describedby`, and emits a validated submit on Enter (`onSubmit`). [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4; _bmad-output/planning-artifacts/ux-design-specification.md#Component-Inventory]
3. **Given** keyboard-only use, **When** I Tab to either primitive, **Then** focus is visible and operable **And** a mouse click does not show the `:focus-visible` ring. [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4; _bmad-output/planning-artifacts/ux-design-specification.md#Focus-Ring]
4. **Given** the primitives, **When** inspected, **Then** prop names mirror Radix conventions **And** unit tests cover focus, disabled, and submit behavior. [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4; _bmad-output/planning-artifacts/ux-design-specification.md#Post-MVP-Option-Preservation]

## Tasks / Subtasks

- [ ] **Task 1 - Add the web component unit-test harness (AC: 4)**
  - [ ] Add web dev dependencies: `vitest@^4.1.9`, `jsdom@^29.1.1`, `@testing-library/react@^16.3.2`, `@testing-library/dom@^10.4.1`, `@testing-library/user-event@^14.6.1`, and `@testing-library/jest-dom@^6.9.1`.
  - [ ] Add `apps/web/vitest.config.ts` or extend `apps/web/vite.config.ts` with `test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] }`. Keep the existing Vite proxy intact.
  - [ ] Add `apps/web/src/test/setup.ts` importing `@testing-library/jest-dom/vitest`.
  - [ ] Add `apps/web/package.json` script `"test": "vitest run"`. Root `npm test` already runs workspace tests with `--if-present`, so this makes web unit tests part of the local aggregate test command.
  - [ ] Update `.github/workflows/ci.yml` with an explicit `npm run test --workspace apps/web` step, or replace the separate unit/integration commands with an aggregate command only if API project separation remains visible. Do not add Playwright, axe, contrast, or bundle gates in this story.

- [ ] **Task 2 - Create the primitive module structure (AC: 1-4)**
  - [ ] Add `apps/web/src/components/primitives/`.
  - [ ] Add `Button.tsx`, `Button.module.css`, `Button.test.tsx`, `TextInput.tsx`, `TextInput.module.css`, `TextInput.test.tsx`, and `index.ts`.
  - [ ] Export only the two primitives and their prop types from `index.ts`.
  - [ ] Do not wire these primitives into `App.tsx` or create recipes yet. `CaptureInput`, `TodoItem`, and list rendering are later stories.

- [ ] **Task 3 - Implement `<Button>` (AC: 1, 3, 4)**
  - [ ] Implement a native `<button>` wrapper; default `type="button"` unless the caller passes another `type`.
  - [ ] Prop surface must include native `onClick`, `disabled`, `aria-pressed`, `aria-busy`, and `aria-disabled`. Add a small `pending?: boolean` prop only to reflect the story's pending-state requirement; when true, set `aria-busy="true"` and a stable `data-pending="true"` styling hook.
  - [ ] If `disabled` is true, use native `disabled`. If `pending` or `aria-disabled` is true, preserve focusability unless the caller also passed `disabled`, but guard `onClick` by `preventDefault()` and not calling the handler.
  - [ ] Accept React 19 refs as a `ref` prop; do not use `forwardRef`.
  - [ ] Style with CSS Modules and existing design tokens only. Hit area should be at least `var(--row-height-touch)` (48px), which exceeds the >=44px AC; use `--radius-sm`, `--border-width-thin`, `--color-border`, `--color-surface`, `--color-surface-hover`, `--color-accent`, `--color-on-surface-muted`, and motion tokens as needed.
  - [ ] Do not define `:focus` styles. Use the global `:focus-visible` rule from `global.css`, or if component CSS needs a local rule, it must be exactly `outline: 2px solid var(--color-focus); outline-offset: 2px;` under `:focus-visible`.

- [ ] **Task 4 - Implement `<TextInput>` (AC: 2, 3, 4)**
  - [ ] Implement a native controlled `<input type="text">` wrapper with `value`, `onChange`, `onSubmit`, `maxLength`, `placeholder`, and `aria-describedby`.
  - [ ] `onSubmit` fires only on Enter. It receives `value.trim()` after validation; suppress submit for empty/whitespace-only values, and do not clear the input because the caller owns `value`.
  - [ ] Ignore Enter while IME composition is active (`event.nativeEvent.isComposing`) so partially composed text is not submitted.
  - [ ] Accept React 19 refs as a `ref` prop; do not use `forwardRef`.
  - [ ] Style with CSS Modules and existing tokens only. Font size must be `var(--font-size-item)` (16px) to satisfy the iOS zoom prevention rule; use `--row-height-touch`, `--space-*`, `--radius-sm`, `--border-width-thin`, `--color-border`, `--color-surface`, and `--color-on-surface`.
  - [ ] Do not create label, validation-message, character-counter, or recipe state APIs. Those belong to later recipe stories.

- [ ] **Task 5 - Unit-test primitive behavior (AC: 1-4)**
  - [ ] Button tests: renders as a native button; defaults to `type="button"`; forwards ARIA attributes; `disabled` blocks click; `pending` / `aria-disabled` blocks click without requiring native `disabled`; keyboard Tab can focus the button.
  - [ ] TextInput tests: controlled typing calls `onChange`; `maxLength`, `placeholder`, and `aria-describedby` are forwarded; Enter submits the trimmed value; empty/whitespace Enter does not submit; composing Enter does not submit; keyboard Tab can focus the input.
  - [ ] Use `userEvent.setup()` for interactions. Import `describe`, `it`, `expect`, and `vi` from `vitest` instead of relying on globals.
  - [ ] Do not try to assert actual `:focus-visible` rendering in jsdom. The mouse-vs-keyboard focus-ring behavior is satisfied by using `:focus-visible` only plus the existing CSS lint gate; unit tests should prove focusability and operability.

- [ ] **Task 6 - Verify gates (AC: 1-4)**
  - [ ] Run `npm run typecheck`.
  - [ ] Run `npm run lint:css`.
  - [ ] Run `npm run lint:css:selftest`.
  - [ ] Run `npm run test --workspace apps/web`.
  - [ ] Run `npm run test:unit` and `npm run test:integration`.
  - [ ] Run `npm run build --workspace apps/web`.

## Dev Notes

### Scope Guardrails

- This story creates only the `Button` and `TextInput` primitives plus the web unit-test harness they need. Do not create `Checkbox`, `LiveRegion`, recipes, hooks, API calls, TanStack Query usage, or app-level UI integration. [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4; _bmad-output/planning-artifacts/ux-design-specification.md#Component-Inventory]
- The primitive layer is terminal for v1: four primitives total (`Button`, `TextInput`, `Checkbox`, `LiveRegion`). New visual product components should be recipes that compose primitives, not additional primitives. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Post-MVP-Option-Preservation]
- No third-party headless library is installed for v1. Do not install Radix for this story; only mirror the relevant prop naming discipline. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Implementation-Approach]

### Existing Foundation From Story 1.3

- `apps/web/src/styles/tokens.css` and `global.css` already exist and are imported by `main.tsx`.
- The global focus rule is already present: `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }`.
- The CSS lint gate already rejects literal colors, off-scale `px` values, and unsafe focus-ring patterns. Component CSS should use design tokens, not raw color literals or ad hoc pixel dimensions. [Source: _bmad-output/implementation-artifacts/1-3-design-tokens-typography-foundation.md]
- `--row-height-touch` is 48px; use it for Button/TextInput minimum height instead of a raw `44px`/`48px` declaration. `--font-size-item` is 16px; use it for TextInput font size. [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Tokens]

### React 19 Ref Pattern

- The web app is on React 19. Official React docs mark `forwardRef` as deprecated in React 19 and say components can receive `ref` as a prop. Type the primitives accordingly instead of wrapping them in `forwardRef`. [Source: https://react.dev/reference/react/forwardRef]

### Prop Convention Clarification

- The UX spec's general future-proofing language says primitive APIs mirror headless-library conventions such as `checked/onCheckedChange`, `open/onOpenChange`, and `value/onValueChange` for future selectable inputs. Story 1.4's AC and component inventory explicitly specify TextInput as `value` / `onChange` / `onSubmit`; those names are authoritative for this story. Do not rename TextInput to `onValueChange` unless the AC changes. [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4; _bmad-output/planning-artifacts/ux-design-specification.md#Component-Inventory]

### Testing Guidance

- Current `apps/web` has no unit-test setup. This story is the right place to add Vitest + Testing Library for component tests. Vitest 4 requires Node >=20 and Vite >=6; this repo already pins CI to Node 24 and uses Vite 8. [Source: https://vitest.dev/guide/]
- Testing Library's React docs recommend testing components through DOM output and user-observable behavior; avoid implementation-detail assertions. [Source: https://testing-library.com/docs/react-testing-library/intro/]
- `@testing-library/user-event` v14 recommends `userEvent.setup()` before rendering/interacting in each test. [Source: https://testing-library.com/docs/user-event/intro/]
- Latest versions checked on 2026-06-18: `vitest@4.1.9`, `jsdom@29.1.1`, `@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1`, `@testing-library/user-event@14.6.1`, `@testing-library/jest-dom@6.9.1`.

### Project Structure Notes

- Expected new path: `apps/web/src/components/primitives/`, matching the architecture's frontend component layout. [Source: _bmad-output/planning-artifacts/architecture.md#Complete-Project-Directory-Structure]
- Frontend components are PascalCase; tests are co-located as `src/**/*.test.tsx`; styles may use CSS Modules. [Source: _bmad-output/planning-artifacts/architecture.md#Structure-Patterns]
- Primitives know nothing of data or network state. Recipes compose primitives; only hooks touch the network. [Source: _bmad-output/planning-artifacts/architecture.md#Complete-Project-Directory-Structure]
- CI currently runs typecheck, CSS lint, CSS self-test, API unit tests, and API integration tests. Add the web unit test command without introducing deferred Playwright/axe/contrast/bundle gates. [Source: .github/workflows/ci.yml; _bmad-output/planning-artifacts/epics.md#UX-DR28]

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4] - story statement and acceptance criteria.
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR3] - Button primitive requirements.
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR4] - TextInput primitive requirements.
- [Source: _bmad-output/planning-artifacts/epics.md#Notes] - primitive accessibility baseline and split primitive batch.
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete-Project-Directory-Structure] - `apps/web/src/components/primitives` location.
- [Source: _bmad-output/planning-artifacts/architecture.md#Structure-Patterns] - frontend naming and co-located unit-test placement.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Implementation-Approach] - native HTML substrate, CSS Modules/tokens, no third-party headless library in v1.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component-Inventory] - Button/TextInput purpose and prop surfaces.
- [Source: _bmad-output/implementation-artifacts/1-3-design-tokens-typography-foundation.md] - existing token/focus lint implementation and Story 1.3 review learnings.
- [Source: https://react.dev/reference/react/forwardRef] - React 19 ref guidance.
- [Source: https://vitest.dev/guide/] - current Vitest guide and runtime requirements.
- [Source: https://testing-library.com/docs/react-testing-library/intro/] - React Testing Library usage guidance.
- [Source: https://testing-library.com/docs/user-event/intro/] - user-event v14 setup guidance.

## Dev Agent Record

### Agent Model Used

TBD by dev-story workflow.

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date       | Change |
|------------|--------|
| 2026-06-18 | Story 1.4 created; status -> ready-for-dev. |
