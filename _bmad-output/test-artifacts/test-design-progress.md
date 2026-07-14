---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-06-15'
mode: 'system-level'
inputDocuments:
  - docs/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - knowledge/risk-governance.md
  - knowledge/probability-impact.md
  - knowledge/test-levels-framework.md
  - knowledge/test-priorities-matrix.md
  - knowledge/nfr-criteria.md
  - knowledge/adr-quality-readiness-checklist.md
  - knowledge/test-quality.md
detectedStack: 'fullstack'
---

# Test Design Progress — the long finger

## Step 1: Detect Mode & Prerequisites

**Mode selected:** System-Level

**Rationale:**
- No `sprint-status.yaml` and no epic/story artifacts → file-based detection routes to System-Level.
- PRD + Architecture exist without epics/stories → user-intent also indicates System-Level.

**Prerequisites confirmed present:**
- PRD: `docs/prd.md` + validated PRD under `_bmad-output/planning-artifacts/prds/prd-the-long-finger-2026-05-25/`
- Architecture / ADR: `_bmad-output/planning-artifacts/architecture.md` (status: complete, READY FOR IMPLEMENTATION)
- Supporting: `_bmad-output/planning-artifacts/ux-design-specification.md`

## Step 2: Load Context & Knowledge Base

**Config flags:** `tea_use_playwright_utils: true`, `tea_use_pactjs_utils: false`, `tea_pact_mcp: none`, `tea_browser_automation: auto`, `risk_threshold: p1`.

**Detected stack:** `fullstack` (React+Vite frontend + Fastify backend, per architecture). Project is **greenfield** — no source or test files yet, so:
- Playwright Utils: API-only loading profile per detection (no browser test files exist yet); full UI+API utils become relevant at framework-init time.
- Browser exploration skipped — no running app to explore.

**Project artifacts loaded:** PRD (10 FRs, 6 NFRs, 7 NGs, data model, UJ-1), Architecture (stack, contract, boundaries, deployment), UX spec (referenced).

**Knowledge fragments loaded (System-Level required):** risk-governance, probability-impact, test-levels-framework, test-priorities-matrix, nfr-criteria, adr-quality-readiness-checklist, test-quality.

**Extracted for downstream steps:**
- Tech stack & integration points: Fastify v5 API (4 REST endpoints + /health) → better-sqlite3 (single `todos` table); React+Vite SPA → TanStack Query → API; client-generated UUIDv7; TypeBox contract shared via `@tlf/contracts`.
- NFR thresholds: NFR-1 ≤300 ms visible update after backend response (UX tightens: p50 submit ≤100 ms, p95 ≤800 ms); NFR-2 local load <1 s and UX time-to-usable ≤10 s for ≤100 items on slow 3G; NFR-3 WCAG 2.2 AA; NFR-4 320 px–desktop; NFR-5 layer separation; NFR-6 no data loss/corruption.
- Missing-threshold questions: production telemetry/error-tracking thresholds open; bundle-size budget not yet a CI gate (flagged in architecture Gap Analysis).

## Step 3: Testability & Risk Assessment

### 3.1 Testability Review (System-Level)

#### 🚨 Testability Concerns (actionable)

- **TC-1 — Timestamp control for ordering tests.** `created_at`/`updated_at` are server-set; the API gives no way to inject specific timestamps. The canonical-ordering rule (FR-5: `completed ASC`, then `updated_at DESC`) therefore can't be exercised deterministically via the public API alone. **Action:** test ordering at the repository/integration level with directly-seeded timestamps (or an injectable clock), not via POST/PATCH timing.
- **TC-2 — Per-test DB isolation for parallel safety.** better-sqlite3 is a single file with WAL. Integration tests sharing one file will contend/pollute. **Action:** `build-test-app.ts` must give each test (or worker) a unique temp DB file and tear it down — required for `--workers>1` (test-quality DoD).
- **TC-3 — Backend fault injection.** Validating FR-8 server-side error paths (500 on write failure) needs a way to force a repository failure. **Action:** rely on the Awilix cradle to inject a failing/fake repository in integration tests; document the seam.
- **TC-4 — Fresh QueryClient per frontend test.** TanStack Query cache bleeds across tests if shared. **Action:** construct a new `QueryClient` per test; disable retries in test config to keep optimistic-rollback assertions deterministic.
- **TC-5 — Latency observability is log-only.** NFR-1 p50/p95 is logged by pino but not aggregated/exposed (no `/metrics`). **Action:** perf validation must parse logs or use k6 summary; treat as MONITOR (R-003).

