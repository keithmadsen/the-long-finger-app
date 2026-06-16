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

# Test Design for Architecture: the long finger (MVP Todo App)

**Purpose:** Architectural testability concerns, NFR requirements, and the data-loss risks Engineering must address before test development begins. Contract between QA and Engineering.

**Date:** 2026-06-15
**Author:** Keith (TEA — Master Test Architect)
**Status:** Architecture Review Pending
**Project:** the long finger
**PRD Reference:** `docs/prd.md`
**ADR Reference:** `_bmad-output/planning-artifacts/architecture.md`

---

## Executive Summary

**Scope:** System-level test design for the single-user Todo MVP — 4 REST endpoints (`GET/POST /todos`, `PATCH/DELETE /todos/{id}`) + `/health`, React+Vite SPA with optimistic UI, SQLite persistence.

**Architecture (from ADR):**
- Fastify v5 clean-architecture (routes → handlers → services → domains → repositories), Awilix cradle DI.
- `better-sqlite3` single `todos` table behind a repository boundary; client-generated UUIDv7; TypeBox contract shared via `@tlf/contracts`.
- Single Docker image (Fastify serves built SPA); SQLite file on a mounted volume.

**Expected scale:** single user, ~100 items. No auth, no multi-user (NG-1/NG-2).

**Risk Summary:**
- **Total risks:** 14 — **2 high-priority (≥6)**, 9 medium (4), 3 low (2). No score-9 blockers.
- **Test effort:** ~45 scenarios, ~54–95 h (≈1.5–2.5 weeks for 1 QA; ≈1–1.5 weeks for 2).

---

## Quick Guide

### 🚨 BLOCKERS — Team Must Decide (test development blocked without these)

1. **TC-2: Per-test DB isolation** — `build-test-app.ts` must give each test/worker a unique temp SQLite file with teardown, or integration tests can't run in parallel safely (Backend/Dev, pre-implementation).
2. **TC-3: Repository fault-injection seam** — expose the Awilix cradle so tests can inject a failing/fake repository; without it, FR-8 server-side 5xx paths and R-001 can't be exercised (Backend/Dev, pre-implementation).
3. **TC-1: Timestamp control for ordering** — `created_at`/`updated_at` are server-set, so FR-5 canonical ordering can't be tested deterministically via the public API. Provide an injectable clock or repo-level timestamp seeding (Backend/Dev, pre-implementation).

**What we need:** complete these 3 seams pre-implementation or integration test development is blocked.

### ⚠️ HIGH PRIORITY — Team Should Validate (recommendation provided, you approve)

1. **R-001 (DATA, score 6):** mutation failures must not lose/corrupt data — atomic single-row writes + WAL; failed write persists nothing partial (Dev/Arch approve).
2. **R-009 (OPS, score 6):** Docker/compose must mount a volume at `DATABASE_PATH`; startup logs the resolved DB path (Dev/Ops approve).
3. **R-011 (PERF):** add a `size-limit` bundle gate to `ci.yml` so NFR-2 TTI can't silently regress (Dev approve).

### 📋 INFO ONLY — Solutions Provided (review, no decision)

1. **Test strategy:** logic→unit (Vitest), contract→integration (Vitest + temp SQLite), render→component (Testing Library), journey→E2E (Playwright). No duplicate coverage across levels.
2. **Tooling:** Vitest, Playwright + axe-core, k6, Lighthouse, `size-limit`, `npm audit`.
3. **Tiered CI:** PR (<15 min, all functional + a11y + perf smoke), Nightly (full E2E + k6), Weekly/on-demand (exploratory).
4. **Coverage:** ~45 scenarios prioritized P0–P3 (see QA doc).
5. **Perf gating (decided):** CI smoke gates PRs; full k6 load test is manual/on-demand (per Q1 resolution).

---

## Risk Assessment

**Total risks identified:** 14 (2 high ≥6, 9 medium=4, 3 low=2).

### High-Priority Risks (Score ≥6) — IMMEDIATE ATTENTION

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
|---|---|---|---|---|---|---|---|---|
| **R-001** | **DATA** | Data loss/corruption on a failed create/complete/delete (NFR-6, FR-9) | 2 | 3 | **6** | Atomic single-row writes + WAL; verify no partial persist on failure | Dev/QA | Pre-release |
| **R-009** | **OPS** | SQLite volume not mounted / wrong `DATABASE_PATH` → data lost on restart | 2 | 3 | **6** | Mounted volume + startup path check + restart-persistence test | Dev/Ops | Pre-release |

