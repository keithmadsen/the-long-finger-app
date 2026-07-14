---
baseline_commit: 8e6f0d3595ca80454bc113d7f4528eb7f80eecc1
---

# Story 3.4: Expanded CI quality gates & WCAG conformance

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer on the team,
I want the full automated quality-gate suite and performance sign-off in CI,
so that accessibility, contrast, and latency budgets can't regress silently before release.

[Source: _bmad-output/planning-artifacts/epics.md#Story 3.4 — verbatim]

## Acceptance Criteria

Verbatim from epics.md § Story 3.4, annotated with the scope decisions Keith locked on 2026-07-13 (see Dev Notes § Locked scope decisions):

1. **Given** CI, **When** it runs, **Then** the contrast-regression check computes every documented token pair from the source of truth and fails if any drops below its target ratio, and axe-core reports 0 violations at serious/critical level.
   - *Annotation:* the token-math gate (`contrast:check`) computes all documented pairs; review reconciled the UX Color System table and expanded the executable list to 10 pairs, including focus and control-boundary non-text contrast. The real-browser axe scan via `@axe-core/playwright` keeps `color-contrast` enabled.
2. **Given** the enumerated WCAG 2.2 AA success criteria, **When** verified, **Then** each is mapped to its gating mechanism with no silent gap: **axe-core/automated** (1.4.3 Contrast, 1.4.11 Non-text Contrast, 4.1.2 Name/Role/Value, 4.1.3 Status Messages), **Playwright-scripted** (1.4.4 Resize, 1.4.10 Reflow, 1.4.12 Text Spacing, 2.4.7 Focus Visible, 2.5.5/2.5.8 Target Size), and **gating manual NVDA/VoiceOver smoke (Story 3.2)** (2.1.1 Keyboard, 2.1.2 No Keyboard Trap, 2.4.3 Focus Order, 3.3.1 Error Identification, 3.3.4 Error Prevention). The CI gate does not report "AA enforced" on the axe-subset alone.
   - *Annotation (decision 1, updated 2026-07-14):* Story 3.3 has **merged** (PR #24). Its gates live in `e2e/tests/ui/a11y-modes.spec.ts` — 7 `@p1` tests (forced-colors, reduced-motion + safety windows, 200%-zoom via 640×400 viewport equivalence, 320px mobile floor, 640px breakpoint, reflow lock, prefers-contrast) implemented as per-test `page.emulateMedia()`/`setViewportSize()` inside the chromium project. The matrix's "Playwright-scripted" rows cite the covering test in that spec directly; they become merge-blocking the moment this story's CI `e2e` job lands. **Verify each SC against the actual merged tests** — 1.4.12 Text Spacing has no obvious covering test (see Task 4). The manual-smoke rows cite `docs/screen-reader-smoke-test.md`, whose first recorded NVDA/VoiceOver runs remain a release-candidate gate (3.5 timeframe) — the matrix records that status honestly.
3. **Given** the k6 latency sign-off, **When** run, **Then** it specifies a reproducible load profile — concurrency, duration, dataset size (~100 todos), and warm-vs-cold state — so p50≤100ms / p95≤800ms is a falsifiable gate rather than an unqualified number.
4. **Given** the POST path, **When** load-tested with k6, **Then** p50 submit latency ≤100ms and p95 ≤800ms are confirmed as formal sign-off (promoting the Epic 1 integration-level percentile check).
   - *Annotation for ACs 3–4 (decision 2):* dual-track. (a) Formal sign-off = one documented run of the committed k6 script against the **local Docker container** with strict thresholds `p(50)<100` / `p(95)<800`, recorded in a sign-off artifact (same pattern as 3.2's `docs/screen-reader-smoke-test.md`). (b) CI gets a k6 **smoke job with loosened thresholds** as a merge-blocking regression tripwire (shared-runner latency is noisy; strict numbers would flake).
5. **Given** the frontend, **When** measured, **Then** time-to-usable-list ≤10s on slow-3G emulation holds and the bundle-size budget (now an absolute ceiling) passes. *(Budget revised from ≤1s with Keith's product approval on 2026-07-14 after the production-container evidence measured 7,839ms.)*
   - *Annotation (decision 3):* the merge-blocking mechanism is the **absolute bundle-size ceiling** (converted from the ratchet). TTI itself is verified once via Playwright CDP network emulation against the built app and recorded as sign-off evidence — not a per-PR timing gate (Lighthouse removed TTI as a metric in v10; live timing on shared runners is flaky). See Dev Notes § TTI budget risk before running this measurement.
6. **Given** the gate suite, **When** any gate fails, **Then** the PR is blocked from merge.

## Tasks / Subtasks

- [x] Task 1: CI `e2e` job (AC 1, 6)
  - [x] Add a second job (e.g. `e2e`) to `.github/workflows/ci.yml`, parallel to `verify`: checkout, setup-node Node 24 + npm cache, `npm ci`, `npx playwright install --with-deps chromium`, `npm run test:e2e`. Shape is pre-specified in `e2e/README.md:97-102`. Do NOT cache Playwright browsers (Playwright docs: restore ≈ download time, OS deps uncacheable).
  - [x] Failure-artifact upload of `test-results/` + `playwright-report/` via `actions/upload-artifact` with `if: ${{ !cancelled() }}` and a retention period.
  - [x] The job runs the full suite (`npm run test:e2e`, no `--grep`/`--project` filter): both projects (api + chromium), which includes 3.3's merged `a11y-modes.spec.ts` gates — wiring this job is what makes those WCAG gates merge-blocking.
  - [x] Update the stale header comment at `.github/workflows/ci.yml:8-13` ("Playwright … gates remain deferred to Epic 3" — 3.3 deliberately left it for this story) and the `e2e/README.md:97-102` "Story 3.4 will add…" paragraph to describe reality.
- [x] Task 2: committed @p0 delete-path e2e specs (AC 6; closes deferred Epic 1 item 6 + deferred 1.7 AC 10)
  - [x] New spec file under `e2e/tests/ui/` covering: arm→confirm→revert delete; 5s auto-revert (real Playwright timers — do NOT fake the timer under test); concurrent arm/submit. Use `waitForResponse`/`interceptNetworkCall` for determinism, tag `@p0`.
  - [x] Follow the shared-parallel-DB conventions (Dev Notes § E2E landmines): `page.route` GET-scoping filter + random token (never `Date.now()`).
- [x] Task 3: real-browser axe gate via `@axe-core/playwright` (AC 1, 2 — NFR3-E2E-002)
  - [x] Add root devDep `@axe-core/playwright@^4.12.1` (matches the repo's existing `axe-core` 4.12.1; peer-compatible with `@playwright/test` 1.61.x).
  - [x] New e2e spec (chromium project) scanning the rendered app states with the **full cumulative tag array** `['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']` — axe tags are NOT cumulative; `wcag22aa` alone only matches 2.2-new rules. Assert 0 violations at serious/critical.
  - [x] Keep `color-contrast` ENABLED here (this is the only gate where it can truly run). `contrast:check` remains the primary token-math contrast gate; the jsdom axe gate (`App.axe.test.tsx`) keeps it disabled.
- [x] Task 4: WCAG 2.2 AA traceability matrix (AC 2)
  - [x] New doc `docs/wcag-conformance-matrix.md` (sibling of `docs/screen-reader-smoke-test.md`): one row per enumerated SC (1.4.3, 1.4.4, 1.4.10, 1.4.11, 1.4.12, 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.5.5, 2.5.8, 3.3.1, 3.3.4, 4.1.2, 4.1.3) → gating mechanism (exact gate/script/spec path + test name) → status (enforced / manual release gate).
  - [x] Playwright-scripted rows: verify each SC against the ACTUAL merged tests in `e2e/tests/ui/a11y-modes.spec.ts` (+ `keyboard-navigation.spec.ts` for focus-order surfaces) and cite the covering test by name. *(Resolved: the text-spacing test now runs at 320 px and proves complete long-description visibility; review also expanded 1.4.11 coverage to focus plus control boundaries. The gate now computes 10 documented pairs.)*
  - [x] Five manual rows: cite the scripted NVDA/VoiceOver smoke (`docs/screen-reader-smoke-test.md`), status "release-candidate gate". The doc must state explicitly that the axe subset alone does NOT constitute "AA enforced".
  - [x] Record in the matrix doc the declined option (Keith, 2026-07-14): **no dedicated whole-suite emulation Playwright projects** — 3.3's per-test emulation gates already satisfy the ACs; re-running the whole UI suite under emulation would multiply chromium CI time with no new assertion coverage. (This closes the pointer comment 3.3 left in `playwright.config.ts`.)
- [x] Task 5: @p0/@p1 selective execution + coverage thresholds (AC 6; deferred Epic 1 item 7 / epic-2 retro item 2)
  - [x] Verify `test:e2e:p0` / `test:e2e:p1` grep filters work against the expanded suite (scripts exist at root `package.json`). Note: all 7 `a11y-modes.spec.ts` gates are `@p1` — the CI job must run the full `test:e2e` (Task 1), not a `@p0`-filtered subset, or the WCAG gates silently drop out of the merge-blocking path. *(Verified: `@p0` selects 6 tests incl. the 3 new delete-path specs; `@p0|@p1` selects all 23 — every test carries a priority tag.)*
  - [x] Add Vitest coverage thresholds for the P0 delete path: >90% unit / >80% integration (epic-1 retro item 7 targets) — scope thresholds to the delete-path modules rather than blanket global numbers if that's what the targets mean in context; record the chosen interpretation in the Dev Agent Record.
- [x] Task 6: bundle ratchet → absolute ceiling (AC 5)
  - [x] Rework `apps/web/scripts/check-bundle-size.mjs` + `apps/web/bundle-size-baseline.json` from always-trips ratchet to fail-only-if-over-budget absolute ceiling (deferred-work.md item; epic-2 retro item 7: the ratchet "is doing paperwork, not gate-keeping"). *(Ceiling 95,000 B gz; no `--update` shortcut by design — raising it is a hand edit with PR rationale. Red-tested: gate exits 1 when over ceiling.)*
  - [x] Derive and document the ceiling value — see Dev Notes § TTI budget risk. If the slow-3G math contradicts the original ≤1s budget, surface it to Keith; do not silently pick a number that hides the conflict. *(Resolved in review: Keith approved ≤10s; the 95,000 B ceiling remains the merge-blocking regression proxy.)*
- [x] Task 7: k6 dual-track (AC 3, 4, 6)
  - [x] Committed k6 script (suggested: `e2e/load/post-todos-signoff.js` — outside `e2e/tests/`, so Playwright's testDir won't pick it up) with explicit reproducible profile: concurrency (VUs), duration, ~100-todo seeded dataset, warm-vs-cold distinction, thresholds `http_req_duration: ['p(50)<100', 'p(95)<800']` scoped to the POST path (tag requests, e.g. `{type:'create'}`).
  - [x] Formal sign-off: run the script against the local Docker container (`open -a Docker` first on this machine; image build verified end-to-end in Story 1.11) and record environment + results in `docs/k6-latency-signoff.md`, patterned on `docs/screen-reader-smoke-test.md`. *(PASS: p50 2.85 ms / p95 6.34 ms, 601/601 creates 201.)*
  - [x] CI smoke job: docker build + `docker run`, curl wait-loop on `GET /health`, `grafana/setup-k6-action@v1` (NOT `grafana/k6-action` — archived), `k6 run` with **loosened thresholds** (suggest ~5× the formal numbers, e.g. `p(50)<500` / `p(95)<2000`; record the chosen values + rationale). Threshold breach exits code 99 → step fails → merge blocked. Note this makes CI exercise the Dockerfile for the first time. *(Chose exactly p50<500/p95<2000; rationale recorded in ci.yml comment + sign-off doc.)*
- [x] Task 8: TTI slow-3G sign-off evidence (AC 5)
  - [x] One documented measurement: Playwright CDP `Network.emulateNetworkConditions` (~400ms latency, ~400Kbps down ≈ 50KB/s, matching the DevTools Slow-3G preset) against the **built** app (`npm run build` + prod-style serve), record time-to-usable-list in the sign-off doc (can share `docs/k6-latency-signoff.md` or its own section). This is evidence, not a per-PR gate. *(Median 7,839 ms — passes Keith's review-approved ≤10s budget; script committed as `e2e/load/measure-tti.mjs`.)*
- [x] Task 9: docs + bookkeeping (all ACs)
  - [x] Update `_bmad-output/implementation-artifacts/deferred-work.md`: mark the harness/CI item, tagging+thresholds item, and bundle-ratchet item resolved with pointers. *(Also added one new deferred item: container response compression, found by the TTI run.)*
  - [x] Update `CLAUDE.md` commands section if new scripts are added (k6, coverage).
  - [x] Run the FULL gate suite locally (Node 24: `nvm use 24`) and the e2e suite **twice consecutively**; record gate evidence in the Dev Agent Record and commit body per repo convention.

### Review Findings

- [x] [Review][Patch] Revise the slow-3G performance budget and AC to ≤10 seconds with Keith's product approval — Retain the recorded 7,839 ms evidence and make the approved replacement budget explicit rather than treating the 95 KB regression ceiling as proof of the old criterion [`docs/k6-latency-signoff.md`:61]
- [x] [Review][Patch] Strengthen `--color-border` to at least 3:1 and add the control-boundary pair to the contrast gate — This closes the WCAG 1.4.11 gap for the TextInput and unchecked Checkbox instead of relying on axe, which does not automate the criterion [`apps/web/src/styles/tokens.css`:36]
- [x] [Review][Patch] Remove the two-line description clamp so complete task text remains visible under user spacing overrides and narrow viewports; extend the 1.4.12 test at 320 px [`apps/web/src/components/recipes/TodoItem.module.css`:22]
- [x] [Review][Patch] Fix the stale Delete-name locator that deterministically fails after the button becomes Confirm [`e2e/tests/ui/a11y-modes.spec.ts`:544]
- [x] [Review][Patch] Fail the k6 gate when scheduled iterations are dropped so the documented workload cannot silently shrink [`e2e/load/post-todos-signoff.js`:42]
- [x] [Review][Patch] Synchronize the concurrent create/delete test so DELETE is proven to occur while POST is still pending [`e2e/tests/ui/delete-path.spec.ts`:154]
- [x] [Review][Patch] Handle or reject alpha-form hex tokens before computing the sole focus-ring contrast gate [`apps/web/scripts/check-contrast.mjs`:34]
- [x] [Review][Patch] Fail the bundle-size check when a build emits zero JavaScript/CSS assets [`apps/web/scripts/check-bundle-size.mjs`:45]
- [x] [Review][Patch] Reconcile the stale UX Color System pair table with the accepted `--color-pending` Story 1.7 design and the actual CI targets [`_bmad-output/planning-artifacts/ux-design-specification.md`:475]
- [x] [Review][Patch] Re-run the formal strict k6 sign-off against the reviewed candidate image; the recorded image is the baseline commit [`docs/k6-latency-signoff.md`:35]
- [x] [Review][Patch] Make coverage thresholds enforce the specified strictly-greater-than 90%/80% boundaries [`apps/web/vite.config.ts`:31]

## Dev Notes

### Locked scope decisions (Keith, 2026-07-13)

1. **WCAG matrix vs Story 3.3 — SETTLED (3.3 merged 2026-07-13, PR #24)**: the gates exist on main as per-test `page.emulateMedia()`/`setViewportSize()` calls in `e2e/tests/ui/a11y-modes.spec.ts` (7 `@p1` tests, chromium project). 3.3 **deleted** the config extension-point stub; there are no emulation projects. Keith declined the "dedicated whole-suite emulation projects" option (2026-07-14) — record the rationale in the matrix doc (Task 4). Matrix rows cite the merged tests directly. The story branch `story/3-4-expanded-ci-quality-gates-wcag-conformance` is based on origin/main **after** the 3.3 merge, with `sprint-status.yaml` already reconciled — no sync work needed before dev-story.
2. **k6 both tracks**: strict local container sign-off (formal AC 3/4 evidence) + loose-threshold merge-blocking CI smoke job.
3. **TTI**: absolute bundle ceiling is the merge-blocking proxy; one CDP-throttled measurement recorded as evidence.
4. **Out of scope**: dedicated whole-suite emulation projects (declined, decision 1); executing the manual NVDA/VoiceOver smoke (release-candidate gate, 3.5 timeframe, per Keith 2026-07-10); container hardening/durability/observability (3.5).

### Current state (audited 2026-07-13)

- **CI** (`.github/workflows/ci.yml`): one job `verify` on ubuntu-latest — checkout@v5, setup-node@v5 (Node 24, npm cache), `npm ci`, then typecheck → lint:css → lint:css:selftest → web tests (incl. jsdom axe) → contrast:check → web build → size:check → API unit → API integration. No e2e, no Docker, no artifact uploads, no second job. Header comment lines 8–13 is stale once this story lands.
- **Playwright harness** (root `playwright.config.ts`, PR #20): already CI-aware — `forbidOnly: !!CI`, `retries: CI ? 2 : 0`, `workers: CI ? 1 : undefined`, reporters html (open: never) + junit (`test-results/results.xml`) + list, trace/screenshot/video on failure, webServer `npm run dev` with isolated `DATABASE_PATH=./data/e2e.db`, `reuseExistingServer: !CI` (fresh server in CI). Projects: `api` (browserless, `**/*.api.spec.ts`) + `chromium`. Matches Playwright's own CI recommendations — no config changes needed for CI beyond what exists.
- **Spec inventory** (13 tests on origin/main): `todos.api.spec.ts` (@p0/@p1), `capture-and-complete.smoke.spec.ts` (2× @p0), `keyboard-navigation.spec.ts` (@p1, Story 3.1), `screen-reader-contract.spec.ts` (@p1, Story 3.2), `a11y-modes.spec.ts` (7× @p1, Story 3.3). **No delete-path spec exists** — the P0 delete interaction still has no committed regression net (epic-2 retro line 47).
- **Existing gates**: token lint (`apps/web/stylelint.config.js` + local plugin + `verify-token-lint.mjs` selftest); contrast (`apps/web/scripts/check-contrast.mjs` — 7 hard-coded fg/bg pairs parsed from `tokens.css` hex tokens); bundle ratchet (`apps/web/scripts/check-bundle-size.mjs` vs `bundle-size-baseline.json` + 512 B tolerance, needs prior build); jsdom axe (`apps/web/src/App.axe.test.tsx` — 6 app states, color-contrast disabled). `@axe-core/playwright` is NOT installed; axe-core 4.12.1 + vitest-axe 0.1.0 live in apps/web only.
- **Gate baseline after 3.3 (origin/main)**: web 243, api 49, e2e 13/13 (×2), contrast 7/7, bundle 92,498 B gz vs 92,295 B baseline + 512 B tolerance (no rebaseline needed).

### E2E landmines (hard-won in 3.1/3.2 — violating these caused real failures)

- The harness runs **fully parallel against ONE shared e2e DB**. Any spec asserting list-wide state needs a `page.route` filter scoping `GET /todos` to its own rows (3.1 precedent in `keyboard-navigation.spec.ts`) with **random tokens, never `Date.now()`** — parallel workers starting in the same millisecond collided in 3.2.
- React removes `aria-busy={false}` entirely: assert `not.toHaveAttribute('aria-busy', 'true')`, never `toHaveAttribute('aria-busy', 'false')`.
- Import `test`/`expect` from `e2e/support/ui-fixtures.ts` (gives `seedTodos`, `interceptNetworkCall`, `networkErrorMonitor` — opt out per-test with the `skipNetworkMonitoring` annotation) or `api-fixtures.ts`; factory `createTodo()` from `e2e/support/factories/todo-factory.ts`.
- Accessible-role selectors only; toggle via label/keyboard, never `checkbox.check()` (real input is hidden behind the styled indicator). No hard waits. Delete queries via enriched names (`/^Delete '/`, `/^Confirm deletion of/`).
- Real timers for the 5s auto-revert (epic-2 retro item 1: "real Playwright timers + `waitForResponse`, do not fake-time the behavior under test"). The reduced-motion token collapse never touches the 5s/300ms safety windows.
- Run the full e2e suite **twice consecutively** before claiming green (established stability check).
- Worktrees need their own `npm install` under Node 24 (module resolution silently walks up otherwise); API tests fail under shell-default Node 22 (better-sqlite3 ABI) — `nvm use 24`.

### TTI budget risk (read before Task 6/8)

Current bundle is ~92.5 KB gz (92,498 B after 3.3). Slow-3G ≈ 400 Kbps ≈ 50 KB/s made the original ≤1s budget arithmetically unreachable. The Task 8 production-container measurement recorded 7,839ms honestly; during review Keith approved a replacement ≤10s time-to-usable-list budget. The 95,000 B gzip ceiling remains the NFR-2 merge-blocking regression proxy.

### Latest-tech notes (web-verified 2026-07-13)

- `@playwright/test` latest = **1.61.1** — repo already current; no upgrade, no breaking changes.
- `@axe-core/playwright` latest = **4.12.1**; peer dep `playwright-core >= 1.0.0`; API: `new AxeBuilder({ page }).withTags([...]).analyze()`. Tags are not cumulative (see Task 3).
- k6: `grafana/setup-k6-action@v1` (v1.2.1) is current; `grafana/k6-action` is **archived — do not use**; optional `grafana/run-k6-action@v1`. Threshold breach ⇒ exit code 99 (fails the step with no extra wiring). Thresholds syntax: `http_req_duration: ['p(50)<100', 'p(95)<800']`; tag-scoped variant `'http_req_duration{type:create}'`.
- Actions majors (mid-2026): checkout@v7, setup-node@v6, upload-artifact@v7 (v4 syntax name/path/retention-days unchanged). Repo pins checkout@v5/setup-node@v5 — staying consistent with the existing pins in the new job is fine; don't mix majors within one file without reason.
- Playwright docs explicitly recommend **against** caching browser binaries in CI.
- Lighthouse removed TTI as a scored metric in v10 — hence the CDP-emulation evidence approach instead of an `interactive` assertion.

### Previous-story intelligence (3.2 / 3.1)

- 3.2 handed off verbatim: "Full committed e2e suite, CI `e2e` job, @p0/@p1 coverage thresholds, full WCAG-matrix gate mapping, k6 → Story 3.4. Contrast matrix / bundle-budget rework → Story 3.4."
- 3.2's SR-contract spec + 3.1's keyboard spec are the house style for new e2e specs (route-scoping, stamp tokens, fixtures).
- Web `tsc -b` is stricter than root typecheck (`noUncheckedIndexedAccess`) — guard test-file index accesses.
- Live-browser verification before commit caught real AC bugs in both 3.1 and 3.2 — do it again here (especially the delete auto-revert timing spec).
- Pre-existing, out-of-scope: unused eslint-disable warning at `useRovingTabindex.ts:99` (0 errors; leave it).
- Git conventions: branch `story/3-4-expanded-ci-quality-gates-wcag-conformance`; commits `feat:`/`chore:` citing the story; commit bodies record gate evidence; every story commit updates this file + `sprint-status.yaml`.

### Project Structure Notes

- E2E lives at **repo root** (`e2e/` + root `playwright.config.ts`) — a recorded intentional deviation from architecture.md's older `apps/web/e2e/` placement (CLAUDE.md is authoritative).
- New files this story creates: CI job additions in `.github/workflows/ci.yml`; `e2e/tests/ui/<delete-path>.spec.ts`; an axe e2e spec under `e2e/tests/ui/`; `e2e/load/post-todos-signoff.js` (suggested); `docs/wcag-conformance-matrix.md`; `docs/k6-latency-signoff.md`. Modified: `apps/web/scripts/check-bundle-size.mjs`, `apps/web/bundle-size-baseline.json`, root `package.json` (devDep + any scripts), `e2e/README.md`, `deferred-work.md`, `CLAUDE.md` (commands), possibly Vitest configs for coverage thresholds.
- Unit/integration tests stay in their apps under Vitest; the Playwright harness is only for cross-stack e2e (CLAUDE.md § E2E harness).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.4] — story + 6 ACs (verbatim above); § Story 3.3 / 3.5 for scope boundaries; § Notes C-14 (ratchet → absolute ceiling once UI complete), C-15 (k6-against-the-container reserved for Epic 3 sign-off); UX-DR27/28/29; AR-9.
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#CI Test Gates and SM-1 Protocol Amendments (~line 679)] — canonical 6-gate list; #WCAG Conformance Statement (~line 1446) — the 15 enumerated SCs; #Color System contrast table (~line 475) — the documented pairs; #Performance Contracts (~line 1471) — TTI/p50/p95 numbers.
- [Source: _bmad-output/planning-artifacts/architecture.md:209] — GitHub Actions gate mandate; :471 — bundle budget "asserted but not enforced".
- [Source: docs/prd.md §7 NFR-1..NFR-4; §9 SM-3] — upstream requirements.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md:7-13] — the three items this story closes.
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-07-01.md items 1, 2, 7; epic-1-retro-2026-07-01.md items 6, 7] — harness spec, tagging/thresholds, ratchet conversion, tooling decisions (Chrome DevTools MCP = authoring aid only, no CI role; Pact = skip).
- [Source: _bmad-output/test-artifacts/framework-setup-progress.md:68-73] — PR #20's explicit handoff list to this story.
- [Source: e2e/README.md:97-102] — pre-specified CI job shape.
- [Source: _bmad-output/implementation-artifacts/3-2-consolidated-screen-reader-contract.md] — previous story; scope handoffs + e2e landmines.
- [Source: _bmad-output/implementation-artifacts/3-3-responsive-forced-colors-reduced-motion-verification.md (origin/main)] — merged 2026-07-13 (PR #24); gate shape (per-test emulation, config stubs deleted), a11y-modes spec inventory, "CI-wiring seam" note assigning the e2e job here.
- [Source: docs/screen-reader-smoke-test.md] — sign-off artifact pattern + manual-gate rows of the matrix.

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5) via Claude Code, 2026-07-14.

### Debug Log References

- **Route-precedence leak (delete-path spec, first run):** `interceptNetworkCall({url: '/todos'})` registers a `page.route` AFTER the GET-scoping route; Playwright matches routes newest-first and its `route.continue()` bypassed the scoping filter entirely, leaking another worker's rows into the list count. Fix: register the POST-delay route BEFORE `scopeListTo` (my GET route `fallback()`s non-GETs down the chain) and sync on the slow POST via `waitForResponse`. Recorded as a comment in the spec for the next author.
- **Mid-transition axe reading (armed-delete scan, first run):** axe measured fg `#a7605d` on `#f5f4ef` = 4.26:1 — a blend captured mid `--motion-settle` color transition (`.armed` is 6.6:1 at rest on both surfaces). Fix: poll until the confirm button's computed color equals the resolved `--color-error` before scanning.
- **Coverage gate red on first run (correct behavior):** delete-path branches 84.6% < 90%. Closed by adding real tests, not lowering numbers: tap-away `[data-armed-delete]` guard branches (useArmedDelete) + the unknown-id/no-description defensive fallback (useDeleteTodo). Final: 97.59% stmts / 92.3% branch / 100% funcs / 100% lines.
- **Docker Desktop slow start:** daemon took ~10 min to come up after `open -a Docker` (backend module fetches timing out against desktop.docker.com); patience, no config change needed.

### Completion Notes List

- 2026-07-13 (create-story): Ultimate context engine analysis completed — comprehensive developer guide created. Scope decisions 1–3 locked with Keith (WCAG matrix in-flight 3.3 rows; k6 dual-track; bundle ceiling as TTI proxy).
- 2026-07-14 (story review, post-3.3-merge): updated for merged reality — 3.3's gates are per-test emulation in `a11y-modes.spec.ts` (no emulation projects; config stub deleted); matrix rows now cite merged tests; 1.4.12 Text Spacing flagged as a probable coverage gap Task 4 must resolve; whole-suite emulation projects declined by Keith; current-state numbers refreshed (13 e2e tests, web 243, bundle 92,498 B); worktree-sync + sprint-status conflict guidance added.
- 2026-07-14 (code review patches): all 11 findings resolved. Keith approved a ≤10 s slow-3G time-to-usable budget; the recorded 7,839 ms evidence now passes that explicit product contract. WCAG 1.4.11 now gates focus and control boundaries (10 contrast pairs total); descriptions wrap completely at 320 px under WCAG spacing; the stale Confirm locator, k6 dropped-iteration gap, create/delete overlap race, alpha-color parsing, empty-bundle pass, stale UX table, candidate-image sign-off, and strict coverage boundaries were corrected.
- **Post-review gate evidence (2026-07-14, Node 24.16.0):** typecheck ✓; lint:css ✓; lint:css:selftest 14/14 ✓; web tests 246/246 with coverage 97.59/92.3/100/100 >90 ✓; contrast 10/10 pairs ✓; build ✓; size 92,468 ≤ 95,000 B gz ✓; API unit 18/18 ✓; API integration 31/31 with coverage 100/87.5/100/100 >80 ✓; e2e **23/23 twice consecutively** ✓ (11.6 s / 10.1 s); strict candidate-image k6 PASS (p50 3.69 ms / p95 5.01 ms, 601/601 creates, 0 dropped iterations). `git diff --check` ✓.

### File List

- `.github/workflows/ci.yml` (MODIFIED) — header rewrite; `e2e` job (full suite + artifact upload); `k6-smoke` job (docker build/run + health wait + setup-k6-action + loosened thresholds); verify steps switched to coverage variants.
- `e2e/tests/ui/delete-path.spec.ts` (NEW) — 3× @p0 delete-path regression net.
- `e2e/tests/ui/axe-gate.spec.ts` (NEW) — 6× @p1 real-browser axe WCAG 2.2 AA gate.
- `e2e/tests/ui/a11y-modes.spec.ts` (MODIFIED) — appended text-spacing gate describe (WCAG 1.4.12, @p1).
- `e2e/load/post-todos-signoff.js` (NEW) — k6 dual-track script (reproducible profile; env-overridable thresholds).
- `e2e/load/measure-tti.mjs` (NEW) — CDP slow-3G TTI evidence script.
- `e2e/README.md` (MODIFIED) — CI integration section describes the wired job.
- `playwright.config.ts` (MODIFIED) — emulation-projects pointer comment closed with the recorded declined decision.
- `docs/wcag-conformance-matrix.md` (NEW) — the AC 2 traceability matrix.
- `docs/k6-latency-signoff.md` (NEW) — candidate-image k6 formal sign-off (PASS) + slow-3G evidence against Keith's approved ≤10 s budget (PASS).
- `apps/web/scripts/check-contrast.mjs` (MODIFIED) — 10 opaque-token pairs including focus and control boundaries for WCAG 1.4.11.
- `apps/web/src/styles/tokens.css` (MODIFIED) — `--color-border` strengthened to ≥3:1 on active control surfaces.
- `apps/web/src/components/recipes/TodoItem.module.css` + `TodoItem.test.tsx` (MODIFIED) — full-description responsive wrapping replaces the two-line clamp.
- `apps/web/scripts/check-bundle-size.mjs` (MODIFIED) — ratchet → absolute ceiling; `--update` removed.
- `apps/web/bundle-size-baseline.json` (MODIFIED) — `ceilingGzipBytes: 95000` + rationale.
- `apps/web/vite.config.ts` (MODIFIED) — delete-path-scoped coverage thresholds (90).
- `apps/web/package.json` (MODIFIED) — `test:coverage` script; `@vitest/coverage-v8` devDep.
- `apps/web/src/hooks/useArmedDelete.test.ts` (MODIFIED) — tap-away pointerdown branch tests.
- `apps/web/src/hooks/useDeleteTodo.test.tsx` (MODIFIED) — unknown-id defensive-fallback test.
- `apps/api/vitest.config.ts` (MODIFIED) — delete-path-scoped coverage thresholds (80).
- `apps/api/package.json` (MODIFIED) — `test:integration:coverage` script; `@vitest/coverage-v8` devDep.
- `package.json` + `package-lock.json` (MODIFIED) — `@axe-core/playwright@^4.12.1` root devDep.
- `.gitignore` (MODIFIED) — `coverage/`.
- `CLAUDE.md` (MODIFIED) — commands + CI description updated.
- `_bmad-output/implementation-artifacts/deferred-work.md` (MODIFIED) — three items resolved; one new (container compression).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED) — status transitions.
- `_bmad-output/implementation-artifacts/3-4-expanded-ci-quality-gates-wcag-conformance.md` (MODIFIED) — this file.
- `_bmad-output/planning-artifacts/ux-design-specification.md`, `epics.md`, `architecture.md` (MODIFIED) — review-approved ≤10 s slow-3G budget, full-description display contract, and reconciled color system.
- `_bmad-output/test-artifacts/test-design-progress.md`, `test-design/test-design-qa.md`, `test-design/test-design-architecture.md` (MODIFIED) — performance traceability synchronized to the approved contract.

## Change Log

- 2026-07-14 — Story 3.4 implemented (dev-story): CI e2e + k6-smoke jobs, @p0 delete-path specs, real-browser axe gate, WCAG 2.2 AA conformance matrix (1.4.12 + 1.4.11 gaps closed), delete-path coverage thresholds, bundle ceiling conversion, k6 dual-track with formal sign-off (PASS), TTI slow-3G evidence (budget miss surfaced). Full gate suite green; e2e 23/23 ×2. Status → review.