#### ✅ Testability Assessment Summary (already strong)

- **Controllability:** clean-arch + Awilix cradle → repository is swappable (in-memory/fake) for unit/service tests; state seeds via `POST /todos`; **client-generated UUIDv7 means tests own the id before the call** (no id-extraction race).
- **Observability:** API returns the resource directly; uniform error envelope; ISO-8601 timestamps; `/health` liveness; pino structured logs with request id + latency → deterministic assertions.
- **Reliability:** integration tests run against a real temp-file SQLite (realistic, fast); idempotent create/delete contracts make retries safe; network-first interception available for E2E.
- **Headless access:** 100% of business logic reachable via the 4 REST endpoints — no UI dependency for core-logic testing (ADR readiness 1.2 ✅).

#### Architecturally Significant Requirements (ASRs)

| ID | ASR | Type |
|---|---|---|
| ASR-1 | `POST /todos` accepts client-generated UUIDv7; idempotent on id | ACTIONABLE |
| ASR-2 | `DELETE` idempotent — 204 whether or not row exists | ACTIONABLE |
| ASR-3 | Canonical ordering `completed ASC, updated_at DESC` (FR-5) | ACTIONABLE |
| ASR-4 | Optimistic UI with rollback (`onMutate`/`onError`/`onSettled`) | ACTIONABLE |
| ASR-5 | Repository is sole DB-aware module; snake↔camel mapper (NFR-5) | ACTIONABLE |
| ASR-6 | Latency budgets NFR-1 (p50≤100 ms / p95≤800 ms) | ACTIONABLE |
| ASR-7 | Time-to-usable ≤10 s slow-3G / bundle budget (NFR-2) | ACTIONABLE |
| ASR-8 | Durable persistence across restart via mounted volume (FR-9) | ACTIONABLE |
| ASR-9 | Input validation is the security boundary (no auth, NG-1/2) | ACTIONABLE |
| ASR-10 | WCAG 2.2 AA + contrast-regression gate (NFR-3) | ACTIONABLE |
| ASR-11 | No server push; multi-tab reconciliation via refetch-on-focus (NG-5) | FYI |

### 3.2 Risk Assessment Matrix

Probability/Impact 1–3; Score = P×I. Action per probability-impact thresholds (≥9 BLOCK, 6–8 MITIGATE, 4–5 MONITOR, 1–3 DOCUMENT). `risk_threshold: p1` → gate focuses on score ≥6.