### Medium-Priority Risks (Score 3–5)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation |
|---|---|---|---|---|---|---|
| R-002 | DATA | Optimistic rollback leaves client state inconsistent with server | 2 | 2 | 4 | `onSettled` invalidate; E2E rollback test |
| R-003 | PERF | API p95 > 800 ms or TTI > 1 s on 3G (NFR-1/2) | 2 | 2 | 4 | k6 + Lighthouse; smoke gate |
| R-004 | DATA | Canonical ordering wrong (ties; write-once vs `updated_at`) | 2 | 2 | 4 | Repo ordering tests w/ seeded timestamps (TC-1) |
| R-005 | BUS | DELETE idempotency violated (404 vs 204; double-delete) | 2 | 2 | 4 | Idempotency contract test |
| R-006 | BUS | Description validation bypass (empty/whitespace/>200, trim) | 2 | 2 | 4 | Client+server validation, boundary 0/1/200/201 |
| R-007 | DATA | Idempotent create fails → duplicate todos on retry | 2 | 2 | 4 | Same-id POST twice → single row |
| R-008 | SEC | Stored XSS / injection via `description` (input validation is only defense) | 2 | 2 | 4 | React escaping + parameterized queries; XSS test |
| R-011 | PERF | No bundle-size CI gate → silent TTI regression (NFR-2) | 2 | 2 | 4 | `size-limit` gate in `ci.yml` |
| R-014 | TECH | WCAG 2.2 AA gaps (keyboard, SR, not color alone) (NFR-3) | 2 | 2 | 4 | axe-core + keyboard E2E + contrast gate |

### Low-Priority Risks (Score 1–2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
|---|---|---|---|---|---|---|
| R-010 | TECH | Sync better-sqlite3 blocks event loop under burst POSTs | 1 | 2 | 2 | Monitor (negligible at single-user scale) |
| R-012 | OPS | No prod telemetry/error-tracking thresholds | 2 | 1 | 2 | Monitor (documented hook, MVP local) |
| R-013 | TECH | Multi-tab staleness until focus (no server push, NG-5) | 2 | 1 | 2 | Monitor (known v1 fence) |

#### Risk Category Legend

- **TECH** Technical/Architecture · **SEC** Security · **PERF** Performance · **DATA** Data Integrity · **BUS** Business Impact · **OPS** Operations

---

## NFR Testability Requirements

Planning guidance — what architecture must provide so NFR validation can be automated later. Final PASS/CONCERNS/FAIL is decided by `nfr-assess` after implementation.

| NFR Category | Threshold / Requirement | Current Design Support | Gap / Decision Needed | Planned Evidence |
|---|---|---|---|---|
| Security | Reject malformed/oversized inputs (400); `description` rendered escaped; params-only SQL (no auth, NG-1/2) | Supported (TypeBox/Ajv at boundary; React escaping) | None | API validation tests, XSS E2E, `npm audit` |
| Performance | NFR-1 p50≤100 ms / p95≤800 ms (submit); NFR-2 TTI≤1 s @≤100 items, slow 3G | Partial (no metrics endpoint; budget not gated) | **Q1: gating scope** (resolved → CI smoke + manual full); add `size-limit` gate | k6 summary, Lighthouse, `size-limit` report |
| Reliability | Zero data loss/corruption; durable across restart (NFR-6/FR-9) | Supported (atomic writes, WAL, mounted volume) — needs TC-3 seam | Fault-injection seam (TC-3); volume mount (R-009) | Integration failure-preservation + restart test, `/health` |
| Maintainability | Layer separation; **coverage % UNDEFINED** | Supported (clean-arch boundary) | **Q2 (resolved): risk-tiered coverage** targets adopted | Coverage report, lint/arch checks, test-quality DoD |
| Accessibility | WCAG 2.2 AA; keyboard + SR; not color alone (NFR-3) | Supported (UX committed contrast gate) | None | axe-core scan + keyboard E2E + contrast gate |

