---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-06-15'
workflowType: 'testarch-test-design'
inputDocuments:
  - docs/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
---

# Test Design for QA: the long finger (MVP Todo App)

**Purpose:** Test execution recipe — what to test, how, at which level, and what QA needs from other teams.

**Date:** 2026-06-15
**Author:** Keith (TEA — Master Test Architect)
**Status:** Draft
**Project:** the long finger

**Related:** see `test-design-architecture.md` for testability blockers and risk mitigation plans.

---

## Executive Summary

**Scope:** the single-user Todo MVP — 4 REST endpoints + `/health`, React+Vite SPA with optimistic UI, SQLite persistence.

**Risk Summary:** 14 risks — 2 high (≥6: R-001, R-009, both data-loss), 9 medium (4), 3 low (2). Critical category: **DATA**.

**Coverage Summary:**
- P0: ~5 (data integrity, persistence, valid create)
- P1: ~20 (CRUD contracts, error recovery, optimistic rollback, UJ-1, mapper, keyboard a11y)
- P2: ~17 (ordering, idempotency, security boundary, perf smoke, responsive)
- P3: exploratory
- **Total:** ~45 scenarios (~1.5–2.5 weeks, 1 QA)

---

## Not in Scope

| Item | Reasoning | Mitigation |
|---|---|---|
| Auth / multi-user | NG-1/NG-2 — not in MVP | No auth surface to test; input validation is the security boundary |
| Search / filter / sort | NG-4 | No code path exists |
| Offline / cross-device sync | NG-5 | No service worker; multi-tab via refetch-on-focus (R-013) |
| Description editing | NG-7 | PATCH only mutates `completed`; covered by FR4-API-004 |
| Scalability / load beyond ~100 items | Single-user MVP scope | Burst tolerance documented (R-010) |
| Disaster recovery (RTO/RPO) | Out of MVP scope | Durability covered by FR9 restart test |

---

## Dependencies & Test Blockers

**CRITICAL:** QA cannot proceed without these. Full mitigation detail in the Architecture doc "Quick Guide".

### Backend/Architecture Dependencies (Pre-Implementation)

1. **TC-2 Per-test DB isolation** — Backend/Dev — pre-impl. `build-test-app.ts` must hand each test/worker a unique temp SQLite file + teardown. Blocks parallel integration tests.
2. **TC-3 Fault-injection seam** — Backend/Dev — pre-impl. Cradle must allow injecting a failing/fake repository. Blocks FR-8 server 5xx and R-001 tests.
3. **TC-1 Timestamp control** — Backend/Dev — pre-impl. Injectable clock or repo-level timestamp seeding. Blocks deterministic FR-5 ordering tests.

### QA Infrastructure Setup (Pre-Implementation)

1. **Test data factories** — QA. `todo` factory with faker-based description + client-generated UUIDv7; helper to seed via `POST /todos`.
2. **Test environments** — QA. Local: Vitest workspace (`unit` + `integration` projects) + temp SQLite; CI: GitHub Actions matrix (unit / integration / E2E / a11y / perf-smoke); fresh `QueryClient` per frontend test, retries disabled.

**Example factory + API setup pattern:**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { v7 as uuidv7 } from 'uuid';