| ID | Cat | Risk | P | I | Score | Action | Mitigation (owner) |
|---|---|---|---|---|---|---|---|
| **R-001** | DATA | Data loss/corruption on a failed create/complete/delete (NFR-6, FR-9) | 2 | 3 | **6** | MITIGATE (P1) | Atomic single-row writes + WAL; integration tests asserting state preserved on failure; reliability tests (Dev+QA) |
| **R-009** | OPS | SQLite volume not mounted / wrong `DATABASE_PATH` → data lost on restart | 2 | 3 | **6** | MITIGATE (P1) | Restart-persistence test; Docker/compose volume assertion; startup check logs DB path (Dev/Ops) |
| R-002 | DATA | Optimistic rollback leaves client state inconsistent with server | 2 | 2 | 4 | MONITOR (P2) | E2E rollback test; `onSettled` invalidates `['todos']`; disable test retries (QA) |
| R-003 | PERF | API p95>800 ms or time-to-usable>10 s on slow 3G (NFR-1/2) | 2 | 2 | 4 | MONITOR (P2) | k6 API latency + Playwright CDP timing; see R-011 (QA) |
| R-004 | DATA | Canonical ordering wrong (ties, write-once vs updated_at) | 2 | 2 | 4 | MONITOR (P2) | Repository ordering tests with seeded timestamps (TC-1) (Dev+QA) |
| R-005 | BUS | DELETE idempotency contract violated (404 vs 204; double-delete) | 2 | 2 | 4 | MONITOR (P2) | Explicit idempotency contract test (QA) |
| R-006 | BUS | Description validation bypass (empty/whitespace/>200, trim) | 2 | 2 | 4 | MONITOR (P2) | Client+server validation tests, boundary values 0/1/200/201 (QA) |
| R-007 | DATA | Idempotent create fails → duplicate todos on retry | 2 | 2 | 4 | MONITOR (P2) | Same-id POST twice → single row test (QA) |
| R-008 | SEC | Stored XSS / injection via `description` (input validation is only defense) | 2 | 2 | 4 | MONITOR (P2) | React escaping verified; parameterized queries; XSS payload E2E + API validation (QA) |
| R-011 | PERF | No bundle-size CI gate → silent TTI regression (NFR-2) | 2 | 2 | 4 | MONITOR (P2) | Add `size-limit` gate to `ci.yml` (Dev) |
| R-014 | TECH | WCAG 2.2 AA gaps (keyboard, SR, not-color-alone) (NFR-3) | 2 | 2 | 4 | MONITOR (P2) | axe-core scan + keyboard-nav E2E + contrast gate (QA) |
| R-010 | TECH | Sync better-sqlite3 blocks event loop under burst POSTs | 1 | 2 | 2 | DOCUMENT (P3) | Negligible at single-user/~100 items; note WAL + fast writes |
| R-012 | OPS | No prod telemetry/error-tracking thresholds | 2 | 1 | 2 | DOCUMENT (P3) | Documented hook; MVP local scope |
| R-013 | TECH | Multi-tab staleness until focus (no server push, NG-5) | 2 | 1 | 2 | DOCUMENT (P3) | Known v1 fence; refetch-on-focus |

**No score-9 BLOCK risks** — consistent with the low-complexity, single-entity, no-auth scope.

### 3.3 NFR Planning Assessment

| NFR Category | In scope? | Threshold | Planned evidence | Status |
|---|---|---|---|---|
| Security (SEC) | Yes (input-validation boundary; no auth) | All malformed/oversized inputs → 400; `description` rendered escaped; params-only SQL | API validation tests, XSS E2E, `npm audit` CI | Planned |
| Performance (PERF) | Yes | NFR-1 p50≤100 ms/p95≤800 ms (submit); NFR-2 time-to-usable≤10 s @≤100 items, slow 3G | k6 API latency, Playwright CDP timing, absolute bundle ceiling | Story 3.4 evidence recorded; CI proxy enforced |
| Reliability (DATA/OPS) | Yes | Zero data loss/corruption (binary); durable across restart | Integration failure-preservation tests, restart-persistence test, `/health` | Planned |
| Maintainability (TECH) | Yes | Layer separation enforced; **coverage % UNDEFINED** | Per-layer unit tests, coverage report, test-quality DoD | Planned — **threshold UNKNOWN (Q2)** → default CONCERNS |
| Accessibility | Yes | WCAG 2.2 AA; keyboard + SR; not color alone | axe-core scan, keyboard-nav E2E, contrast-regression gate | Planned |
| Scalability | No (single instance/user) | — | — | FYI / out of scope |
| Disaster Recovery | No (no RTO/RPO in MVP) | — | — | FYI / out of scope |

