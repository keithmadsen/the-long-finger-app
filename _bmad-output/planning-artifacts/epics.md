---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - docs/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
---

# the long finger - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for **the long finger** (a single-user MVP Todo App), decomposing the requirements from the PRD, the UX Design Specification, and the Architecture decision document into implementable stories.

Source documents:
- **PRD** (`docs/prd.md`, final 2026-06-15) — 10 functional requirements, 6 non-functional requirements, 7 non-goals.
- **Architecture** (`architecture.md`) — React/Vite + Fastify clean-architecture + SQLite, packaged as a single Docker image; clean-architecture skill is the authoritative backend pattern.
- **UX Design Specification** (`ux-design-specification.md`) — 4 terminal primitives + 8 recipes, full semantic design-token system, capture-and-confirm defining interaction, WCAG 2.2 AA accessibility contract.

## Requirements Inventory

### Functional Requirements

- **FR-1: View Todo List.** The Primary User can view all Todo Items. On load the app fetches persisted items; the list shows both Active and Completed Todo Items in canonical order (`completed` ascending — active before completed — then `updatedAt` descending). The list does not reorder mid-session; canonical order is re-applied on the next page load. An empty state with an affordance to create the first item is shown when no items exist.
- **FR-2: Distinguish Completion Status.** The user can visually distinguish Active from Completed Todo Items. Completion is conveyed by an accessible control/label, never color alone, and remains understandable at desktop and mobile widths.
- **FR-3: Create Todo Item.** The user can create a Todo Item with a short description. Create control is on the main view; empty/whitespace-only descriptions are rejected client-side; descriptions are 1–200 characters (enforced submit limit). A successful create appears without a full page reload; the backend persists before the UI treats it as confirmed. The rendered list displays up to two lines (~60–90 visible chars) with ellipsis truncation; the full description is always persisted (Option A).
- **FR-4: Complete Todo Item.** The user can mark an Active item complete; status updates in the backend and the UI reflects it after confirmation. The item stays visible; within a session it is de-emphasised in place and re-sorted into canonical order only on next load.
- **FR-5: Uncomplete Todo Item.** The user can mark a Completed item active again; status updates in the backend and the UI reflects it after confirmation. Within a session the item stays in place; on next load canonical ordering re-applies and the now-active item rejoins the Active group by `updatedAt` descending.
- **FR-6: Delete Todo Item.** The user can permanently delete a Todo Item (hard delete; no undo/archive — NG-6). Deletion removes it from the backend and from the list after confirmation; deletion is idempotent (deleting an already-removed item is success). Failed deletion keeps the item visible with an error message.
- **FR-7: Loading State.** The app shows a loading state while the initial list request is in progress, without layout shift that prevents immediate use once data loads.
- **FR-8: Error State.** The app shows recoverable error states for failed initial load (error + retry) and for failed create/complete/uncomplete/delete (error near the action or in a consistent alert region). Failed mutations preserve the last backend-confirmed list state.
- **FR-9: Persist Todo Items.** The backend persists Todo Items across browser refreshes and backend restarts (given the configured store is available). Data loss from normal flows is a blocking defect.
- **FR-10: Expose Todo API.** The backend exposes `GET /todos` (canonical order), `POST /todos`, `PATCH /todos/{id}` (completion only), `DELETE /todos/{id}`. `POST` accepts a client-generated UUIDv7 id in the body and is idempotent on that id (no duplicates on retry). `DELETE` is idempotent (204 whether or not the row existed). The API returns validation errors for invalid descriptions. Description editing after create is out of scope (NG-7).

### NonFunctional Requirements

- **NFR-1: Responsiveness.** Confirmed create/complete/uncomplete/delete actions update the visible list within 300 ms of the backend response under normal local conditions. *(UX tightens: p50 submit latency ≤100 ms, p95 ≤800 ms — binds backend choice, deploy region, middleware.)*
- **NFR-2: Initial load performance.** Initial list view usable within 1 s for up to 100 items under normal local conditions. *(UX tightens: TTI ≤1 s on slow 3G — binds frontend bundle size and backend cold-start.)*
- **NFR-3: Accessibility.** Core actions are keyboard reachable and screen-reader understandable; completion status does not rely on color alone. *(UX target: WCAG 2.2 Level AA, AAA where naturally achieved.)*
- **NFR-4: Responsive layout.** Supports viewport widths from 320 px to desktop without overlapping controls or clipped task text. *(UX: single 640 px breakpoint.)*
- **NFR-5: Maintainability.** Frontend, backend, and persistence responsibilities are separated enough that API behavior can be tested independently from the UI. *(Architecture: clean-architecture layering handlers → services → domains → repositories.)*
- **NFR-6: Reliability.** Failed backend operations do not corrupt the persisted list or silently discard confirmed changes. *(Architecture: durable storage with atomic single-item writes.)*

### Additional Requirements

*(From the Architecture decision document — technical/infrastructure requirements that shape implementation. Starter template requirement is noted prominently as it drives Epic 1, Story 1.)*

- **AR-1 (Starter / Repo init — Epic 1 Story 1):** Workspace monorepo. Frontend from the official Vite `react-ts` template (`apps/web`); backend hand-scaffolded to the clean-architecture pattern (`apps/api`); shared contracts package (`packages/contracts`, `@tlf/contracts`). Root `package.json` with `"workspaces": ["apps/*", "packages/*"]`, `tsconfig.base.json`.
- **AR-2 (Stack & runtime):** TypeScript both layers; Node.js 24 Active LTS (runtime + Docker base). Backend: Fastify v5, `@fastify/awilix` + `awilix` cradle DI, `better-sqlite3` v12+. Frontend: React + Vite, TanStack Query v5, `uuid` (v7).
- **AR-3 (Persistence):** SQLite single `todos` table; UUIDv7 TEXT PK; snake_case columns; `created_at`/`updated_at` ISO-8601 server-set; `completed` INTEGER 0/1. `CREATE TABLE IF NOT EXISTS` on startup, WAL + pragmas. Canonical-order query (`completed ASC, updated_at DESC`). `db/` is the documented migration extension point.
- **AR-4 (Contracts & validation):** TypeBox schemas in `@tlf/contracts` are the single source of truth — emit Ajv runtime validation, TS types, and the OpenAPI document. Both apps import contract types; no hand-written parallel types. Validation occurs only at the API boundary.
- **AR-5 (API surface & format):** REST four endpoints + `GET /health`. No success envelope (resources returned directly). Uniform error envelope `{ "error": { "code", "message", "details"? } }` on every non-2xx; status codes 400 (validation w/ field details), 404 (PATCH missing id), 500. camelCase JSON; snake_case↔camelCase translation confined to the repository mapper. OpenAPI via `@fastify/swagger`.
- **AR-6 (Frontend state & patterns):** TanStack Query — `useQuery(['todos'])` for the list, `useMutation` for create/toggle/delete. Mandatory optimistic-mutation shape for all three mutations: `onMutate` cancel→snapshot→optimistic update, `onError` rollback, `onSettled` invalidate `['todos']`. Client generates UUIDv7 for create. Local UI state via `useState`/`useReducer`; no router; refetch-on-focus for multi-tab reconciliation. *(Note: the UX spec's honest-pending model and the architecture's optimistic-UI default must be reconciled during story creation — see open question below.)*
- **AR-7 (Packaging & deployment):** Single multi-stage Docker image (Node 24 base) — build `apps/web` + compile `apps/api`, final stage runs Fastify serving the built static frontend via `@fastify/static`. Config via env vars `PORT`, `DATABASE_PATH` (SQLite on a mounted volume → FR-9 durability across restarts).
- **AR-8 (Security/hardening):** No auth in v1 (boundary kept open via repository + room for `owner_id`). Input validation is primary defense. `@fastify/helmet` baseline headers, body size limit. Dev-only permissive CORS for the Vite dev origin (same-origin in prod).
- **AR-9 (CI/CD & observability):** GitHub Actions on every PR — type-check, Vitest unit + integration (separate projects), Playwright E2E + contrast-regression gate. Add a bundle-size budget check (`size-limit`/bundlesize) to enforce NFR-2 (flagged as a gap to close). pino structured logging with per-request id + latency; `/health` liveness.
- **AR-10 (Code organization & testing layout):** Backend layers `routes/ handlers/ services/ domains/ repositories/`; kebab-case files with role suffixes; factory functions named for output (no `create` prefix). Frontend components PascalCase, hooks camelCase. Unit tests co-located (`src/**/*.test.ts`); integration in `apps/api/test/integration/`; E2E in `apps/web/e2e/`. Vitest workspace with `unit`/`integration` projects.

