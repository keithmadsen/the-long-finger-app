---
title: 'TEA Test Design → BMAD Handoff Document'
version: '1.0'
workflowType: 'testarch-test-design-handoff'
inputDocuments:
  - docs/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
sourceWorkflow: 'testarch-test-design'
generatedBy: 'TEA Master Test Architect'
generatedAt: '2026-06-15'
projectName: 'the long finger'
---

# TEA → BMAD Integration Handoff

## Purpose

Bridges this test design with BMAD's `create-epics-and-stories` workflow so risk classification, quality gates, and critical test scenarios flow into epic/story decomposition and acceptance criteria.

## TEA Artifacts Inventory

| Artifact | Path | BMAD Integration Point |
|---|---|---|
| Test Design (Architecture) | `_bmad-output/test-artifacts/test-design/test-design-architecture.md` | Epic quality gates, testability blockers as pre-impl tasks |
| Test Design (QA) | `_bmad-output/test-artifacts/test-design/test-design-qa.md` | Story acceptance criteria, test scenarios |
| Risk Assessment | (embedded, both docs) | Epic risk classification, story priority |
| Coverage Strategy | (embedded in QA doc) | Story test requirements |
| Progress / working notes | `_bmad-output/test-artifacts/test-design-progress.md` | Audit trail |

## Epic-Level Integration Guidance

### Risk References (P0/P1 → epic-level quality gates)

- **R-001 (DATA, 6)** — data loss/corruption on failed mutation. Gate any "persistence/API mutation" epic on the data-loss preservation tests (R001-INT-001/002).
- **R-009 (OPS, 6)** — volume misconfig → data lost on restart. Gate the "deployment/packaging" epic on the restart-persistence test (FR9-INT-002 + OPS-CFG-001).
- **R-002/R-006/R-008 (4)** — optimistic rollback, validation bypass, stored XSS. Attach to the relevant frontend/API epics as story-level acceptance criteria.

### Quality Gates (per epic)

| Epic theme | Gate |
|---|---|
| Foundation / repo + persistence | P0 data-integrity tests green; mapper unit test (NFR5-UNIT-001); per-test DB isolation (TC-2) in place |
| API (4 endpoints + health) | All contract integration tests green; uniform error envelope (FR10-INT-001); DELETE idempotency (FR6-API-002) |
| Frontend CRUD + optimistic UI | UJ1-E2E-001 + R002-E2E-001 green; FR-8 error/retry; keyboard a11y (NFR3-E2E-001) |
| Deployment / CI | Restart-persistence (R-009) green; `size-limit` + perf smoke wired; risk-tiered coverage met |

## Story-Level Integration Guidance

### P0/P1 Test Scenarios → Story Acceptance Criteria

- **Create:** valid create returns 201 + persists (FR3-API-001, FR9-INT-001); invalid/oversized/empty rejected with 400 envelope (FR3-API-002, FR3-UNIT-001).
- **Complete/uncomplete:** PATCH toggles `completed`, 404 on unknown id, description immutable (FR4-API-001/002/003/004).
- **Delete:** 204 on success and on already-deleted (FR6-API-001/002).
- **Persistence:** survives reload and backend restart (FR9-E2E-001, FR9-INT-002).
- **Error recovery + optimistic:** failed mutation rolls back, last state preserved, retry recovers (R002-E2E-001, FR8-*).
- **Ordering:** `completed ASC, updated_at DESC` (FR5-UNIT-001) — requires timestamp-control seam (TC-1).

### Data-TestId Requirements (for stable E2E selectors)

Recommend these `data-testid` attributes in the SPA:
`todo-list`, `todo-item`, `todo-toggle` (checkbox/control), `todo-delete`, `new-todo-input`, `new-todo-submit`, `validation-message`, `empty-state`, `loading-indicator`, `error-banner`, `retry-button`.

## Risk-to-Story Mapping

| Risk ID | Category | P×I | Recommended Story/Epic | Test Level |
|---|---|---|---|---|
| R-001 | DATA | 6 | Repository + persistence story (Foundation epic) | Integration |
| R-009 | OPS | 6 | Deployment/packaging story (CI/Deploy epic) | Integration/Config |
| R-002 | DATA | 4 | Optimistic mutations story (Frontend epic) | E2E |
| R-003 | PERF | 4 | CI/perf-smoke story (CI epic) | k6/Lighthouse |
| R-004 | DATA | 4 | Ordering story (Foundation/API epic) | Unit/Integration |
| R-005 | BUS | 4 | Delete story (API epic) | Integration |
| R-006 | BUS | 4 | Create + validation story (API/Frontend epic) | Unit/Integration/Component |
| R-007 | DATA | 4 | Create idempotency story (API epic) | Integration |
| R-008 | SEC | 4 | Input-boundary story (API/Frontend epic) | Integration/E2E/CI |
| R-011 | PERF | 4 | CI bundle-budget story (CI epic) | CI |
| R-014 | TECH | 4 | Accessibility story (Frontend epic) | E2E |
| R-010/R-012/R-013 | TECH/OPS | 2 | Document as known limitations (no dedicated story) | Monitor |

## Recommended BMAD → TEA Workflow Sequence

1. **TEA Test Design** (`TD`) → this handoff.
2. **BMAD Create Epics & Stories** (`CE`) → consumes this handoff; embeds quality gates + acceptance criteria.
3. **TEA ATDD** (`AT`) → red-phase acceptance tests for P0/P1 scenarios per story.
4. **BMAD Implementation** (`DS`) → test-first implementation.
5. **TEA Automate** (`TA`) → full suite.
6. **TEA Trace** (`TR`) → coverage completeness + gate.

## Phase Transition Quality Gates

| From Phase | To Phase | Gate Criteria |
|---|---|---|
| Test Design | Epic/Story Creation | Both P0 risks (R-001, R-009) have mitigation strategies; TC-1/2/3 seams identified |
| Epic/Story Creation | ATDD | Stories carry acceptance criteria from the P0/P1 scenarios above |
| ATDD | Implementation | Failing acceptance tests exist for all P0/P1 scenarios |
| Implementation | Test Automation | All acceptance tests pass |
| Test Automation | Release | Trace matrix shows risk-tiered coverage met for P0/P1; R-001 + R-009 verified |