**Open clarifications (carried as risks/questions, not guessed):**
- **Q1 (→R-003):** Do NFR-1 p50/p95 and NFR-2 TTI targets gate **CI/production**, or apply only to "local dev conditions" as the PRD literally states? Determines whether perf tests are release-gating.
- **Q2 (maintainability):** No test-coverage threshold is defined anywhere. Per `nfr-criteria`, undefined → **CONCERNS** until set. Suggest adopting the matrix targets (P0 unit >90%, P1 >80%).
- **Q3 (→R-012):** Production telemetry/error-tracking thresholds undefined (acceptable to defer for MVP).

**Boundary:** this is NFR *planning*. PASS/CONCERNS/FAIL is decided later by `nfr-assess` against real implementation evidence.

## Step 5: Generate Outputs & Validate

**Resolved execution mode:** `sequential` (`tea_execution_mode: auto` → generated inline as single worker to preserve in-context analysis consistency).

**Outputs written:**
- `_bmad-output/test-artifacts/test-design/test-design-architecture.md`
- `_bmad-output/test-artifacts/test-design/test-design-qa.md`
- `_bmad-output/test-artifacts/test-design/the-long-finger-handoff.md` (BMAD handoff)

**Validation vs `checklist.md` (key items):**
- Risk matrix: unique IDs, categories, P/I ∈ {1,2,3}, scores = P×I, ≥6 flagged (R-001, R-009), mitigations specific ✅
- Coverage matrix: all FRs mapped, priorities assigned, risk linkage, no duplicate coverage across levels ✅
- Two-document split correct: architecture = concerns/WHAT+WHY (no test code, actionable-first); QA = recipe/HOW (deps near top, playwright-utils example with `expect` from `@playwright/test`, P0–P3 with "priority ≠ timing" note) ✅
- Execution strategy: simple PR/Nightly/Weekly, philosophy stated ✅
- Resource estimates: interval ranges, no false precision ✅
- Quality gates: P0=100%, P1≥95%, risk-tiered coverage, NFR evidence identified, final NFR status deferred to `nfr-assess` ✅
- Cross-doc consistency: same risk IDs, priorities, blockers (TC-1/2/3), date, author, PRD/ADR refs ✅
- Handoff: inventory paths, P0/P1 risk gates, story scenarios + data-testid, risk-to-story mapping, phase gates ✅
- No orphaned browser sessions (none opened); artifacts under `test_artifacts/` ✅

**Open assumptions carried:** Q1 perf gating = CI smoke + manual full; Q2 coverage = risk-tiered; Q3 prod telemetry thresholds deferred (R-012). TC-1/TC-2/TC-3 testability seams are Dev-owned pre-implementation blockers.

**Workflow status:** COMPLETED.

## Step 4: Coverage Plan & Execution Strategy

**Resolved policy (Keith):** Perf = **CI smoke + manual full** load test. Coverage = **risk-tiered targets** (P0 unit >90% / int >80%; P1 unit >80% / int >60%; P2 smoke).

Test IDs: `{FR|area}-{LEVEL}-{SEQ}`. Levels chosen per `test-levels-framework`; duplicate coverage avoided (logic→unit, contract→integration, render→component, journey→E2E).

### 4.1 Coverage Matrix

#### Data integrity & persistence — P0 (R-001, R-009; FR-9)
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| FR9-INT-001 | Create persists; GET returns it after a fresh DB connection | Integration | P0 | R-001 |
| FR9-INT-002 | Todo survives simulated backend restart (rebuild app on same DB file) | Integration | P0 | R-009 |
| FR9-E2E-001 | Create items → reload page → still present | E2E | P0 | R-001 |
| R001-INT-001 | Forced repo write-failure on create → 5xx envelope AND no partial row | Integration | P0 | R-001, TC-3 |
| R001-INT-002 | Forced failure on delete → row remains, 5xx envelope | Integration | P1 | R-001 |
| OPS-CFG-001 | Docker/compose mounts volume at `DATABASE_PATH`; startup logs path | Config/CI | P1 | R-009 |