### UX Design Requirements

*(From the UX Design Specification — first-class actionable work items. Each is scoped to be testable.)*

- **UX-DR1: Design token system (`tokens.css`).** Implement the committed semantic CSS custom-property tokens: surfaces (`--color-surface` `#FAFAF7`, `--color-surface-muted`, `--color-surface-hover`, `--color-on-surface` `#1A1A18`, `--color-on-surface-muted` `#5A5954`), accents (`--color-border`, `--color-divider`, `--color-accent` `#3D5A80`, `--color-focus`, `--color-error` `#A02D2D`), typography tokens, spacing scale (`--space-1`..`--space-6`, 4 px base), `--row-height-touch` 48 px, radius (`--radius-none`, `--radius-sm`), `--border-width-thin`, motion tokens. No literal color names. Light theme only; dark mode deferred but structured as a `prefers-color-scheme` redefinition.
- **UX-DR2: Typography system.** System-font stack (no downloads); 3-step scale (`--font-size-item` 16 px, `--font-size-secondary` 14 px, `--font-size-micro` 12 px); 3 weights (400/500/600); line-heights; `html { color-scheme: light; text-size-adjust: 100%; }`. No heading hierarchy (no user-facing `<h1>`–`<h3>`); strikethrough reserved for completion.
- **UX-DR3: `<Button>` primitive.** Focus ring via `:focus-visible`, hit area ≥44 px, disabled + pending states, `aria-pressed`/`aria-busy`/`aria-disabled` support.
- **UX-DR4: `<TextInput>` primitive.** ≥16 px font-size (prevents iOS zoom), controlled value, `maxLength` support, validated submit on Enter, `aria-describedby`. Radix-aligned props (`value`/`onChange`/`onSubmit`).
- **UX-DR5: `<Checkbox>` primitive.** Visually-hidden native `<input type="checkbox">` with styled `::before` label for cross-browser visual; checked state survives forced-colors. Radix-aligned props (`checked`/`onCheckedChange`).
- **UX-DR6: `<LiveRegion>` primitive.** Single page-wide `role="status" aria-live="polite"` singleton owned by `<App>`; imperative `announce(message)` API; never assertive in v1.
- **UX-DR7: `<App>` recipe (page shell).** `--color-surface` to viewport edges, content centred in `max-width: 640px`; owns the single `<LiveRegion>`, the reactive task-count-aware `<title>`, and the `beforeunload` handler. Loading / loaded / load-failed states.
- **UX-DR8: `<CaptureInput>` recipe.** Always-present, always-focused input at the top (first-interactive-element invariant, enforced by a stable test selector + CI integration assertion). Empty-submit suppression, rapid-Enter duplicate protection, 200-char `maxLength`, calm placeholder that disappears on focus, input clears + refocuses on submit (not on confirm), Esc clears.
- **UX-DR9: `<CharCounter>` recipe.** `N/200` counter below the input; hidden when length <180, visible when ≥180.
- **UX-DR10: `<UnreadErrorIndicator>` recipe.** Focusable button right of the input showing `"N error(s) above"`; on Enter scrolls to and focuses the first failed row's Retry; clears on resolution. 14 px / weight 500 / `--color-error`.
- **UX-DR11: `<EmptyState>` recipe.** Conditional instruction line above input (`Type a task and press Enter…`, fades after first task, does not return), persistent state line below input (`Your list will appear here.`), dashed divider when truly empty; loading variant (`Loading…`) and failed-load variant (error-coloured). Owns instruction-line fade + state-line space reservation (no layout jump).
- **UX-DR12: `<TodoList>` recipe.** Ordered list (`role="list"`) of `<TodoItem>`; owns canonical-order render on fresh GET + in-place rule during session; coordinates the single-row-armed-delete state (`isArmed` prop + `requestArm`/`requestDisarm`). Empty / populated / loading.
- **UX-DR13: `<TodoItem>` recipe + state machine.** Row composing `<Checkbox>` + text + delete affordance; whole-row tap target via wrapping `<label>`; 2-line ellipsis truncation; visual variants Active / Complete / Pending / PendingToggle / Failed / ArmedDelete / Committing per the committed variant-mapping table; `role="listitem"` with roving-tabindex anchor; owns the 10 s wall-clock pending timeout and per-row `AbortController` for Dismiss.
- **UX-DR14: `<DeleteAffordance>` recipe (inline two-step delete).** `Delete` → `Confirm` arm-then-confirm; 300 ms no-commit window; 5 s auto-revert; `aria-pressed` armed state; accessible-name change (`"Confirm deletion of '{task}', press again within 5 seconds…"`); reverts on tap-elsewhere/blur/arming another row; forced-colors label-only fallback. Idle affordance always-visible on touch, reveal-on-hover on pointer.
- **UX-DR15: Capture-and-confirm honest-pending model.** `aria-busy="true"` at t=0; visual pending treatment delayed to ~150 ms flicker threshold with minimum-hold; pending visual is muted-text contrast shift only (no spinner/shimmer/italic/position-shift); pending→settled via `--motion-settle`; concurrent in-flight submits independent; 10 s timeout → inline error. *(This is committed as non-negotiable for v1 and must be reconciled against AR-6 optimistic-UI — see open question.)*
- **UX-DR16: Completion visual treatment.** Three redundant non-color cues: strikethrough + checkbox checked state + contrast shift to `--color-on-surface-muted`.
- **UX-DR17: Hybrid completed-item placement.** De-emphasise in place during a session; sink below active on next load; on-load reorder is silent (no LiveRegion announcement). Symmetric for uncomplete of sunk items.
- **UX-DR18: Failed-create recovery treatment.** Left-border bar `4px solid var(--color-error)`, empty checkbox slot, full-contrast user text, Retry + Dismiss text affordances, `aria-describedby` hidden text, `beforeunload` confirmation while any row is failed; LiveRegion announces failure once with submitted text. Failed rows not persisted across reload.
- **UX-DR19: LiveRegion announcement patterns.** Committed polite announcements: task added (`"{desc} added."`), completed, uncompleted, deleted, create failure, mutation failure (refetch reconcile), load failure. Verb + minimal-disambiguator rule; no re-announce on repeated same-submit failure.
- **UX-DR20: Top-of-page chrome = none inside app.** No wordmark/header inside the surface (first-interactive-element invariant). Task-count-aware browser `<title>` (`"the long finger (N active)"`); favicon asset in `--color-accent` on `--color-surface`.
- **UX-DR21: Motion system.** `--motion-instant` 120 ms, `--motion-settle` 220 ms, `--motion-none` 0 ms (unaffected by reduced-motion), single easing curve; no celebratory/layout-shift motion; reduced-motion collapses all but `--motion-none` to 0 ms; focus ring via `:focus-visible` only.
- **UX-DR22: Layout stability.** Single column, max-width 640 px, paper-to-the-edges ≥640 px; fixed per-state row height; nothing reflows on toggle; pending→settled affects color only; instruction-line disappearance and state-line `min-height: 1lh` reservation.
- **UX-DR23: Responsive & touch/pointer affordances.** Single 640 px breakpoint (mobile fills width w/ 16 px padding; ≥640 px centred w/ 32 px padding + hover states). Touch targets ≥48 px. Delete affordance always-visible on touch, reveal-on-hover on pointer via `@media (hover: hover)`.
- **UX-DR24: Keyboard navigation (roving tabindex).** Committed keyboard contract: Tab input→list anchor→exit; Arrow Up/Down between rows (no wrap); Space/Enter toggles focused row; Escape clears input text / returns focus to input from list / returns to anchor from delete; Home/End first/last row; Shift+Tab from first row → input. One focusable row anchor at a time. Cmd/Ctrl+Z is an app-level no-op (browser default in input only).
- **UX-DR25: Screen-reader contract.** Single live region; `aria-busy` pending semantic; failed-row `aria-describedby`; armed-delete accessible name; pending/failed rows `aria-disabled` (not HTML disabled); `role="list"`/`role="listitem"`; plain-text empty/loading states (no extra aria-live); no extra landmarks.
- **UX-DR26: Forced-colors / high-contrast / reduced-motion handling.** Focus ring via `outline` survives forced-colors; completion cues degrade gracefully; `prefers-contrast: more` resolves muted→full-contrast; pending then rests on `aria-busy`; armed-delete signal via label change. Reduced-motion preserves safety timers (5 s / 300 ms).
- **UX-DR27: WCAG 2.2 AA conformance.** Meet the enumerated success criteria (1.4.3/1.4.4/1.4.10/1.4.11/1.4.12, 2.1.1/2.1.2, 2.4.3/2.4.7, 2.5.5/2.5.8, 3.3.1/3.3.4, 4.1.2/4.1.3). AAA text contrast on primary surface; 48 px targets.
- **UX-DR28: CI test gates (UX-enforced).** Token-name lint (forbid literal colors, off-scale px, `outline: none` without paired `:focus-visible`); contrast-regression computation from token source + axe-core (0 serious/critical); Playwright forced-colors, reduced-motion, and 200% zoom (1280×800) emulation gates; manual NVDA + VoiceOver screen-reader smoke test before each release.
- **UX-DR29: Performance contracts.** TTI ≤1 s on slow 3G; p50 submit ≤100 ms, p95 ≤800 ms; initial GET p95 ≤800 ms; wall-clock pending timeout survives sleep/backgrounding; no offline mode; multi-tab stale-only reconciliation.