**Unknown thresholds:** Q3 — production telemetry/error-tracking thresholds undefined (acceptable to defer for MVP; tracked as R-012). Scalability and Disaster Recovery are out of scope for v1 (single instance/user; no RTO/RPO).

**Assessment boundary:** final NFR status belongs in `nfr-assess`.

---

## Testability Concerns and Architectural Gaps

### 🚨 ACTIONABLE CONCERNS — Architecture Team Must Address

| Concern | Impact on testing | What architecture must provide | Owner | Timeline |
|---|---|---|---|---|
| **TC-2 Per-test DB isolation** | Integration tests pollute/contend on one SQLite file → can't parallelize | Unique temp DB file per test/worker + teardown in `build-test-app.ts` | Backend/Dev | Pre-impl |
| **TC-3 Fault-injection seam** | Can't exercise FR-8 server 5xx paths or R-001 | Cradle injection of a failing/fake repository in tests | Backend/Dev | Pre-impl |
| **TC-1 Timestamp control** | FR-5 ordering not deterministically testable (server-set timestamps) | Injectable clock or repo-level timestamp seeding | Backend/Dev | Pre-impl |

**Improvements (lower urgency):**
- **TC-5 Latency observability is log-only** — p50/p95 only in pino logs, no aggregation. Perf validation must parse logs or rely on k6 summary. Acceptable for MVP; revisit if prod telemetry is added (R-012).

### Testability Assessment Summary (FYI)

**What works well:**
- Clean-arch + Awilix → repository is swappable (in-memory/fake) for fast unit/service tests.
- **Client-generated UUIDv7** → tests own the id before the call (no id-extraction race; idempotent create/delete make retries safe).
- 100% of business logic reachable via the 4 REST endpoints — no UI dependency for core-logic testing.
- Uniform error envelope + ISO-8601 timestamps + `/health` → deterministic assertions.

**Accepted trade-offs (no action for v1):**
- No server push; multi-tab reconciliation via refetch-on-focus (R-013) — acceptable per NG-5.
- Synchronous SQLite (R-010) — negligible at single-user/~100-item scale.

---

## Risk Mitigation Plans (High-Priority Risks ≥6)

### R-001: Data loss/corruption on failed mutation (Score 6) — HIGH

**Mitigation Strategy:**
1. All writes are single-row and atomic; enable WAL on connection open.
2. On a forced repository write failure, the API returns a 5xx error envelope and persists nothing partial.
3. Integration tests (via TC-3 seam) assert the last backend-confirmed state is preserved after a failed create/complete/delete.

**Owner:** Dev + QA · **Timeline:** Pre-release · **Status:** Planned · **Verification:** `R001-INT-001/002` green; no partial rows after induced failure.

### R-009: SQLite volume misconfig → data lost on restart (Score 6) — HIGH

**Mitigation Strategy:**
1. Dockerfile/compose mounts a persistent volume at `DATABASE_PATH`.
2. App logs the resolved DB path at startup (catches misconfig early).
3. Restart-persistence test rebuilds the app against the same DB file and confirms data survives.

**Owner:** Dev/Ops · **Timeline:** Pre-release · **Status:** Planned · **Verification:** `FR9-INT-002` + `OPS-CFG-001` green; data present after container restart.

---

## Assumptions and Dependencies

**Assumptions:**
1. NFR-1/NFR-2 targets are honored as CI smoke gates + manual full perf sign-off (Q1 resolution); they are not full release-gating load tests.
2. Risk-tiered coverage targets adopted (Q2): P0 unit >90% / int >80%; P1 unit >80% / int >60%.
3. Single-user, ~100-item scale holds for v1 (no concurrency/scale testing needed).

**Dependencies:**
1. TC-1/TC-2/TC-3 testability seams — required before integration test development.
2. Volume-mounted deployment config (R-009) — required before restart-persistence test.

**Risks to plan:**
- **Risk:** TC seams slip → integration coverage delayed. **Impact:** P0 data-loss tests blocked. **Contingency:** cover R-001 via service-layer unit tests with a fake failing repo until the integration seam lands.

---

**End of Architecture Document.** Next: Architecture team resolves the 3 blockers and approves R-001/R-009/R-011 mitigations; QA proceeds per `test-design-qa.md`.