#### Create & validation — P1 (FR-3, R-006, ASR-1)
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| FR3-API-001 | POST valid {id,description} → 201 full Todo (completed=false, timestamps) | Integration | P0 | — |
| FR3-UNIT-001 | description rule: reject empty/whitespace, accept 1 & 200, reject 201; trim | Unit | P1 | R-006 |
| FR3-API-002 | POST invalid descriptions → 400 + envelope field details | Integration | P1 | R-006 |
| FR3-API-003 | POST malformed/missing/non-UUIDv7 id → 400 | Integration | P1 | ASR-1 |
| FR3-CMP-001 | Form shows inline validation msg; success adds row without reload | Component | P1 | R-006, FR-3 |
| FR3-API-004 | POST same id twice → single row (idempotent create) | Integration | P2 | R-007 |

#### View & ordering — P1/P2 (FR-1, FR-2, FR-5, R-004)
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| FR5-UNIT-001 | `canonicalOrder()`: completed after active, then updated_at desc; ties | Unit | P1 | R-004, TC-1 |
| FR5-INT-001 | Repository GET returns canonical order with seeded timestamps | Integration | P2 | R-004, TC-1 |
| FR2-CMP-001 | Active vs completed visually distinct via label/control, not color alone | Component | P2 | FR-2, NFR-3 |
| FR1-CMP-001 | Empty state renders with create affordance | Component | P2 | FR-1 |
| FR7-CMP-001 | Loading state renders before data; no use-blocking layout shift | Component | P2 | FR-7 |

#### Complete / uncomplete — P1 (FR-4, FR-5, NG-7)
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| FR4-API-001 | PATCH completed=true → 200, updated_at advances | Integration | P1 | — |
| FR4-API-002 | PATCH completed=false (uncomplete) → 200 | Integration | P1 | — |
| FR4-API-003 | PATCH unknown id → 404 + envelope | Integration | P1 | — |
| FR4-API-004 | PATCH ignores/rejects description change (write-once, NG-7) | Integration | P2 | NG-7 |

#### Delete — P1 (FR-6, ASR-2, R-005)
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| FR6-API-001 | DELETE existing → 204, row gone | Integration | P1 | — |
| FR6-API-002 | DELETE non-existent id → 204 (idempotent) | Integration | P1 | R-005, ASR-2 |

#### Error recovery & optimistic UX — P1 (FR-8, R-002, ASR-4)
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| ASR4-CMP-001 | Mutation hook applies optimistic update onMutate; invalidates onSettled (mocked) | Component | P1 | ASR-4 |
| R002-E2E-001 | Forced API error → optimistic change rolls back to confirmed state (no silent discard) | E2E | P1 | R-002 |
| FR8-CMP-001 | Initial-load failure → error + retry affordance | Component | P1 | FR-8 |
| FR8-E2E-001 | Mock 500 on load → retry → recovers | E2E | P1 | FR-8 |

#### Core journey (UJ-1) — P1
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| UJ1-E2E-001 | View → create → complete → uncomplete → delete → reload persists | E2E | P1 | core loop |

#### Maintainability mapper — P1 (NFR-5, ASR-5)
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| NFR5-UNIT-001 | Repository mapper: snake↔camel, completed 0/1↔bool, ISO timestamps | Unit | P1 | ASR-5 |

#### API contract & health — P1/P2 (FR-10)
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| FR10-INT-001 | Uniform error envelope across 400/404/5xx | Integration | P1 | FR-8 |
| FR10-INT-002 | GET /health → 200 | Integration | P2 | R-009 |
| FR10-INT-003 | OpenAPI doc generated/served from TypeBox | Integration | P2 | — |

#### Security input boundary — P2 (R-008, no auth)
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| SEC-API-001 | Injection-style description round-trips literally (parameterized), no execution | Integration | P2 | R-008 |
| SEC-E2E-001 | XSS payload in description rendered escaped, not executed | E2E | P2 | R-008 |
| SEC-CI-001 | `npm audit` → no critical/high | CI | P2 | R-008 |