### FR Coverage Map

*(Restructured 2026-06-15 after party-mode review: complete/uncomplete pulled into Epic 1 so it ships a usable list — value over load-balance, per Keith's call. Delete kept as its own focused epic.)*

- **FR-1** (View Todo List): Epic 1 — list view, canonical order, empty/loading states.
- **FR-2** (Distinguish Completion Status): Epic 1 — non-color completion cues (shown alongside complete/uncomplete).
- **FR-3** (Create Todo Item): Epic 1 — capture-and-confirm, 1–200 validation.
- **FR-4** (Complete Todo Item): Epic 1 — in-place de-emphasis + next-load re-sort.
- **FR-5** (Uncomplete Todo Item): Epic 1 — symmetric placement behavior.
- **FR-6** (Delete Todo Item): Epic 2 — inline two-step delete, idempotent.
- **FR-7** (Loading State): Epic 1 — initial-load state.
- **FR-8** (Error State): Epic 1 (initial-load + create + toggle errors) & Epic 2 (delete errors) — error paths owned by the epic that owns the action.
- **FR-9** (Persist Todo Items): Epic 1 — SQLite, verified across process restart against a real on-disk file; container-volume + crash-recovery verified in Epic 3.
- **FR-10** (Expose Todo API): Epic 1 (GET /todos, POST /todos, PATCH /todos/{id}, /health) & Epic 2 (DELETE /todos/{id} idempotency).

**NFR coverage:** NFR-1/NFR-2 (performance) enforced from Epic 1 (latency assertion on POST, bundle-size budget, pino latency logging), full k6 sign-off in Epic 3. NFR-3 (accessibility) per-control contract ships with each control in Epics 1–2 (capture + toggle in Epic 1, delete in Epic 2); list-wide roving tabindex + consolidated SR contract + verification gates in Epic 3. NFR-4 (responsive) App shell in Epic 1, full verification in Epic 3. NFR-5 (maintainability) embedded via clean-architecture layering throughout. NFR-6 (reliability) Epic 1 persistence + create/toggle error handling, Epic 2 delete error handling, crash-recovery in Epic 3.

## Epic List

### Epic 1: Capture, View & Complete Your List
A user opens the app, sees their task list (loading / empty / populated in canonical order), adds tasks by typing and pressing Enter, and checks them complete or active again — all persisted across refresh and backend restart, and running as a deployed container they can actually use. This is the **smallest genuinely usable single-user todo list** (capture + view + complete + persist), not a foundation with no payoff. Establishes the walking skeleton (workspace monorepo, the complete `@tlf/contracts` surface, design-token system, the 4 primitives, SQLite repository with canonical ordering on the read path), the capture-and-confirm input, the shared honest-pending mutation pattern, complete/uncomplete with non-color cues and hybrid placement, create + toggle error recovery, and a thin Docker deploy.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, FR-9, FR-8 (initial-load + create + toggle error paths), FR-10 (GET /todos, POST /todos, PATCH /todos/{id}, /health)

### Epic 2: Safe Delete
A user permanently removes tasks via the inline two-step arm-then-confirm affordance (300 ms no-commit window, 5 s auto-revert), with the full screen-reader contract for that interaction authored alongside it, an idempotent DELETE endpoint, and recoverable delete errors. Completes full CRUD and closes the Core Task Loop. Delete is isolated into its own epic because it is the most delicate, highest-risk interaction in the app — irreversible (NG-6), with safety coming entirely from the interaction design — and deserves focused attention and its own "feeling-safe" acceptance criteria rather than being bundled with the happy-path loop.
**FRs covered:** FR-6, FR-8 (delete error path), FR-10 (DELETE /todos/{id} idempotency)

### Epic 3: Production Readiness & Delivery
Hardens the running app into a fully accessible, shippable product: list-wide keyboard navigation (roving tabindex), the consolidated screen-reader contract, responsive verification across 320 px–desktop, forced-colors / reduced-motion support, the expanded CI quality-gate suite (full contrast matrix, Playwright forced-colors/reduced-motion/200%-zoom, gating manual NVDA + VoiceOver smoke), k6 latency sign-off, hardened Docker packaging (static-serving security headers), and durable-volume + crash-recovery verification.
**FRs covered:** none new — hardens FR-1…FR-10. **Primary:** NFR-1, NFR-2, NFR-3, NFR-4, NFR-5, NFR-6

### Notes carried into story creation

**DECIDED — honest-pending (UX-authoritative), binding on all three mutations.** The Architecture AR-6 "optimistic-update-with-rollback" wording is superseded by UX-DR15's honest-pending model, which the UX spec commits as non-negotiable for v1 and which aligns with the PRD ("the backend persists before the UI treats it as confirmed", FR-3). Create + toggle (Epic 1) and delete (Epic 2) use the **same** model: `aria-busy="true"` at t=0, visual pending treatment delayed to the ~150 ms flicker threshold with minimum-hold, settle on confirm. TanStack Query supplies the cache/retry/rollback *machinery* (`onMutate`/`onError`/`onSettled`, invalidate `['todos']`) — it drives a **pending** state, not an optimistic one. *(If real-world p95 latency later forces a revisit, that is a PRD revision per the UX spec, not a per-story call.)*

> **✅ Source-doc blocker RESOLVED (2026-06-15, raised by Amelia in party-mode):** `architecture.md` previously mandated the optimistic-mutation shape in `MUST` language, contradicting this honest-pending decision. Since a dev-agent loads `architecture.md` (not these notes), the source was patched: Decision Priority Analysis, Frontend Architecture, Process Patterns, Enforcement Guidelines, and Pattern Consistency now specify honest-pending (TanStack Query machinery unchanged; only the rendered in-flight semantics differ). Traced via `architecture.md` frontmatter `amendmentNote`. The two planning docs no longer conflict on the mutation model.

#### A. Cross-cutting patterns to establish ONCE in Epic 1 (inherited by Epics 2–3)
1. **Honest-pending as a shared, named mutation pattern** — one reusable mutation-hook shape + one pending-UI convention the primitives understand (effectively a fifth pattern alongside the four primitives). Epic 2 *consumes* it; it is never re-derived. The thresholds (150 ms flicker, minimum-hold, 10 s timeout) must be **clock-injectable / configurable**, not hardcoded `setTimeout`, so the timing is deterministically testable with fake timers (see §C note 15). The pattern must define the per-mutation **in-flight interaction contract** up front: is the affected control `aria-disabled` while pending; can a second toggle be queued on a row already mutating; what happens when a delete is in flight and a complete arrives on the same row (and vice versa); how concurrent independent submits coexist. Define these once so Epic 2's toggle/delete inherit them rather than improvising.
2. **One error taxonomy + one client recovery mapping** — the `errorEnvelope` shape in `@tlf/contracts` and a single client-side `HTTP status → user-facing recovery affordance` map, defined in Epic 1. Prevents fragmented error UX and a fragmented SR announcement contract later.
3. **Complete `@tlf/contracts` surface up front** — `todoSchema`, `createTodoBody`, `patchTodoBody`, `errorEnvelope` all defined in Epic 1 even though PATCH/DELETE wire up later. Treat the package as **append-mostly**: any Epic-2 schema revision is an explicit, reviewed event, not an incidental edit (it also drives OpenAPI + types).
4. **Injectable DB path** — the awilix registration must let a test construct the repository with a temp-dir SQLite file path *without* swapping the repository implementation. Make this an architectural acceptance criterion of the repo story — it's what makes the FR-9 durability test honest.
5. **UUIDv7 client-id ownership** — the client owns identity *before* server confirm; named at the intersection of the create story and the pending pattern (it's *why* there's no id reconciliation on success and how the pending row already has its final id / cache key). No story may assume server-assigned ids.
6. **Canonical order on the read path** — `completed ASC, updated_at DESC` lives in the Epic 1 repository / `GET /todos` story (it's FR-1, not FR-4). Do **not** defer ordering to the toggle work, or `GET /todos` ships unordered and Epic-1 tests assert insertion order.
7. **Primitive a11y baseline in Epic 1** — the four primitives are built keyboard-*ready* (focusable, correct roles, no tabindex traps, `:focus-visible` ring) with their full prop surface, e.g. `<Checkbox>` ships `checked`/`onCheckedChange` even where Epic 1 only passes a static `checked`. Epic 3 adds only the *roving* coordination + SR announcements on top — it must not need to reopen the primitives.
8. **First-interactive-element invariant as a CI tripwire from Epic 1** — a stable test selector + integration assertion that the capture input is the first interactive element, re-checked at every epic gate (not a final-epic audit). Guards "capture is sacred" continuously as Epic 1 (toggle controls) and Epic 2 (delete button) add interactive elements.

#### B. Epic 1 story slicing (heaviest epic — keep each story dev-agent-sized)
9. **Walking skeleton is its own first story** — a trivial vertical round-trip (one endpoint, one rendered value, one row read from a real on-disk SQLite file) and *nothing else*, so DI scoping / static-serving wiring is debugged separately from UI work. Real list rendering + capture layer on after.
10. **Split the primitive batch** — (a) tokens + typography, (b) `Button` + `TextInput`, (c) `Checkbox` + `LiveRegion`. One fat "4 primitives + tokens" story is too big for one dev-agent context.
11. **Build `<TodoItem>` toward its near-complete state machine in Epic 1** — Active / Complete / Pending(create) / PendingToggle / Failed(create), the whole-row `<label>` toggle target, and 2-line truncation all land in Epic 1 (toggle is now Epic 1). Decide the `<label>`-wrap DOM here so Epic 2 only *adds* the `ArmedDelete` / `Committing` variants + the delete button's `stopPropagation` — it must not rewrite the row markup.
12. **Stage failed-create recovery late in Epic 1, and split it** — UX-DR18 bundles `beforeunload`, `AbortController`, `aria-describedby`, LiveRegion failure-announce, *and* `<UnreadErrorIndicator>` (UX-DR10). At minimum split `<UnreadErrorIndicator>` (its own scroll/focus AC) into a separate story. Sequence the whole recovery flow *after* happy-path create + basic error, so the core capture loop ships even if recovery polish slips (the spec marks this model "provisional pending real-world data").
13. **Thin Docker deploy is the last story of Epic 1** (per Keith's value call) — basic single-image packaging + `@fastify/static` so the app runs as a real container. This surfaces SQLite-persistence-in-a-container problems while the skeleton is fresh; Epic 3 *hardens* it (security headers, CSP). Re-deploy at each epic's end.

#### C. Continuous enforcement (gates + perf from Epic 1)
14. **CI gate scaffolding starts in Epic 1** — token-name lint + minimal axe-core / contrast check from the first commit; the **bundle-size budget is a ratcheting gate** (catch growth vs. last commit), freezing an absolute ceiling only once Epic 1's UI is complete; sequence the bundle-gate story *after* the first `apps/web` build exists. Epic 3 broadens gates (full contrast matrix, forced-colors, reduced-motion, 200%-zoom, gating manual NVDA/VoiceOver smoke).
15. **NFR-1 latency assertion from Epic 1** — a cheap integration-level percentile check on the POST path (logging is not a gate); k6-against-the-container reserved for Epic 3 sign-off. pino per-request latency logging exists from the first endpoint.
16. **Concurrent independent in-flight submits get coverage in Epic 1** — rapid-fire capture is *the* primary flow ("the long finger" = dump tasks fast); add an integration + e2e test in Epic 1. Caveat: `better-sqlite3` is **synchronous**, so writes are serialized + idempotent-on-id — no story AC may claim *parallel* POST execution.

#### D. Epic 2 (Safe Delete) specifics
17. **Two-step delete is its own story with "feeling-safe" acceptance criteria** — the 300 ms no-commit window and 5 s auto-revert are **non-negotiable AC**, written in the language of feeling safe, not state transitions; do not bundle delete with error handling such that timing-feel gets value-engineered out.
18. **The screen-reader contract for the delete affordance is authored + tested in Epic 2** (armed-state accessible name, `aria-pressed`, LiveRegion announcement, focus not stranded when the row reverts) — not deferred to Epic 3. Epic 3 stays the *gate*; Epic 2 owns the *behavior*.
19. **Idempotent-DELETE tests cover state-machine races**, not just "DELETE twice → 2xx": DELETE during the 300 ms window; DELETE racing the 5 s auto-revert; refresh/navigate mid-window.

#### E. Epic 3 (Production Readiness) specifics
20. **Crash-mid-write durability** — beyond container-volume restart, add a SIGKILL-mid-POST → restart → assert-WAL-recovery test to the Epic 3 restart story (NFR-6).
21. **List-wide a11y only** — roving tabindex across the list, consolidated SR contract, responsive/forced-colors/reduced-motion verification sweeps, hardened static-serving security headers. Per-control a11y already shipped with its control in Epics 1–2.
22. **Don't write acceptance criteria you can't verify in-epic.** `@fastify/helmet` on the API can be asserted by Epic 1 integration tests, but helmet on the **static-serving layer** only exists once the container packages the built frontend — its first real verification point is Epic 3's Docker story (and the thin deploy in Epic 1 note 13). Keep the prod static-serve header AC in Epic 3; do not phrase an Epic 1 AC that has no enforcement point yet.

---

## Epic 1: Capture, View & Complete Your List

A user opens the app, sees their task list (loading / empty / populated in canonical order), adds tasks by typing and pressing Enter, and checks them complete or active again — all persisted across refresh and backend restart, and running as a deployed container they can actually use. Stories are ordered so each depends only on earlier ones.

### Story 1.1: Monorepo scaffold & walking skeleton

As a developer on the team,
I want a workspace monorepo with one thin vertical slice wired through every layer,
So that the architecture's wiring (DI, dev proxy, SQLite connection, build, CI) is proven correct before any feature is built on it.

**Acceptance Criteria:**

**Given** a clean checkout, **When** I run the documented install and dev commands, **Then** `apps/web` (Vite `react-ts`) and `apps/api` (Fastify) both start **And** the Vite dev server proxies `/todos` and `/health` to the Fastify process.
**Given** the api is running, **When** I request `GET /health`, **Then** it returns 200 with a liveness payload.
**Given** the api is running, **When** I request `GET /todos`, **Then** it returns 200 with `[]` read from a real on-disk SQLite file (not in-memory) via a repository constructed through the awilix cradle.
**Given** the web app is open in a browser, **When** the page renders, **Then** it fetches `GET /todos` and displays the (empty) result — confirming the full client → proxy → Fastify → repository → SQLite → client round-trip.
**Given** a pull request, **When** CI runs, **Then** it executes type-check and the Vitest unit + integration project wiring and blocks merge on failure.
**Given** the workspace, **When** inspected, **Then** it matches AR-1/AR-10 (`apps/web`, `apps/api` with `routes/handlers/services/domains/repositories`, `packages/contracts`, `tsconfig.base.json`, root workspaces manifest) **And** contains no feature code beyond this skeleton slice.

### Story 1.2: Todo contracts, schema & repository (real read path)

As a developer on the team,
I want the complete shared Todo contract, the SQLite schema, and a repository that returns todos in canonical order from durable storage,
So that both apps share one source of truth and the read path is correct and persistent before any UI consumes it.

**Acceptance Criteria:**

**Given** `@tlf/contracts`, **When** built, **Then** it exports TypeBox schemas `todoSchema`, `createTodoBody`, `patchTodoBody`, `errorEnvelope` and their derived types, importable by both apps (the full surface is defined now even though PATCH/DELETE wire up later).
**Given** app startup, **When** the database opens, **Then** `CREATE TABLE IF NOT EXISTS todos (...)` runs with `id` TEXT PK, `description` TEXT, `completed` INTEGER, `created_at` TEXT, `updated_at` TEXT **And** WAL + pragmas are set.
**Given** todos with mixed completion and update times, **When** the repository lists them, **Then** rows return in canonical order `completed ASC, updated_at DESC`.
**Given** the repository, **When** it maps rows, **Then** snake_case↔camelCase translation and the `completed` 0/1↔boolean coercion happen ONLY in the repository mapper, with no leakage into handlers/services/domains.
**Given** `GET /todos`, **When** called, **Then** it returns the canonically-ordered `Todo[]` as camelCase JSON with no success envelope.
**Given** the repository is constructed with an injectable database-file path, **When** a test supplies a temp-dir path, **Then** it uses that file without swapping the repository implementation.
**Given** the repository writes a row, **When** it persists, **Then** the server sets `created_at` and `updated_at` (any client-supplied timestamp is ignored) **And** `updated_at` is set on every write.
**Given** an `id` that already exists, **When** the repository is asked to insert it again, **Then** it does not create a second row (insert is idempotent on `id`) — the endpoint-level contract for this is asserted in Story 1.7.
**Given** todos written to the on-disk file, **When** the api process stops (closing the DB handle / checkpointing WAL) and restarts against the same file, **Then** the todos are still present (FR-9 durability, real file — the handle is closed before the assertion so the read is not served from an in-process cache).

### Story 1.3: Design tokens & typography foundation

As a developer on the team,
I want the semantic design-token system and typography foundation with lint enforcement,
So that every component draws from one calm visual vocabulary and color/focus regressions are blocked automatically.

**Acceptance Criteria:**

**Given** `tokens.css`, **When** defined, **Then** it contains the committed semantic tokens (surfaces, accents, `--color-focus`, `--color-error`, typography, spacing `--space-1..6`, `--row-height-touch` 48px, radius, border, motion) at the committed light-theme values **And** uses no literal color names.
**Given** the global stylesheet, **When** applied, **Then** the system-font stack, `color-scheme: light`, and `text-size-adjust: 100%` are set, the 3-step type scale and 3 weights are available as tokens, **And** no user-facing heading elements are introduced.
**Given** a CSS file, **When** CI runs the token-name lint, **Then** literal color values, off-scale `px`, and `outline: none` without a paired `:focus-visible` rule fail the build.
**Given** any interactive element, **When** it defines focus, **Then** the ring is `outline: 2px solid var(--color-focus); outline-offset: 2px;` applied via `:focus-visible` only.

### Story 1.4: Button & TextInput primitives

As a developer on the team,
I want accessible `<Button>` and `<TextInput>` primitives,
So that recipes compose consistent, keyboard-ready controls without re-implementing focus or input normalization.

**Acceptance Criteria:**

**Given** `<Button>`, **When** rendered, **Then** it exposes `onClick`, `disabled`, `aria-pressed`, `aria-busy`, `aria-disabled`, shows the `:focus-visible` ring, has a ≥44px hit area, and reflects disabled and pending states.
**Given** `<TextInput>`, **When** rendered, **Then** font-size is ≥16px (no iOS zoom), it is controlled (`value`/`onChange`), supports `maxLength`, `placeholder`, `aria-describedby`, and emits a validated submit on Enter (`onSubmit`).
**Given** keyboard-only use, **When** I Tab to either primitive, **Then** focus is visible and operable **And** a mouse click does not show the `:focus-visible` ring.
**Given** the primitives, **When** inspected, **Then** prop names mirror Radix conventions **And** unit tests cover focus, disabled, and submit behavior.

### Story 1.5: Checkbox & LiveRegion primitives

As a developer on the team,
I want `<Checkbox>` and `<LiveRegion>` primitives,
So that completion state has a robust cross-browser visual and the app has a single polite announcement channel.

**Acceptance Criteria:**

**Given** `<Checkbox>`, **When** rendered, **Then** it uses a visually-hidden native `<input type="checkbox">` with a styled `::before` label, exposes the full Radix-aligned prop surface (`checked`, `onCheckedChange`, `disabled`, `aria-label`) even where only a static `checked` is passed, **And** its checked state survives forced-colors mode.
**Given** `<LiveRegion>`, **When** mounted, **Then** exactly one instance exists with `role="status" aria-live="polite"` exposing an imperative `announce(message)` API **And** it is never assertive.
**Given** an announcement is made, **When** it fires, **Then** the message renders into the polite region **And** it does not steal focus.
**Given** unit tests, **Then** Checkbox checked/forced-colors behavior and LiveRegion announce behavior are covered.

### Story 1.6: List view — see your tasks

As the Primary User,
I want to open the app and immediately see my task list, or a clear empty / loading / error state,
So that I always know the current state of my tasks at a glance.

**Acceptance Criteria:**

**Given** the app loads, **When** the initial `GET /todos` is in flight, **Then** a calm "Loading…" state line shows without layout shift that blocks use once data arrives.
**Given** todos exist, **When** the list renders, **Then** items appear in canonical order within a single 640px max-width column, with `--color-surface` extending to the viewport edges at ≥640px.
**Given** a completed todo, **When** displayed, **Then** it shows all three non-color cues (strikethrough + checked checkbox + muted contrast) and is distinguishable from active items without relying on color.
**Given** a description longer than two lines, **When** rendered, **Then** it truncates at two lines with an ellipsis and the row height stays stable per state.
**Given** no todos exist, **When** the list renders, **Then** the empty state shows the persistent state line "Your list will appear here." above a dashed divider, with the state line reserving `min-height` so layout does not jump when the list empties. *(The instruction line arrives with the capture input in Story 1.7.)*
**Given** the initial load fails, **When** the error occurs, **Then** a load-failed state with a retry action shows while preserving a usable layout.
**Given** the active-task count changes, **When** the list renders, **Then** the browser `<title>` reflects "the long finger (N active)" (count omitted at zero).
**Given** the todos returned by `GET /todos`, **When** `<TodoList>` renders, **Then** it renders in the order the backend returned (the SQL query is the canonical-order authority); the frontend does not independently re-sort.
**Given** the list view, **When** CI runs, **Then** axe-core (0 serious/critical), the contrast-regression check, and a ratcheting bundle-size gate all pass.

*Sizing note: this is the heaviest read-side story. It may be delivered as two dev sessions — (a) App shell + `<TodoList>` + `<TodoItem>` display variants + truncation, (b) `<EmptyState>` + loading + load-failed + title-count + CI gates — at the implementer's discretion. The first-interactive-element invariant is NOT asserted here (no capture input exists yet); it is introduced in Story 1.7.*

### Story 1.7: Capture-and-confirm — add a task

As the Primary User,
I want to type a task into an always-present, always-focused input and press Enter to add it,
So that capturing a task is immediate and I'm never left wondering whether it saved.

**Acceptance Criteria:**

**Given** the list view, **When** it renders, **Then** the capture input is the first interactive element in DOM order, already focused, with a calm placeholder, and the empty-state instruction line "Type a task and press Enter to add it to your list." appears above it (and disappears after the first task is created).
**Given** the input has focus, **When** I press Enter on a non-empty, ≤200-char description, **Then** a `POST /todos` fires with a client-generated UUIDv7 id **And** the input clears and refocuses immediately (on submit, not on confirm) so I can type the next task.
**Given** an empty or whitespace-only input, **When** I press Enter, **Then** submission is silently suppressed; **Given** input reaching ≥180 chars, **Then** the `N/200` character counter appears; over-200 is capped at the input.
**Given** the honest-pending thresholds are driven by an injectable clock (not wall-clock `setTimeout`), **When** a submit confirms **before** the flicker threshold fires, **Then** no pending visual is ever painted (the anti-flicker promise); **When** a submit confirms **after** the threshold fires, **Then** the pending treatment appears; **And** these boundaries are unit-tested with fake timers at the threshold edges.
**Given** the pending treatment has become visible, **When** confirmation arrives shortly after, **Then** the pending treatment is held for at least the minimum-hold floor before settling (so it cannot flash-and-vanish) — the hold floor is clock-injectable and tested.
**Given** a pending row, **When** rendered, **Then** the pending treatment is a muted-contrast shift ONLY: no spinner, no shimmer, no italic, no position shift, no size or font-weight change; `aria-busy="true"` is set from t=0 regardless of the visual delay.
**Given** several tasks submitted in a burst, **When** they cross the threshold and resolve raggedly, **Then** each row settles independently on its own confirmation (no shared settle rhythm) — independent settlings are the intended feel.
**Given** the honest-pending pattern, **When** built, **Then** it defines the reusable mutation-hook shape (`onMutate` cancel→snapshot→pending cache write, `onError` rollback, `onSettled` invalidate `['todos']`) and the in-flight interaction contract, so toggle/delete consume it rather than re-derive it.
**Given** a task is confirmed, **When** it lands, **Then** the `<LiveRegion>` announces "{description} added."
**Given** several tasks submitted in rapid succession, **When** their requests are in flight, **Then** each pending item is independent (one's outcome does not affect another) — covered by an integration + e2e concurrent-submit test (writes are serialized + idempotent-on-id; no AC claims parallel execution).
**Given** a `POST /todos` whose client-generated UUIDv7 id already exists (e.g. a retry after timeout), **When** the server handles it, **Then** it returns **200 with the existing Todo** (no duplicate row, not an error) — covered by an explicit duplicate-id integration test, so the Story 1.9 Retry path is safe.
**Given** a successful create, **When** it settles, **Then** the settle is driven by `onSettled` invalidating `['todos']` — NOT by merging the `POST` 201 response body into the cache (the client already owns the final id; no reconciliation path is introduced).
**Given** two creates submitted concurrently where one fails and one succeeds, **When** both resolve, **Then** the success settles without clearing the other's error **And** the failure rolls back only its own row — a mixed-outcome concurrent test asserts no cross-contamination of the shared `['todos']` cache.
**Given** the user has already created at least one task, **When** the list later returns to empty, **Then** the instruction line does NOT reappear (only the persistent state line shows); **And** when the instruction line is removed after the first task, it fades via `--motion-settle` rather than vanishing abruptly.
**Given** the list view with the input, **When** CI runs, **Then** the first-interactive-element invariant assertion passes and is re-checked on changes that add interactive elements.

### Story 1.8: Complete & uncomplete a task

As the Primary User,
I want to check a task complete (and uncheck it) by tapping anywhere on its row,
So that I can mark progress as quickly and naturally as crossing a line off paper.

**Acceptance Criteria:**

**Given** an active todo, **When** I tap anywhere on the row (a wrapping `<label>`) except a future action affordance, **Then** its completion toggles via `PATCH /todos/{id}` with body `{ completed }` only **And** the same honest-pending pattern drives the in-flight state (PendingToggle).
**Given** keyboard focus on a row, **When** I press Space or Enter, **Then** the row toggles (same `<label>` semantics).
**Given** a toggle confirms, **When** complete, **Then** the row shows the three non-color completion cues and the `<LiveRegion>` announces "{description} marked complete."; **When** uncompleted, **Then** it announces "{description} marked active."
**Given** a toggle within a session, **When** it confirms, **Then** the item does NOT move position (in-place hybrid placement); canonical re-sort only happens on the next page load.
**Given** a toggle request fails, **When** the error returns, **Then** the list reconciles to the last backend-confirmed state (refetch), the change does not silently persist, and the `<LiveRegion>` announces the failure once.
**Given** the active count changes from a toggle, **When** it confirms, **Then** the `<title>` count updates (reusing the Story 1.6 effect, not a new implementation).
**Given** a successful PATCH, **When** it persists, **Then** the server sets `updated_at` to the write time, so that on the next page load the toggled item re-sorts into canonical order (this makes the next-load re-sort verifiable).
**Given** a row already has a toggle in flight, **When** the user toggles it again, **Then** the per-row in-flight arbitration defined by the honest-pending pattern applies (it does not fire a conflicting second mutation; the contract from §A-1 is honored) — covered by a toggle-while-pending test. *(Frontend seam: per-row in-flight arbitration lives in `useToggleTodo`/`useDeleteTodo` + `<TodoItem>`; the synchronous backend is intentionally ignorant of it.)*
**Given** the row markup, **When** built, **Then** the whole-row `<label>` DOM structure and roving-tabindex anchor position are established here so Epic 2 only adds the delete affordance without rewriting the row. *(Structural AC — an architectural constraint, not a behavioral test.)*

*Keyboard note: this story owns the wrapping-`<label>` toggle semantics (Space/Enter activate the row via the label). The list-wide roving-tabindex key handling (Arrow/Home/End/anchor `tabindex` management) is owned by Story 3.1 — the two do not duplicate.*

### Story 1.9: Failed-create recovery

As the Primary User,
I want a failed task creation to stay visible with my text intact and a way to retry,
So that a typed task is never silently lost and I can recover without losing my place.

**Acceptance Criteria:**

**Given** a create fails (or its pending state exceeds the ~10s timeout), **When** the failure surfaces, **Then** the row transitions to the Failed variant in place — `4px solid var(--color-error)` left border, empty checkbox slot, the submitted text at full contrast, and Retry + Dismiss text affordances — without overwriting whatever I'm currently typing.
**Given** a failed row, **When** I tap Retry, **Then** the row returns to the pending state and re-attempts; on success it settles, on failure it returns to Failed.
**Given** a failed row, **When** I tap Dismiss, **Then** the row is removed and any in-flight request for it is aborted via its per-row `AbortController`.
**Given** a create failure, **When** it occurs, **Then** the `<LiveRegion>` announces "Couldn't save '{description}'. Use Retry to try again." once (repeated failures of the same submit do not re-announce).
**Given** a failed row exists, **When** it renders, **Then** it carries an `aria-describedby` reference to hidden text explaining the text is saved until retry/dismiss/refresh **And** a `beforeunload` handler is active while any row is in the Failed state.
**Given** a pending create, **When** the ~10s timeout is evaluated, **Then** it is computed against a wall-clock / monotonic deadline (checked on a render tick and on `visibilitychange`), NOT a naive `setTimeout` — so it still fires correctly after a backgrounded tab or laptop sleep (UX-DR29). Tested by injecting the clock and simulating a time jump.
**Given** all failed rows are resolved, **When** the last one clears, **Then** the `beforeunload` handler is detached. *(Verified at the handler attach/detach level — the native browser confirmation dialog itself is not asserted in automated tests, as it is not reliably scriptable.)*

### Story 1.10: Unread-error indicator

As the Primary User capturing tasks quickly,
I want a small "N error(s) above" indicator near the input when creates fail,
So that I'm alerted to failures without my typing being interrupted or focus being stolen.

**Acceptance Criteria:**

**Given** one or more failed-create rows exist, **When** the list renders, **Then** a focusable `<UnreadErrorIndicator>` shows "N error(s) above" aligned right of the input in `--color-error`, without stealing focus from the input.
**Given** focus is in the input, **When** I press Tab, **Then** focus moves to the indicator; **When** I press Enter on it, **Then** the first failed row scrolls into view and focus moves to its Retry affordance.
**Given** the indicator, **When** all failures are resolved (retried successfully or dismissed) or I focus it via Tab, **Then** the count clears appropriately (it is not dismissible by acknowledgement alone while failures remain).
**Given** the indicator, **When** inspected, **Then** its accessible name is "N error(s) above. Press Enter to view the first failed task."

*Depends on Story 1.9 — requires the Failed-variant row and its Retry affordance to exist (the indicator scrolls to and focuses that Retry).*

### Story 1.11: Thin container deploy

As a developer on the team,
I want the app packaged as a single runnable container that serves the built frontend and persists data to a file,
So that the usable list can actually run outside a dev laptop and container-persistence issues surface early.

**Acceptance Criteria:**

**Given** the repo, **When** `docker build` runs, **Then** a multi-stage image builds `apps/web` and compiles `apps/api`, and the final stage runs Fastify serving the built static frontend via `@fastify/static` from one origin.
**Given** the container runs, **When** configured, **Then** it reads `PORT` and `DATABASE_PATH` from environment variables and writes the SQLite file at `DATABASE_PATH`.
**Given** the running container, **When** I open it in a browser, **Then** I can view, add, and complete/uncomplete tasks end-to-end against the packaged backend.
**Given** the API, **When** requests are served, **Then** `@fastify/helmet` baseline headers and a body-size limit are applied at the API layer (hardened static-serving headers are deferred to Epic 3).
**Given** the container is stopped and restarted with the same mounted path, **When** it comes back up, **Then** previously created tasks are still present.

---

## Epic 2: Safe Delete

A user permanently removes tasks via the inline two-step arm-then-confirm affordance (300ms no-commit window, 5s auto-revert), with the full screen-reader contract for that interaction authored alongside it, an idempotent DELETE endpoint, and recoverable delete errors. Delete is isolated here because it is the most delicate, irreversible interaction in the app (NG-6) and deserves focused, "feeling-safe" acceptance criteria. The row `<label>` DOM established in Story 1.8 means these stories add the delete affordance without rewriting the row.

### Story 2.1: Delete endpoint & mutation

As a developer on the team,
I want an idempotent delete endpoint and a delete mutation that follows the honest-pending pattern,
So that removal is durable, safe to retry, and consistent with the app's other mutations before any delete UI exists.

**Acceptance Criteria:**

**Given** an existing todo, **When** `DELETE /todos/{id}` is called, **Then** the row is removed from SQLite **And** the endpoint returns 204.
**Given** a todo that does not exist (already deleted), **When** `DELETE /todos/{id}` is called, **Then** the endpoint still returns 204 (idempotent) rather than an error.
**Given** `useDeleteTodo`, **When** a delete is initiated, **Then** it consumes the shared honest-pending mutation pattern (`onMutate` cancel→snapshot→pending Committing state, `onError` rollback, `onSettled` invalidate `['todos']`) — it does not re-derive the pattern.
**Given** a delete request fails, **When** the error returns, **Then** the list reconciles to the last backend-confirmed state (refetch) and the item is not silently removed.
**Given** the delete path, **When** tested, **Then** integration tests cover both the existing-row and already-absent cases and assert the 204 contract.

### Story 2.2: Inline two-step delete affordance

As the Primary User,
I want deleting a task to require an arm-then-confirm step that protects me from accidental, irreversible removal,
So that I can clear tasks I no longer need without fear of deleting the wrong one.

**Acceptance Criteria:**

**Given** a todo row, **When** I view it, **Then** a small `Delete` text affordance appears at the right (always visible on touch; revealed on row hover on pointer devices via `@media (hover: hover)`), and tapping it does not toggle the row's completion (`stopPropagation`).
**Given** the idle `Delete` affordance, **When** I tap it once, **Then** it transforms in place to `Confirm` in `--color-error` via `--motion-settle` — no modal, no overlay, no row-height change.
**Given** the armed `Confirm`, **When** I tap it within 300ms of arming, **Then** the tap is absorbed and does NOT commit (muscle-memory protection); **When** I tap it after 300ms, **Then** the delete commits.
**Given** an armed affordance, **When** 5 seconds pass with no commit, **Then** it reverts to idle (the 5s floor is unchanged under reduced-motion, since it is a safety window, not motion).
**Given** an armed affordance, **When** I tap elsewhere (another row, the input, anywhere), or focus leaves it, or I arm a different row, **Then** it reverts to idle and at most one row is armed at a time (coordination owned by `<TodoList>`).
**Given** the 300ms no-commit window and 5s auto-revert timers, **When** implemented, **Then** they are driven by an injectable clock (the same mechanism as the honest-pending thresholds, §A-1), so the Story 2.3 race tests are deterministic rather than wall-clock-flaky.
**Given** an armed affordance after the 300ms no-commit window, **When** I tap `Confirm` again, **Then** it commits the delete (a second tap after the window is commit, not cancel — cancel paths remain wait-5s / tap-away / blur / arm-another-row).
**Given** a committed delete, **When** the row leaves the list, **Then** it fades via `--motion-settle` and the list does not reflow other rows abruptly.

### Story 2.3: Delete accessibility & state-race hardening

As the Primary User relying on a keyboard or screen reader,
I want the two-step delete to be fully announced and operable, and never strand my focus,
So that the safest interaction in the app is equally safe with assistive technology.

**Acceptance Criteria:**

**Given** the idle delete affordance, **When** inspected, **Then** its accessible name is "Delete '{description}'"; **When** armed, **Then** `aria-pressed="true"` and the accessible name becomes "Confirm deletion of '{description}', press again within 5 seconds to delete".
**Given** a committed delete, **When** the row is removed, **Then** the `<LiveRegion>` announces "{description} deleted." once, with no undo affordance implied.
**Given** an armed affordance that auto-reverts or is dismissed, **When** the row's state changes under the user, **Then** focus is moved to a stable, predictable element (e.g. the row anchor) and is never stranded on a removed node.
**Given** forced-colors mode, **When** the affordance is armed, **Then** the armed signal is carried by the `Delete`→`Confirm` label change (the `--color-error` change is overridden by the system and no fallback icon is added).
**Given** a delete failure, **When** it occurs, **Then** the `<LiveRegion>` announces the failure once and the list reconciles to current state.
**Given** the delete state machine, **When** tested **against the injectable clock**, **Then** tests deterministically cover the races: a delete fired during the 300ms no-commit window, a delete racing the 5s auto-revert, and a refresh/navigation mid-window.
**Given** Epic 2 is complete, **When** the container image is rebuilt and deployed, **Then** delete works end-to-end against the running container (honoring "re-deploy at each epic's end"; Epic 3 later hardens the deploy).

---

## Epic 3: Production Readiness & Delivery

Hardens the running app into a fully accessible, shippable product: list-wide keyboard navigation, the consolidated screen-reader contract, responsive / forced-colors / reduced-motion verification, the expanded CI quality-gate suite, k6 latency sign-off, hardened Docker packaging, and durable-volume + crash-recovery verification. No new FRs — these stories harden FR-1…FR-10 and prove NFR-1…NFR-6. Per-control accessibility already shipped with each control in Epics 1–2, so these are genuinely list-wide and packaging concerns.

### Story 3.1: List-wide keyboard navigation

As the Primary User navigating by keyboard,
I want to move through and operate the whole list without tabbing through every control,
So that a long list is fast and predictable to use with the keyboard alone.

**Acceptance Criteria:**

**Given** the list, **When** rendered, **Then** it uses a roving tabindex — exactly one row anchor has `tabindex="0"` and the rest `tabindex="-1"` — with `role="list"` on the container and `role="listitem"` on each row.
**Given** focus in the input, **When** I press Tab, **Then** focus moves to the first row anchor (or to the next page element if the list is empty); **Given** focus on the first row, **When** I press Shift+Tab, **Then** focus returns to the input.
**Given** focus on a row, **When** I press Arrow Down / Arrow Up, **Then** focus moves to the next / previous row without wrapping at the boundaries; **When** I press Home / End, **Then** focus moves to the first / last row.
**Given** focus on a row anchor, **When** I press Space or Enter, **Then** the row's completion toggles.
**Given** focus in the input with text, **When** I press Escape, **Then** the input text clears; **Given** focus on a row, **When** I press Escape, **Then** focus returns to the input; **Given** focus on a delete affordance (idle or armed), **When** I press Escape, **Then** focus returns to the row anchor (not out of the list).
**Given** the app, **When** I press Cmd/Ctrl+Z, **Then** no app-level state changes (browser-default applies only to text editing inside the input).

*This story owns the roving-anchor key handling (Arrow/Home/End, anchor `tabindex` management, Tab in/out). The wrapping-`<label>` Space/Enter toggle semantics are owned by Story 1.8 — the two are complementary, not duplicate.*

### Story 3.2: Consolidated screen-reader contract

As the Primary User using a screen reader,
I want every state change and control announced consistently and verified on real screen readers,
So that I can operate the entire app non-visually with confidence.

**Acceptance Criteria:**

**Given** the app, **When** audited, **Then** the single `<LiveRegion>` (`role="status"`, polite) carries all status messages; `aria-busy="true"` marks pending rows from t=0; pending/failed rows use `aria-disabled` (not HTML `disabled`) to preserve focus visibility; failed rows expose the committed `aria-describedby` text; and no extra ARIA landmarks beyond the documented structure are added.
**Given** each user action, **When** it confirms, **Then** the announcement matches the committed patterns: "{description} added.", "marked complete.", "marked active.", "{description} deleted.", create/mutation/load failure messages — with the verb + minimal-disambiguator rule and no announcement storm during burst capture.
**Given** the empty and loading states, **When** rendered, **Then** they are plain text with no extra `aria-live` (so they don't announce on every load).
**Given** a release candidate, **When** the scripted NVDA (Windows) + VoiceOver (macOS) smoke test runs, **Then** it passes as a **gating** criterion — pending→settled transitions announce correctly and focus is never stranded.

### Story 3.3: Responsive, forced-colors & reduced-motion verification

As the Primary User on any device or accessibility preference,
I want the app to remain usable and calm across viewport sizes, high-contrast modes, and reduced-motion,
So that the experience holds up regardless of how or where I use it.

**Acceptance Criteria:**

**Given** a viewport < 640px, **When** rendered, **Then** the single column fills the width with 16px padding and all touch targets are ≥48px; **Given** ≥640px, **Then** content is centred in a 640px container with 32px padding, paper extends to the edges, and hover states activate on pointer devices.
**Given** any toggle/complete/delete action, **When** it occurs, **Then** nothing reflows — row height is stable per state and pending→settled changes affect color/opacity only.
**Given** forced-colors mode, **When** active, **Then** the focus ring (via `outline`) survives, completion cues (strikethrough + checkbox) survive, and the delete armed-state reads via its label change.
**Given** `prefers-contrast: more`, **When** active, **Then** `--color-on-surface-muted` resolves to full contrast (pending then rests on `aria-busy`).
**Given** `prefers-reduced-motion: reduce`, **When** active, **Then** all motion tokens except `--motion-none` collapse to 0ms and the pending-cue minimum-hold collapses to zero, while the 5s delete auto-revert and 300ms no-commit safety windows are unchanged.
**Given** CI, **When** it runs, **Then** Playwright forced-colors, reduced-motion, and 200%-zoom (1280×800, no horizontal scroll) emulation gates pass.

### Story 3.4: Expanded CI quality gates & WCAG conformance

As a developer on the team,
I want the full automated quality-gate suite and performance sign-off in CI,
So that accessibility, contrast, and latency budgets can't regress silently before release.

**Acceptance Criteria:**

**Given** CI, **When** it runs, **Then** the contrast-regression check computes every documented token pair from the source of truth and fails if any drops below its target ratio, and axe-core reports 0 violations at serious/critical level.
**Given** the enumerated WCAG 2.2 AA success criteria, **When** verified, **Then** each is mapped to its gating mechanism with no silent gap: **axe-core/automated** (1.4.3 Contrast, 1.4.11 Non-text Contrast, 4.1.2 Name/Role/Value, 4.1.3 Status Messages), **Playwright-scripted** (1.4.4 Resize, 1.4.10 Reflow, 1.4.12 Text Spacing, 2.4.7 Focus Visible, 2.5.5/2.5.8 Target Size), and **gating manual NVDA/VoiceOver smoke (Story 3.2)** (2.1.1 Keyboard, 2.1.2 No Keyboard Trap, 2.4.3 Focus Order, 3.3.1 Error Identification, 3.3.4 Error Prevention). The CI gate does not report "AA enforced" on the axe-subset alone.
**Given** the k6 latency sign-off, **When** run, **Then** it specifies a reproducible load profile — concurrency, duration, dataset size (~100 todos), and warm-vs-cold state — so p50≤100ms / p95≤800ms is a falsifiable gate rather than an unqualified number.
**Given** the POST path, **When** load-tested with k6, **Then** p50 submit latency ≤100ms and p95 ≤800ms are confirmed as formal sign-off (promoting the Epic 1 integration-level percentile check).
**Given** the frontend, **When** measured, **Then** TTI ≤1s on slow-3G emulation holds and the bundle-size budget (now an absolute ceiling) passes.
**Given** the gate suite, **When** any gate fails, **Then** the PR is blocked from merge.

### Story 3.5: Hardened production deploy

As a developer on the team,
I want the production container hardened, observable, and proven durable under failure,
So that the app can be operated and recovered safely in production.

**Acceptance Criteria:**

**Given** the production image, **When** it serves the static frontend, **Then** `@fastify/helmet` baseline security headers (and CSP appropriate to the static layer) are applied at the static-serving layer, not just the API.
**Given** the container with a mounted `DATABASE_PATH` volume, **When** it is stopped and restarted, **Then** all previously confirmed todos are still present.
**Given** a `POST /todos` in flight, **When** the process is killed (SIGKILL) mid-write and then restarted, **Then** the database recovers via WAL — the committed row is present or the uncommitted write is cleanly dropped, with no corruption.
**Given** the running service, **When** requests are handled, **Then** pino emits structured JSON logs with a request id and per-request latency (never logging full payloads), at the committed levels (info lifecycle, warn recoverable, error 500s).
**Given** an orchestrator, **When** it probes `GET /health`, **Then** it receives a 200 liveness response suitable for readiness/liveness checks.
