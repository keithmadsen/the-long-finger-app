---
baseline_commit: d14b6b321ba0dba610b6e8ba928d1294a6d1588a
---

# Story 1.3: Design tokens & typography foundation

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer on the team,
I want the semantic design-token system and typography foundation with lint enforcement,
so that every component draws from one calm visual vocabulary and color/focus regressions are blocked automatically.

## Acceptance Criteria

1. **Given** `tokens.css`, **When** defined, **Then** it contains the committed semantic tokens (surfaces, accents, `--color-focus`, `--color-error`, typography, spacing `--space-1..6`, `--row-height-touch` 48px, radius, border, motion) at the committed light-theme values **And** uses no literal color names. [Source: epics.md#Story-1.3; ux-design-specification.md#Color-System, #Typography-System, #Spacing-&-Layout-Foundation, #Motion-tokens]
2. **Given** the global stylesheet, **When** applied, **Then** the system-font stack, `color-scheme: light`, and `text-size-adjust: 100%` are set, the 3-step type scale and 3 weights are available as tokens, **And** no user-facing heading elements are introduced. [Source: epics.md#Story-1.3; ux-design-specification.md#Typography-System]
3. **Given** a CSS file, **When** CI runs the token-name lint, **Then** literal color values, off-scale `px`, and `outline: none` without a paired `:focus-visible` rule fail the build. [Source: epics.md#Story-1.3, #Notes-14; ux-design-specification.md#CI-Test-Gates (item 1)]
4. **Given** any interactive element, **When** it defines focus, **Then** the ring is `outline: 2px solid var(--color-focus); outline-offset: 2px;` applied via `:focus-visible` only. [Source: epics.md#Story-1.3; ux-design-specification.md#Focus-ring, #Forced-colors-Reduced-motion]

## Tasks / Subtasks

- [x] **Task 1 — Create `tokens.css` with the full committed semantic token set (AC: #1, #4)**
  - [x] Create `apps/web/src/styles/tokens.css` defining all tokens on `:root` at the committed light-theme values (exact values in Dev Notes → "Committed token values"). Groups: surfaces, accents/borders, focus, error, typography (font stack var + sizes + weights + line-heights), spacing `--space-1..6`, `--row-height-touch`, radius, border-width, motion.
  - [x] Use ONLY semantic custom-property names — no literal color names (`--color-white`, `--color-grey-100`, `--color-blue-500`, etc.). Color literals (`#FAFAF7` …) are the *values*; the *names* are semantic.
  - [x] Structure the file so dark mode is later a `@media (prefers-color-scheme: dark)` redefinition of the same variables, NOT a rewrite. Add a clearly-labelled commented placeholder block for the deferred dark-mode redefinition (do NOT implement dark values — light only in v1).
  - [x] Add `prefers-contrast: more` handling: `--color-on-surface-muted` resolves to the value of `--color-on-surface` under `@media (prefers-contrast: more)` (the muted distinction collapses to full contrast). [Source: ux-design-specification.md#Forced-colors lines 666]

- [x] **Task 2 — Create the global stylesheet (`global.css`) (AC: #2, #4)**
  - [x] Create `apps/web/src/styles/global.css` that `@import`s `tokens.css` (or rely on import order in `main.tsx` — see Task 3) and applies the base layer: the committed `html { color-scheme: light; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }` block, the system-font stack applied to `body` via `var(--font-body)`, base `body`/`color`/`background` from tokens (`--color-on-surface` on `--color-surface`), and a small normalize block (`* { box-sizing: border-box }`, `body { margin: 0 }`).
  - [x] Add a single base `:focus-visible` focus-ring rule using the committed declaration (`outline: 2px solid var(--color-focus); outline-offset: 2px;`) so primitives in 1.4/1.5 inherit it; do NOT use bare `:focus`.
  - [x] Introduce NO user-facing heading elements in any stylesheet or markup added by this story. The walking-skeleton `<h1>The Long Finger</h1>` in `apps/web/src/App.tsx` violates the "no heading hierarchy" principle — neutralize it (remove the `<h1>`, or keep App's content minimal/non-heading). Keep App.tsx otherwise skeleton-thin; the real shell + recipes are Story 1.6. [Source: ux-design-specification.md#Type-principles line 558]
  - [x] Apply `--line-height-item` (1.5) as the body line-height (replaces the literal `1.5` currently in `index.css`).

- [x] **Task 3 — Wire the stylesheets into the app and remove `index.css` (AC: #1, #2)**
  - [x] Replace the `import './index.css'` in `apps/web/src/main.tsx` with the new styles entrypoint (import `global.css`, which pulls in `tokens.css`). Delete `apps/web/src/index.css` once its content is fully migrated into `global.css`/`tokens.css` (no orphaned literal values left behind).
  - [x] Confirm `npm run build --workspace apps/web` succeeds and the app still renders (no layout shift / no console errors). The token CSS must ship in the bundle.

- [x] **Task 4 — Stand up the token-name lint (literal-color + off-scale-px) (AC: #3)**
  - [x] Add `stylelint` (latest 17.x) + `stylelint-config-standard` as devDependencies in `apps/web` (CSS lives only under `apps/web`). Pin to the current line — see Dev Notes → "Latest tech".
  - [x] Add a stylelint config (`apps/web/.stylelintrc.json` or `stylelint.config.js`) that:
    - Forbids literal color values in **component/module CSS** (hex, `rgb()`, `hsl()`, named colors) — via `declaration-property-value-disallowed-list` / `color-no-hex` + a value regex, with `tokens.css` **exempted** (the one file allowed to declare raw color values).
    - Forbids off-scale `px` values (px literals outside the committed spacing/size scale) in component CSS — `tokens.css` exempted.
    - Enforces semantic custom-property naming in `tokens.css` via `custom-property-pattern` (reject names like `--color-white`/`--color-grey-100`/`--color-blue-500`; accept the committed semantic vocabulary). [Source: ux-design-specification.md line 253]
  - [x] Add an `apps/web` npm script `"lint:css": "stylelint \"src/**/*.css\""` (and component `*.module.css` once they exist).

- [x] **Task 5 — Enforce the focus-ring rule: `outline: none`/`outline: 0` without a paired `:focus-visible` (AC: #3, #4)**
  - [x] This pairing check is not a built-in stylelint rule. Implement it as a small **custom stylelint plugin** (preferred) OR a dedicated node lint script invoked in the same `lint:css` step. It must FAIL the build when a rule sets `outline: none`/`outline: 0` and no sibling/related `:focus-visible` rule restores a `--color-focus` outline. [Source: ux-design-specification.md#Focus-ring-enforcement lines 255, 646; "load-bearing accessibility control surface; it cannot be a doc-only rule"]
  - [x] Document the chosen mechanism in Dev Notes/Completion Notes so reviewers know where the rule lives.

- [x] **Task 6 — Add the lint to CI (AC: #3)**
  - [x] Add a root `lint:css` passthrough script (e.g. `"lint:css": "npm run lint:css --workspace apps/web"`).
  - [x] Add a new step to `.github/workflows/ci.yml` (after typecheck, before/after tests) that runs the CSS token-name lint and **fails the build** on violation. This is the first of the deferred web gates to land (epics Notes 14: "CI gate scaffolding starts in Epic 1 — token-name lint … from the first commit"). Do NOT add axe-core / contrast-regression / bundle-size gates here — those arrive with the list view in Story 1.6 (epics Notes 14/18; C.14).

- [x] **Task 7 — Prove the lint actually gates (red fixtures) (AC: #3)**
  - [x] Add fixture-based verification that the lint is real, not cosmetic: a known-bad CSS sample (a literal hex in a component file, an off-scale `px`, and a bare `outline: none`) must each be flagged by `lint:css`; the real `tokens.css` + `global.css` must pass clean. Place fixtures so they are linted on demand but do NOT pollute the shipped bundle (e.g. a `__lint-fixtures__` dir excluded from the build/Vite entry, asserted via a test or a documented `npm run` check).
  - [x] Record the red→green evidence (the failing-fixture output, then the clean pass) in Debug Log References.

## Dev Notes

### Authoritative sources & precedence
- **The UX spec is the source of truth for every token value, name, and the focus-ring/lint behavior.** The epic gives the four ACs; the UX spec gives the exact hex/px/ms values and the enforcement intent. Where the epic AC is narrower than the UX spec (scope of the lint), the **epic AC governs the gating requirement** and the extra UX scope is noted as optional hardening (see "Scope boundaries").
- This is a **frontend-only, additive** story. It touches `apps/web` styles, `apps/web/src/main.tsx`, `apps/web/src/App.tsx` (skeleton h1 only), web tooling config, and `ci.yml`. It does NOT touch the API, contracts, DB, or any backend file.

### Committed token values (exact — copy these)

**Surfaces** [Source: ux-design-specification.md#Color-System lines 457–461]
- `--color-surface: #FAFAF7;` — page background (warm off-white "paper")
- `--color-surface-muted: #F0EFEA;` — separators, empty-state surface, hover backgrounds
- `--color-surface-hover: #F5F4EF;` — desktop hover on interactive rows
- `--color-on-surface: #1A1A18;` — active/primary text
- `--color-on-surface-muted: #5A5954;` — completed/pending/secondary text

**Accents, borders, focus, error** [Source: lines 467–471]
- `--color-border: #DDDCD5;` — form-control borders
- `--color-divider: #E4E2DC;` — between-row rules
- `--color-accent: #3D5A80;` — affordance (links, retry); muted slate blue
- `--color-focus: #3D5A80;` — focus ring (declared separately from accent; default matches accent)
- `--color-error: #A02D2D;` — error text/marker

**Typography** [Source: lines 510–553]
- `--font-body:` the system-font stack:
  ```
  -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
  ```
  (Note: the current skeleton `index.css` uses a slightly different stack — adopt the UX-spec stack above as the committed value.)
- `--font-size-item: 16px;` (1rem) — task/input text (also satisfies the iOS-zoom ≥16px rule)
- `--font-size-secondary: 14px;` (0.875rem) — reserved
- `--font-size-micro: 12px;` (0.75rem) — reserved
- `--font-weight-regular: 400;`
- `--font-weight-medium: 500;`
- `--font-weight-semibold: 600;` — reserved
- `--line-height-item: 1.5;`
- `--line-height-secondary: 1.4;` — reserved
- `--line-height-micro: 1.3;` — reserved

**Spacing (4px base)** [Source: lines 565–578]
- `--space-1: 4px;` `--space-2: 8px;` `--space-3: 12px;` `--space-4: 16px;` `--space-5: 24px;` `--space-6: 32px;`
- `--row-height-touch: 48px;`

**Radius / border** [Source: lines 584–591]
- `--radius-none: 0;` `--radius-sm: 4px;`
- `--border-width-thin: 1px;`

**Motion** [Source: lines 636–639]
- `--motion-instant: 120ms;` — collapses to `0ms` under `prefers-reduced-motion: reduce`
- `--motion-settle: 220ms;` — collapses to `0ms` under reduced-motion
- `--motion-none: 0ms;` — NOT affected by reduced-motion (the honest-pending swap that must not flash)
- `--motion-ease: cubic-bezier(0.2, 0, 0, 1);` — single easing curve for v1

> Note on reduced-motion: this story only *defines* the tokens. The motion-token *collapse* under `prefers-reduced-motion` is consumed by components in later stories; if you add any transition in `global.css` here, wrap it so reduced-motion zeroes it. The Playwright reduced-motion gate is Story 1.6/Epic 3 — do not add it now.

### Committed global CSS [Source: ux-design-specification.md lines 521–528]
```css
html {
  color-scheme: light;                /* Prevents form-control dark-mode flash on first paint. */
  -webkit-text-size-adjust: 100%;     /* Prevents iOS Safari landscape body-copy inflation. */
  text-size-adjust: 100%;
}
```

### Focus ring [Source: lines 251, 646, 655]
- The committed declaration, applied via `:focus-visible` ONLY:
  ```css
  :focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
  ```
- Rationale: non-color-only (width + offset make it readable in high-contrast/forced-colors). Mouse clicks must NOT show the ring (that's why `:focus-visible`, not `:focus`).
- **Safari <15.4** does not honor `:focus-visible` (shows ring on click too) — this is **accepted, not worked around** (accessibility-positive, shrinking user base). Do not add a polyfill. [Source: line 677]

### The token-name lint — what "real" means here
The lint is the load-bearing deliverable of this story (AC #3) — the tokens themselves are easy; the *enforcement* is the point. Three forbidden patterns, all must fail CI:
1. **Literal color values** (hex/`rgb()`/`hsl()`/named) in any CSS file **except `tokens.css`**. `tokens.css` is the single sanctioned home for raw color literals. [Source: line 683]
2. **Off-scale `px`** — px literals outside the committed scale, in component CSS (`tokens.css` exempt). [Source: line 683]
3. **`outline: none` (or `outline: 0`) not paired with a `:focus-visible` rule** restoring a `--color-focus` outline. [Source: lines 255, 683]

Implementation guidance:
- (1) and (2) map cleanly onto stylelint built-ins (`color-no-hex`, `declaration-property-value-disallowed-list`, `declaration-property-unit-disallowed-list` / a custom value regex) with a per-file override exempting `tokens.css`. See the current stylelint rule docs in "Latest tech".
- (3) has **no built-in** — write a small custom stylelint plugin or a node script. Be honest in Completion Notes about which you chose and its limits.

### Scope boundaries (do NOT over-build)
- **Lint scope:** The epic AC says *"Given a CSS file"* — gating on **`.css` files** satisfies AC #3. The UX spec additionally lists `style=` attribute strings in `*.tsx/*.ts` (line 683). v1 uses CSS Modules with **no inline styles expected**, so cover CSS files now and record the `style=`-attribute coverage as a documented optional follow-up (ESLint `no-restricted-syntax` on JSX `style` literals) rather than building it speculatively. State this explicitly in Completion Notes so it is a tracked decision, not a silent gap.
- **Deferred gates (NOT this story):** axe-core (0 serious/critical), the contrast-regression computation from the token source, Playwright forced-colors / reduced-motion / 200%-zoom, and the bundle-size budget all arrive with the rendered list view in **Story 1.6** (and broaden in Epic 3). The Color-System contrast table values are documented in the UX spec for that future test; you are NOT writing the contrast computation here. [Source: epics.md#Notes-14/18; ux-design-specification.md#CI-Test-Gates items 2–6]
- **Heading-element lint:** the UX spec mentions a lint that "rejects unauthorised heading elements in user-facing components" (line 558). No components exist yet (they arrive 1.4–1.6). Satisfy AC #2 by *not introducing* headings (and neutralizing the skeleton `<h1>`); a JSX heading-lint rule is optional and best added when components/recipes land. Do not block this story on it.
- **Dark mode:** out of scope. Light only. Leave the structured `prefers-color-scheme: dark` placeholder comment; implement no dark values. [Source: lines 257, 675]

### Project Structure Notes
- Target paths (per architecture #Complete-Project-Directory-Structure lines 409–411):
  - `apps/web/src/styles/tokens.css` — CSS custom-property tokens
  - `apps/web/src/styles/global.css` — system-font stack, reset, base layer
- Current state to migrate from: `apps/web/src/index.css` exists with a literal font stack, `line-height: 1.5`, `box-sizing`, `body margin`, and a `main { max-width: 40rem }` block. Fold the still-relevant base bits into `global.css` (using tokens) and delete `index.css`. The `main { max-width }` value is a layout concern owned by the App shell in Story 1.6 — keep a minimal centered container if needed for the skeleton, but the 640px max-width container is formally a 1.6 deliverable; don't over-invest here.
- `main.tsx` currently does `import './index.css'` — repoint to the new styles entrypoint.
- No styles/ directory exists yet — create it.

### Previous Story Intelligence (Story 1.2)
- Story 1.2 was backend-only (contracts, schema, repository, error envelope, OpenAPI) — no frontend tooling beyond re-typing `App.tsx`'s `todos` state. So **this is the first story to add web tooling/config and the first web CI gate.** [Source: 1-2 File List + Completion Notes]
- **Engine/runtime gotcha carried forward:** the repo declares `engines.node >=24` and the committed `better-sqlite3` native binary is built for Node 24 (ABI 137). Local default shell may be Node 22 → backend tests throw `NODE_MODULE_VERSION` mismatch. **Run all tooling under Node 24** (nvm v24.x; `.nvmrc` pins it). This story's web lint/build is pure JS and less sensitive, but run the full `npm run typecheck` / any backend touch under Node 24 to avoid noise. [Source: 1-2 Completion Notes → "Engine note"]
- Dependency-pinning discipline from 1.2: pin to the current compatible line and record exact versions + rationale in Completion Notes. [Source: 1-2 Latest Tech Information]
- Test/co-location convention established: tests live beside the code they cover; red-phase scaffolds are realized into canonical homes and the scaffolds removed (no dead skipped tests). Apply the same hygiene to the lint fixtures (Task 7) — keep them purposeful and out of the shipped bundle.

### Git Intelligence
- Recent commits (`6691c82`, `8329238`, `15acc9e`, `3089fc7`, `ead22a1`) are all Story 1.2 backend/schema work — no frontend styling precedent to follow or conflict with. The web app is still the 1.1 walking skeleton. Branch from `main` (1.2 merged via PR #4).

### Latest tech (verified June 2026)
- **stylelint** current line is **17.x** (17.12.0 released 2026-05-20). Use flat or JSON config; the relevant rules exist today:
  - `color-no-hex`, `declaration-property-value-disallowed-list` (supports regex property + value lists, e.g. `{ "/^color/": ["/#/"] }`), `declaration-property-unit-disallowed-list`, `property-disallowed-list`, and `custom-property-pattern` (use `/^--/` semantics; recent releases fixed custom-property false-negatives in the (dis)allowed-list rules).
  - Pair with `stylelint-config-standard` as the base, then layer the project's forbidden-pattern rules and a per-file `overrides` block exempting `tokens.css` from the literal-color/off-scale rules.
  - For the `outline: none` ↔ `:focus-visible` pairing (no built-in), a custom plugin via stylelint's plugin API or a standalone node check is the documented approach.
- Verify exact current patch at install time; pin what you install and record it in Completion Notes (per 1.2 discipline).
- [Sources: https://stylelint.io/user-guide/rules/declaration-property-value-disallowed-list/ , https://stylelint.io/user-guide/configure/ , https://stylelint.io/changelog/]

### Testing Standards
- Frontend test stack is not yet established (1.1/1.2 were API Vitest only). This story's "tests" are primarily the **lint gate proving itself** via red fixtures (Task 7) — a known-bad CSS sample must fail `lint:css`, the real tokens/global must pass. That red→green evidence is the correctness proof for AC #3, and goes in Debug Log References.
- Do NOT stand up a full web unit-test framework just for this story — that scaffolding belongs with the primitives (Story 1.4, "unit tests cover focus, disabled, submit"). Keep the verification proportional: lint fixtures + a clean build.
- Run the lint and build under Node 24.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.3 lines 201–212] — story statement + the 4 ACs.
- [Source: _bmad-output/planning-artifacts/epics.md#Notes lines 142, 144, 148] — split the primitive batch (tokens+typography is its own story); CI gate scaffolding starts in Epic 1 with the token-name lint; bundle-size gate sequenced after first web build.
- [Source: _bmad-output/planning-artifacts/epics.md UX-DR1/UX-DR2/UX-DR27/UX-DR28 lines 63, 64, 89, 90] — token system, typography system, WCAG AA criteria, UX-enforced CI gates.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Color-System lines 451–502] — exact surface/accent/focus/error hex values + contrast table (the latter for Story 1.6's contrast test).
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Typography-System lines 506–559] — font stack, global html block, type scale, weights, line-heights, no-heading principle.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Spacing-&-Layout-Foundation lines 561–599] — spacing scale, row-height, radius, border-width, paper-to-the-edges.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Motion lines 636–646] — motion tokens + reduced-motion collapse + focus-visible-only rule.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Forced-colors-Reduced-motion lines 655–677] — focus-ring forced-colors behavior, prefers-contrast collapse, dark-mode posture, Safari `:focus-visible` fallback.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#CI-Test-Gates lines 679–688] — token-name lint scope + the deferred gates (contrast/axe/forced-colors/reduced-motion/zoom).
- [Source: _bmad-output/planning-artifacts/architecture.md lines 76, 135, 203, 305, 409–411] — UI stack (native HTML + CSS Modules + CSS custom-property tokens; system fonts; no headless lib in v1), ESLint+tsc in CI, styles/ file layout.
- [Source: _bmad-output/implementation-artifacts/1-2-todo-contracts-schema-repository-real-read-path.md] — Node-24 engine gotcha, dependency-pinning discipline, test co-location/red-green hygiene; current state of `App.tsx`/`main.tsx`.
- [Source: project — apps/web/src/{index.css,main.tsx,App.tsx}, apps/web/package.json, apps/web/eslint.config.js, .github/workflows/ci.yml] — files this story migrates/extends.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context) — dev-story workflow.

### Debug Log References

- **Dependency resolution:** first attempt to install `stylelint-config-standard@^39` failed `ERESOLVE` — v39 peers on `stylelint@^16`, but `stylelint` latest is `17.13.0`. The matching pair is `stylelint-config-standard@40.0.0` (peers `stylelint@^17.0.0`). Installed `stylelint@^17.13.0` + `stylelint-config-standard@^40.0.0`.
- **config-standard noise (first lint run, 6 errors):** `import-notation` (wanted `url()`), `property-no-vendor-prefix` (`-webkit-text-size-adjust`), and three `custom-property-empty-line-before` / `comment-empty-line-before` cosmetic flags in `tokens.css`. Resolved: switched `@import` to `url()`; added a single targeted `stylelint-disable-next-line property-no-vendor-prefix` (the `-webkit-` prefix is committed by the UX spec and there is no autoprefixer in the build); disabled the two empty-line cosmetic rules (they fight the deliberately compact, grouped token file and are orthogonal to the token-name lint's purpose). Real CSS then linted clean (exit 0).
- **Red→green evidence (AC #3) — `lint:css:selftest`, all 10 cases pass:**
  - RED (must fail): literal hex → `color-no-hex` ✓; named color → `color-named` ✓; `rgb()` → `function-disallowed-list` ✓; off-scale px on spacing → `declaration-property-unit-disallowed-list` ✓; on-scale px on spacing also rejected (forces the token) ✓; `--color-white` custom property → `custom-property-pattern` ✓ (fires even inside `tokens.css`); `outline: none` with no paired `:focus-visible` → `tlf/focus-visible-pairing` ✓.
  - GREEN (must pass): raw hex in `tokens.css` (sanctioned) → `color-no-hex` silent ✓; off-scale px in `tokens.css` (declares the scale) → unit rule silent ✓; `outline: none` paired with a `:focus-visible { … var(--color-focus) }` rule → pairing rule silent ✓.
- **Full gate set green (Node 24):** `typecheck` (all workspaces) ✓; `lint:css` ✓; `lint:css:selftest` 10/10 ✓; web `eslint` ✓; web `build` ✓ (CSS bundle 1.40 kB / 0.64 kB gzip ships the tokens); Vitest `unit` 13 ✓ + `integration` 9 ✓ (22 total — no regressions vs Story 1.2).

### Completion Notes List

- **All 4 ACs satisfied.**
  - **AC #1 — `tokens.css`:** full committed semantic token set on `:root` at the exact light-theme values from the UX spec (surfaces, accents/borders, `--color-focus`, `--color-error`, typography incl. `--font-body` stack + sizes + weights + line-heights, spacing `--space-1..6`, `--row-height-touch` 48px, radius, `--border-width-thin`, motion). Names are semantic — the `custom-property-pattern` lint rejects literal color names (`--color-white`/`--color-grey-100`/`--color-blue-500`). Structured for a future `prefers-color-scheme: dark` redefinition (commented placeholder, no dark values in v1) and includes the `prefers-contrast: more` collapse of `--color-on-surface-muted` → `--color-on-surface`.
  - **AC #2 — `global.css`:** `@import`s tokens, applies the committed `html { color-scheme: light; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }` block, the system-font stack + base type via `var()` tokens, and a small normalize. The 3-step type scale + 3 weights live as tokens. No user-facing heading elements: removed the walking-skeleton `<h1>The Long Finger</h1>` from `App.tsx`.
  - **AC #3 — token-name lint (the load-bearing deliverable):** stylelint (`apps/web/stylelint.config.js`, extends config-standard) gates on (1) literal color values outside `tokens.css` (`color-no-hex` + `color-named: never` + `function-disallowed-list` of color functions), (2) off-scale px on spacing/layout properties (`declaration-property-unit-disallowed-list`), and (3) the focus-ring pairing via the local plugin. `tokens.css` is the single sanctioned home for raw color/px literals (per-file `overrides`). Wired into CI (`.github/workflows/ci.yml`) as the first web gate, plus a self-test step that guards the gate itself from rotting.
  - **AC #4 — focus ring:** the single base rule in `global.css` is exactly `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }` — `:focus-visible` only, never bare `:focus`. The `tlf/focus-visible-pairing` plugin fails the build on any `outline: none`/`0` not paired with a `:focus-visible` ring restoring `var(--color-focus)`.
- **Focus-ring pairing mechanism (Task 5) — where it lives & its limit:** implemented as a local stylelint plugin at `apps/web/stylelint-plugins/focus-visible-pairing.js` (rule `tlf/focus-visible-pairing`). The pairing is checked **per-stylesheet (root)**, not per-selector: a file that removes the outline must contain at least one `:focus-visible { outline: … var(--color-focus) … }` rule. Sufficient for our model (the base ring lives once in `global.css`; component CSS that opts out must re-establish it in the same file). A selector-precise pairing check is intentionally out of scope.
- **Tracked decision — lint scope is `.css` files only (matches the epic AC "Given a CSS file").** The UX spec additionally lists `style=` attribute strings in `*.tsx/*.ts` (CI gate item 1). v1 uses CSS with no inline styles, so this is **not** built here; if inline styles are ever introduced, add an ESLint `no-restricted-syntax` rule on JSX `style` literals. Recorded so it is a deliberate boundary, not a silent gap.
- **Deferred gates (NOT this story, per epics Notes 14/18 & C.14):** axe-core, contrast-regression computation from the token source, Playwright forced-colors / reduced-motion / 200%-zoom, and the bundle-size budget all arrive with the rendered list view in Story 1.6. The CI comment was updated to reflect that the token-name lint has landed and these remain deferred.
- **Dependencies added (`apps/web` devDependencies):** `stylelint@^17.13.0`, `stylelint-config-standard@^40.0.0` (only new deps; no runtime deps). Recorded per the Story 1.2 pinning discipline.
- **Engine note (carried from 1.2):** all tooling run under Node 24 (`.nvmrc` pins it); the web lint/build is pure JS but the backend regression suite needs Node 24 for the `better-sqlite3` native binary (ABI 137).
- **No new runtime behavior / no API/contract/DB changes** — frontend-only, additive (plus the CI gate). The walking-skeleton App still renders loading/empty/list states; the real shell + recipes remain Story 1.6.

### File List

**Created**
- `apps/web/src/styles/tokens.css`
- `apps/web/src/styles/global.css`
- `apps/web/stylelint.config.js`
- `apps/web/stylelint-plugins/focus-visible-pairing.js`
- `apps/web/scripts/verify-token-lint.mjs`

**Modified**
- `apps/web/package.json` (added `stylelint` + `stylelint-config-standard` devDeps; `lint:css` + `lint:css:selftest` scripts)
- `apps/web/src/main.tsx` (import `./styles/global.css` instead of `./index.css`)
- `apps/web/src/App.tsx` (removed skeleton `<h1>`; comment update — no heading hierarchy in v1)
- `package.json` (root `lint:css` + `lint:css:selftest` passthrough scripts)
- `package-lock.json` (new devDependencies)
- `.github/workflows/ci.yml` (CSS token-name lint + self-test steps; updated gate comment)

**Deleted**
- `apps/web/src/index.css` (migrated into `styles/tokens.css` + `styles/global.css`)

## Change Log

| Date       | Change                                                                 |
|------------|------------------------------------------------------------------------|
| 2026-06-18 | Story 1.3 created — comprehensive context engine analysis; status → ready-for-dev. |
| 2026-06-18 | Implemented Tasks 1–7: `tokens.css` committed semantic token set, `global.css` base layer + `:focus-visible` ring, removed `index.css`/skeleton `<h1>`, stylelint token-name lint (literal-color / off-scale-px / semantic custom-property names) + local `tlf/focus-visible-pairing` plugin, CI gate + self-test (10/10), root passthrough scripts. typecheck + lint:css + selftest + eslint + web build + Vitest 22/22 all green under Node 24. Status → review. |