#### Accessibility & responsive — P1/P2 (NFR-3, NFR-4, R-014)
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| NFR3-E2E-001 | Keyboard-only: create/toggle/delete reachable & operable | E2E | P1 | R-014 |
| NFR3-E2E-002 | axe-core scan → zero critical violations (main view + states) | E2E | P2 | R-014 |
| NFR3-E2E-003 | Contrast-regression gate (committed) | E2E | P2 | R-014 |
| NFR4-E2E-001 | Responsive 320 px & desktop — no overlap/clipping | E2E | P2 | NFR-4 |

#### Performance — P2 (NFR-1/2, R-003, R-011) — *CI smoke + manual full*
| ID | Scenario | Level | Pri | Risk |
|---|---|---|---|---|
| NFR1-PERF-001 | k6 API latency under expected load → p50≤100 ms, p95≤800 ms | k6 (manual full) | P2 | R-003 |
| NFR1-PERF-002 | API latency smoke assertion on small run (CI) | k6/API (CI smoke) | P2 | R-003 |
| NFR2-PERF-001 | Playwright time-to-usable ≤10 s @100 items, throttled 3G + absolute bundle ceiling | Playwright evidence/CI size gate | P2 | R-011 |

### 4.2 NFR Coverage & Evidence Plan
- **Security** → SEC-API-001/E2E-001/CI-001 → evidence: integration+E2E pass, `npm audit` report.
- **Performance** → NFR1-PERF-001/002, NFR2-PERF-001 → evidence: k6 summary (manual full), CI smoke assertions, `size-limit` report. *Scope Q1: smoke gates CI; full load is manual/on-demand.*
- **Reliability** → FR9-INT-001/002, R001-INT-001/002, FR10-INT-002 → evidence: integration suite + restart test + `/health`.
- **Maintainability** → NFR5-UNIT-001 + coverage report (risk-tiered) + test-quality DoD → evidence: coverage JSON, lint/arch checks.
- **Accessibility** → NFR3-E2E-001/002/003 → evidence: axe report + contrast-gate artifact.
- Thresholds for these are defined above; full PASS/CONCERNS/FAIL deferred to `nfr-assess`.

### 4.3 Execution Strategy (PR / Nightly / Weekly)
- **PR (<15 min):** all unit + component + API integration; critical E2E (UJ1-E2E-001, FR9-E2E-001, R002-E2E-001, FR8-E2E-001, NFR3-E2E-001); axe + contrast gate; perf **smoke** (NFR1-PERF-002, NFR2-PERF-001); `npm audit`.
- **Nightly:** full E2E across viewports (NFR4, SEC-E2E, axe full), full k6 load test (NFR1-PERF-001) if not run manually.
- **Weekly / on-demand:** exploratory + extended soak; manual full perf sign-off.

### 4.4 Resource Estimates (ranges)
- P0 (~6 scenarios): **~12–20 h** (incl. test harness `build-test-app.ts` w/ per-test DB isolation, TC-2).
- P1 (~17 scenarios): **~24–40 h**.
- P2 (~16 scenarios): **~16–30 h** (incl. k6 + Lighthouse + axe setup).
- P3 (exploratory): **~2–5 h**.
- **Total: ~54–95 h**; front-load P0 harness + data-loss coverage first.

### 4.5 Quality Gates
- **P0 pass rate = 100%**; **P1 ≥ 95%**.
- **R-001 and R-009 mitigations verified** (data-loss + restart-persistence tests green) before release — these are the only score-6 risks.
- **Coverage (risk-tiered):** P0 unit >90% / int >80%; P1 unit >80% / int >60%; P2 smoke. Maintainability NFR clears CONCERNS once met.
- **a11y:** axe zero critical violations + contrast gate green.
- **Perf:** CI smoke within budget (p95≤800 ms tripwire, bundle within absolute ceiling); manual strict k6 and slow-3G Playwright evidence before release.
- NFR evidence sources identified for every in-scope category; final NFR status deferred to `nfr-assess`.