test('create persists a todo @p0 @API', async ({ apiRequest }) => {
  const todo = { id: uuidv7(), description: faker.lorem.words(3) };

  const { status, body } = await apiRequest({
    method: 'POST',
    path: '/todos',
    body: todo,
  });

  expect(status).toBe(201);
  expect(body.id).toBe(todo.id);
  expect(body.completed).toBe(false);
});
```

---

## Risk Assessment

Full detail in the Architecture doc. QA-relevant summary:

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Score | QA Test Coverage |
|---|---|---|---|---|
| **R-001** | DATA | Data loss/corruption on failed mutation | **6** | R001-INT-001/002: induce repo failure → state preserved, no partial row |
| **R-009** | OPS | Volume misconfig → data lost on restart | **6** | FR9-INT-002 + OPS-CFG-001: data survives simulated restart; volume asserted |

### Medium/Low-Priority Risks

| Risk ID | Category | Description | Score | QA Test Coverage |
|---|---|---|---|---|
| R-002 | DATA | Optimistic rollback inconsistency | 4 | R002-E2E-001: forced error → UI rolls back |
| R-003 | PERF | Latency / TTI budget breach | 4 | NFR1-PERF-001/002, NFR2-PERF-001 |
| R-004 | DATA | Wrong canonical ordering | 4 | FR5-UNIT-001 + FR5-INT-001 (seeded timestamps) |
| R-005 | BUS | DELETE idempotency violated | 4 | FR6-API-002 (404→204 idempotent) |
| R-006 | BUS | Description validation bypass | 4 | FR3-UNIT-001 + FR3-API-002 (boundary 0/1/200/201) |
| R-007 | DATA | Duplicate create on retry | 4 | FR3-API-004 (same id twice → single row) |
| R-008 | SEC | Stored XSS / injection via description | 4 | SEC-API-001 + SEC-E2E-001 + SEC-CI-001 |
| R-011 | PERF | No bundle-size gate | 4 | NFR2-PERF-001 (`size-limit`) |
| R-014 | TECH | WCAG 2.2 AA gaps | 4 | NFR3-E2E-001/002/003 |
| R-010 | TECH | Sync SQLite event-loop block | 2 | Monitor (no dedicated test) |
| R-012 | OPS | No prod telemetry thresholds | 2 | Monitor (deferred) |
| R-013 | TECH | Multi-tab staleness | 2 | Monitor (known fence) |

---

## NFR Test Coverage Plan

| NFR Category | Requirement / Threshold | Planned Validation | Tool / Level | Evidence Artifact | Priority |
|---|---|---|---|---|---|
| Security | Reject malformed/oversized inputs (400); escape `description`; params-only SQL | Validation + injection/XSS tests | API + E2E + `npm audit` | Test results + audit report | P2 |
| Performance | p50≤100 ms / p95≤800 ms; time-to-usable≤10 s @≤100 items (slow 3G) | API latency + time-to-usable + bundle | k6 (manual full) / Playwright CDP evidence + bundle ceiling | k6 summary, browser timing, size report | P2 |
| Reliability | Zero data loss; durable across restart | Failure-preservation + restart tests | Integration + `/health` | Integration results | P0/P1 |
| Maintainability | Risk-tiered coverage; layer separation | Per-layer unit + coverage report | Vitest + CI | Coverage JSON, lint/arch checks | P1 |
| Accessibility | WCAG 2.2 AA; keyboard + SR; not color alone | axe scan + keyboard nav + contrast | Playwright + axe-core | axe report, contrast-gate artifact | P1/P2 |

**Missing thresholds / clarifications:** Q1 (perf gating) resolved → CI smoke + manual full. Q2 (coverage) resolved → risk-tiered targets. Q3 (prod telemetry thresholds) deferred for MVP (R-012). Final PASS/CONCERNS/FAIL deferred to `nfr-assess`.

---

## Entry Criteria

- [ ] TC-1/TC-2/TC-3 testability seams delivered (see Dependencies)
- [ ] Test environments provisioned (Vitest workspace, temp SQLite, Playwright)
- [ ] `todo` factory + API seeding helper ready
- [ ] Feature deployed to a test environment with a mounted SQLite volume
- [ ] PRD assumptions agreed by QA/Dev/PM

## Exit Criteria

- [ ] All P0 tests passing (100%)
- [ ] All P1 tests passing or triaged/accepted (≥95%)
- [ ] R-001 and R-009 mitigations verified (data-loss + restart-persistence green)
- [ ] Risk-tiered coverage met (P0 unit >90% / int >80%; P1 unit >80% / int >60%)
- [ ] axe zero critical violations + contrast gate green
- [ ] Perf smoke within budget; manual k6 sign-off recorded
- [ ] No open high-severity bugs

---

## Test Coverage Plan

**IMPORTANT:** P0/P1/P2/P3 = **priority / risk level** (what to focus on if time-constrained), NOT execution timing. See Execution Strategy for *when* tests run.

### P0 (Critical)

**Criteria:** Blocks core functionality + high risk (≥6) + no workaround.

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---|---|---|---|---|
| **FR3-API-001** | POST valid {id,description} → 201 full Todo | Integration | — | completed=false, timestamps set |
| **FR9-INT-001** | Create persists; GET returns after fresh DB connection | Integration | R-001 | — |
| **FR9-INT-002** | Todo survives simulated backend restart (same DB file) | Integration | R-009 | rebuild app on same file |
| **FR9-E2E-001** | Create items → reload page → still present | E2E | R-001 | — |
| **R001-INT-001** | Forced repo write-failure on create → 5xx envelope, no partial row | Integration | R-001 | needs TC-3 |

**Total P0:** ~5 tests

### P1 (High)

**Criteria:** Critical paths + medium risk + common workflows.

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---|---|---|---|---|
| **R001-INT-002** | Forced failure on delete → row remains, 5xx | Integration | R-001 | needs TC-3 |
| **OPS-CFG-001** | Volume mounted at `DATABASE_PATH`; startup logs path | Config/CI | R-009 | — |
| **FR3-UNIT-001** | description rule: reject empty/whitespace, accept 1 & 200, reject 201; trim | Unit | R-006 | boundaries |
| **FR3-API-002** | invalid descriptions → 400 + envelope field details | Integration | R-006 | — |
| **FR3-API-003** | malformed/missing/non-UUIDv7 id → 400 | Integration | ASR-1 | — |
| **FR3-CMP-001** | form shows inline validation msg; success adds row without reload | Component | R-006 | — |
| **FR5-UNIT-001** | `canonicalOrder()`: completed after active, then updated_at desc; ties | Unit | R-004 | needs TC-1 |
| **FR4-API-001** | PATCH completed=true → 200, updated_at advances | Integration | — | — |
| **FR4-API-002** | PATCH completed=false (uncomplete) → 200 | Integration | — | — |
| **FR4-API-003** | PATCH unknown id → 404 + envelope | Integration | — | — |
| **FR6-API-001** | DELETE existing → 204, row gone | Integration | — | — |
| **FR6-API-002** | DELETE non-existent id → 204 (idempotent) | Integration | R-005 | — |
| **ASR4-CMP-001** | mutation hook: optimistic onMutate; invalidate onSettled (mocked) | Component | — | — |
| **R002-E2E-001** | forced API error → optimistic change rolls back; no silent discard | E2E | R-002 | — |
| **FR8-CMP-001** | initial-load failure → error + retry affordance | Component | FR-8 | — |
| **FR8-E2E-001** | mock 500 on load → retry → recovers | E2E | FR-8 | — |
| **UJ1-E2E-001** | view → create → complete → uncomplete → delete → reload persists | E2E | core loop | — |
| **NFR5-UNIT-001** | repository mapper: snake↔camel, completed 0/1↔bool, ISO | Unit | ASR-5 | — |
| **FR10-INT-001** | uniform error envelope across 400/404/5xx | Integration | FR-8 | — |
| **NFR3-E2E-001** | keyboard-only: create/toggle/delete reachable & operable | E2E | R-014 | — |

**Total P1:** ~20 tests

### P2 (Medium)

**Criteria:** Secondary flows + low/medium risk + edge cases.

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---|---|---|---|---|
| **FR3-API-004** | POST same id twice → single row (idempotent create) | Integration | R-007 | — |
| **FR5-INT-001** | repository GET returns canonical order (seeded timestamps) | Integration | R-004 | needs TC-1 |
| **FR2-CMP-001** | active vs completed distinct via label/control, not color alone | Component | NFR-3 | — |
| **FR1-CMP-001** | empty state renders with create affordance | Component | FR-1 | — |
| **FR7-CMP-001** | loading state renders before data; no use-blocking shift | Component | FR-7 | — |
| **FR4-API-004** | PATCH ignores/rejects description change (write-once) | Integration | NG-7 | — |
| **FR10-INT-002** | GET /health → 200 | Integration | R-009 | — |
| **FR10-INT-003** | OpenAPI doc generated/served from TypeBox | Integration | — | — |
| **SEC-API-001** | injection-style description round-trips literally (parameterized) | Integration | R-008 | — |
| **SEC-E2E-001** | XSS payload rendered escaped, not executed | E2E | R-008 | — |
| **SEC-CI-001** | `npm audit` → no critical/high | CI | R-008 | — |
| **NFR3-E2E-002** | axe-core scan → zero critical violations | E2E | R-014 | — |
| **NFR3-E2E-003** | contrast-regression gate | E2E | R-014 | committed in UX |
| **NFR4-E2E-001** | responsive 320 px & desktop — no overlap/clipping | E2E | NFR-4 | — |
| **NFR1-PERF-002** | API latency smoke assertion (small run) | k6/API | R-003 | CI smoke |
| **NFR2-PERF-001** | Playwright time-to-usable ≤10 s @100 items (slow 3G) + absolute bundle ceiling | Playwright evidence/CI size gate | R-011 | Release evidence + CI proxy |
| **NFR1-PERF-001** | k6 API latency under expected load → p50≤100 ms, p95≤800 ms | k6 | R-003 | manual full |

**Total P2:** ~17 tests

### P3 (Low)

**Criteria:** Exploratory + benchmarks.

| Test ID | Requirement | Test Level | Notes |
|---|---|---|---|
| **EXP-001** | Exploratory session on create/complete/delete edge inputs (emoji, RTL, max-length boundaries) | Manual/E2E | time-boxed |

**Total P3:** exploratory (time-boxed)

---

## Execution Strategy

**Philosophy:** run everything in PRs unless there's significant infrastructure overhead. Vitest + Playwright parallelize fast (the full functional suite here is well under 15 min).

### Every PR (~<15 min)
- All Vitest unit + integration (separate `unit`/`integration` projects, isolated temp DBs).
- All component tests; critical E2E (UJ1-E2E-001, FR9-E2E-001, R002-E2E-001, FR8-E2E-001, NFR3-E2E-001).
- a11y: axe + contrast gate. Security: `npm audit`. Perf **smoke**: NFR1-PERF-002, NFR2-PERF-001 (`size-limit`).

### Nightly (~30–60 min)
- Full E2E across viewports (NFR4, SEC-E2E, full axe), full k6 load test (NFR1-PERF-001) if not run manually.

### Weekly / on-demand
- Exploratory (EXP-001); manual full perf sign-off.

---

## QA Effort Estimate

QA test-development effort only (excludes the Dev-owned TC-1/2/3 seams and OPS volume config).

| Priority | Count | Effort Range | Notes |
|---|---|---|---|
| P0 | ~5 | ~8–14 h | Data-integrity/persistence; depends on TC-2/TC-3 seams |
| P1 | ~20 | ~22–36 h | CRUD contracts, error recovery, optimistic rollback, a11y |
| P2 | ~17 | ~14–26 h | Edge cases, security, perf + a11y tooling setup |
| P3 | exploratory | ~2–5 h | Time-boxed |
| **Total** | ~45 | **~46–81 h** | **1 QA, full-time (~1.5–2.5 weeks)** |

**Assumptions:** includes test design, implementation, debugging, CI integration; excludes ~10% ongoing maintenance; assumes factories/fixtures ready and TC seams delivered.

---

## Implementation Planning Handoff

| Work Item | Owner | Target Milestone | Dependencies/Notes |
|---|---|---|---|
| TC-1/2/3 testability seams | Dev | Pre-impl | Blocks integration tests |
| `todo` factory + API seed helper | QA | Pre-impl | — |
| Vitest workspace (unit/integration split, isolated temp DB) | QA/Dev | Pre-impl | TC-2 |
| `size-limit` bundle gate in `ci.yml` | Dev | With CI setup | R-011 |
| Perf smoke (k6 small + Lighthouse) wired into PR CI | QA | With CI setup | Q1 resolution |

---

## Tooling & Access

| Tool / Service | Purpose | Access Required | Status |
|---|---|---|---|
| Vitest | unit + integration | repo dev dep | Ready (planned) |
| Playwright + axe-core | E2E + a11y + contrast gate | repo dev dep | Ready (planned) |
| k6 | API load (manual full / nightly) | local/CI runner | Pending |
| Lighthouse + `size-limit` | TTI + bundle smoke | CI | Pending |

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope | Validation Steps |
|---|---|---|---|
| `@tlf/contracts` (TypeBox) | Shared by API + web | Any schema change re-validates both | Run full integration + component suites |
| Repository / SQLite | Sole DB-aware module | Mapper + persistence | NFR5-UNIT-001 + FR9-INT-* |

Greenfield project — no existing suites to regress against; this plan establishes the baseline.

---

## Appendix A: Code Examples & Tagging

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';
import { v7 as uuidv7 } from 'uuid';

// P1 @API DELETE is idempotent — 204 whether or not the row exists (R-005)
test('@p1 @API delete is idempotent', async ({ apiRequest }) => {
  const id = uuidv7();
  const first = await apiRequest({ method: 'DELETE', path: `/todos/${id}` });
  expect(first.status).toBe(204);

  const second = await apiRequest({ method: 'DELETE', path: `/todos/${id}` });
  expect(second.status).toBe(204); // idempotent — no 404
});
```

```bash
# PR default — full functional suite
npx playwright test
# P0 only
npx playwright test --grep @p0
# P0 + P1
npx playwright test --grep "@p0|@p1"
```

---

## Appendix B: Knowledge Base References

- **risk-governance.md** — risk scoring methodology
- **probability-impact.md** — P×I scale and thresholds
- **test-levels-framework.md** — E2E vs API vs Component vs Unit selection
- **test-priorities-matrix.md** — P0–P3 criteria + coverage targets
- **test-quality.md** — Definition of Done (no hard waits, <300 lines, <1.5 min, self-cleaning)
- **nfr-criteria.md** — NFR validation criteria

---

**Generated by:** BMad TEA Agent · **Workflow:** `bmad-testarch-test-design` · **Version:** 4.0 (BMad v6)
