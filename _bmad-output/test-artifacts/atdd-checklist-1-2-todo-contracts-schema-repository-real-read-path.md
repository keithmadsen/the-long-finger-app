---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-06-17'
storyId: '1.2'
storyKey: '1-2-todo-contracts-schema-repository-real-read-path'
storyFile: '_bmad-output/implementation-artifacts/1-2-todo-contracts-schema-repository-real-read-path.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-1-2-todo-contracts-schema-repository-real-read-path.md'
generatedTestFiles:
  - 'apps/api/src/repositories/todo.repository.atdd.test.ts'
  - 'apps/api/test/integration/todos.atdd.test.ts'
  - 'apps/api/test/fixtures/todo.factory.ts'
inputDocuments:
  - '_bmad-output/implementation-artifacts/1-2-todo-contracts-schema-repository-real-read-path.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - 'apps/api/vitest.config.ts'
  - 'apps/api/test/integration/todos.routes.test.ts'
  - 'apps/api/test/integration/helpers/build-test-app.ts'
  - 'apps/api/src/repositories/todo.repository.test.ts'
  - '.agents/skills/bmad-testarch-atdd/resources/knowledge/test-levels-framework.md'
  - '.agents/skills/bmad-testarch-atdd/resources/knowledge/test-priorities-matrix.md'
  - '.agents/skills/bmad-testarch-atdd/resources/knowledge/data-factories.md'
  - '.agents/skills/bmad-testarch-atdd/resources/knowledge/test-quality.md'
  - '.agents/skills/bmad-testarch-atdd/resources/knowledge/test-healing-patterns.md'
  - '.agents/skills/bmad-testarch-atdd/resources/knowledge/api-testing-patterns.md'
  - '.agents/skills/bmad-testarch-atdd/resources/knowledge/contract-testing.md'
detectedStack: 'backend'
testFramework: 'vitest'
---

# ATDD Checklist — Story 1.2: Todo contracts, schema & repository (real read path)

## Step 1 — Preflight & Context

### Stack & framework
- **Repo:** fullstack TS monorepo (`apps/web` React/Vite + `apps/api` Fastify + `packages/contracts`).
- **Story 1.2 test surface: backend only.** All 11 ACs are contract/schema/repository/API + Swagger/error-handler. No browser UI in this story (the sole web touch is typing `App.tsx` state to `Todo[]`). → ATDD run classified **backend**.
- **Test framework:** Vitest with two projects — `unit` (`src/**/*.test.ts`) and `integration` (`test/integration/**/*.test.ts`), configured in Story 1.1. HTTP exercised via Fastify `app.inject()` (light-my-request); no Playwright/Cypress (deferred to Story 1.6).
- **Existing harness to reuse:** `apps/api/test/integration/helpers/build-test-app.ts` → `buildTestApp()` builds the real app against a real temp-file SQLite path, `app.ready()`, eagerly resolves `cradle.db`, returns `{ app, databasePath, cleanup }`.

### Prerequisites (hard requirements)
- ✅ Story approved with clear acceptance criteria — 11 ACs (`ready-for-dev`).
- ✅ Backend test framework configured — Vitest `unit` + `integration` projects + `buildTestApp` helper.
- ✅ Development environment available.

### Conventions in force
- **Test ID format:** `{EPIC}.{STORY}-{LEVEL}-{SEQ}` → `1.2-UNIT-00x`, `1.2-INT-00x`.
- **Level selection:** pure logic (mapper, ordering, idempotency, timestamps) → **unit** (co-located, repository against temp-file DB); endpoint/contract/serialization/error-envelope/OpenAPI/durability → **integration** (`app.inject` via `buildTestApp`).
- **Red-phase intent:** scaffolds assert the target behavior and are expected to FAIL against the current skeleton (id-only table, raw `SELECT *`, no swagger/error-handler) until Story 1.2 is implemented (green).
- **Quality DoD:** deterministic, isolated (own temp DB per app build), no shared mutable state, explicit cleanup, no real sleeps/timeouts.

### Notes / risks carried forward
- **better-sqlite3 is synchronous** — no test may assert *parallel* insert execution (epics Note 16).
- **Migration seam** — the durability test must reopen the *same* file; schema must not unconditionally drop (would fail AC 9).
- **Response serialization** — once `todoSchema` is the typed response, fields outside the schema are stripped; tests should assert exact camelCase shape.
- **Validation-400 branch** of the error-handler is dormant until Story 1.7 (no request body to validate in 1.2) — AC 11 verified via forced 500 / unknown-route 404 only.

## Step 2 — Generation Mode

- **Mode:** AI generation.
- **Reason:** Story 1.2 is a backend/API/contract story with clear acceptance criteria and an existing Vitest unit/integration harness. No browser recording is needed because UI workflows and Playwright are explicitly deferred.
- **Input basis:** story ACs, current Fastify/Vitest harness, repository and integration-test patterns from Story 1.1, and TEA API/backend testing guidance.

## Step 3 — Test Strategy

### Strategy summary

Story 1.2 should be covered by **unit tests for repository/schema behavior** and **integration tests for API boundary behavior**. No browser E2E tests are appropriate: the story contains no UI workflow beyond a compile-time web import of `Todo`.

### Acceptance criteria to red-phase scenarios

| ID | Priority | Level | Red-phase scenario | Primary ACs |
| --- | --- | --- | --- | --- |
| `1.2-UNIT-001` | P0 | Unit | Contract package exports `todoSchema`, `createTodoBody`, `patchTodoBody`, `errorEnvelope`, and derived types compile from API and web imports. | AC1 |
| `1.2-UNIT-002` | P0 | Unit | `applySchema` creates full `todos` table columns and preserves a full table on repeated startup. | AC2 |
| `1.2-UNIT-003` | P0 | Unit | `applySchema` drops only the obsolete id-only skeleton table and throws for unexpected partial schemas. | AC2, AC9 |
| `1.2-UNIT-004` | P0 | Unit | SQLite connection applies WAL, `synchronous=NORMAL`, `busy_timeout=5000`, and `foreign_keys=ON`. | AC2 |
| `1.2-UNIT-005` | P0 | Unit | Repository `listTodos()` returns canonical order: active first, then `updated_at DESC`. | AC3 |
| `1.2-UNIT-006` | P0 | Unit | Repository mapper returns exact camelCase `Todo` shape, converts `completed` 0/1 to boolean, and leaks no snake_case keys. | AC4 |
| `1.2-UNIT-007` | P0 | Unit | `insertTodo(input: CreateTodoBody)` stamps server timestamps, sets `completed=false`, and returns mapped `Todo`. | AC7 |
| `1.2-UNIT-008` | P0 | Unit | Duplicate `insertTodo` with same id is idempotent: row count unchanged and existing row returned. | AC8 |
| `1.2-INT-001` | P0 | Integration | `GET /todos` through Fastify returns bare canonical camelCase `Todo[]` with no success envelope. | AC5, AC10 |
| `1.2-INT-002` | P0 | Integration | App built with temp-file `databasePath` uses that real file and no fake repository/in-memory DB. | AC6 |
| `1.2-INT-003` | P0 | Integration | Durability: insert row, close app/DB handle, rebuild app on same file, `GET /todos` still returns row. | AC9 |
| `1.2-INT-004` | P1 | Integration | OpenAPI document exists and documents `GET /todos` 200 as `Todo[]` plus error response component. | AC10 |
| `1.2-INT-005` | P1 | Integration | Unknown route returns uniform 404 `errorEnvelope`; forced test route throws and returns uniform 500 `errorEnvelope`. | AC11 |

### Duplicate coverage guard

- Unit tests own schema migration, repository mapping, ordering, idempotency, and timestamp rules.
- Integration tests own Fastify registration, real awilix cradle wiring, response serialization, OpenAPI, error envelopes, and durability across closed handles.
- Do not test UI rendering or browser behavior here. The only web assertion is compile-time importability of `Todo`.

### Red-phase expectations

Against the current Story 1.1 skeleton, the generated tests should fail because:
- contracts only export a placeholder;
- schema is id-only and has no WAL/pragmas;
- repository returns raw `unknown[]` from `SELECT *` and lacks `insertTodo`;
- routes have no TypeBox response schema;
- swagger and error-handler plugins do not exist;
- durability with real rows is not implemented.

## Step 4 — Red-Phase Test Generation

### Generated files

- `apps/api/src/repositories/todo.repository.atdd.test.ts` — 8 skipped unit ATDD scaffolds.
- `apps/api/test/integration/todos.atdd.test.ts` — 5 skipped integration ATDD scaffolds.
- `apps/api/test/fixtures/todo.factory.ts` — deterministic todo fixture helpers used by ATDD tests.

### TDD red-phase validation

- **Total tests:** 13
- **API/backend tests:** 13
- **E2E tests:** 0, intentionally omitted because Story 1.2 has no browser user journey.
- **All generated scenarios use:** `test.skip(...)`
- **Placeholder assertions:** none found.
- **Expected state before implementation:** activated tests fail against the current skeleton.

### Acceptance criteria coverage

- **AC1:** contracts export TypeBox schemas and runtime symbols.
- **AC2:** full schema creation, obsolete skeleton migration, WAL/pragmas.
- **AC3:** canonical repository order.
- **AC4:** camelCase mapper and repository-only DB shape translation.
- **AC5:** `GET /todos` returns bare canonical `Todo[]`.
- **AC6:** injectable real temp-file DB path.
- **AC7:** server-owned timestamps.
- **AC8:** idempotent insert by id.
- **AC9:** durability across close/rebuild on same file.
- **AC10:** OpenAPI/TypeBox response schema.
- **AC11:** uniform non-2xx error envelope.

### Activation guidance

During Story 1.2 implementation, activate tests task-by-task by removing `test.skip` from the relevant scenario only:

1. Contract/schema work: activate `1.2-UNIT-001` through `1.2-UNIT-004`.
2. Repository work: activate `1.2-UNIT-005` through `1.2-UNIT-008`.
3. API boundary and durability work: activate `1.2-INT-001` through `1.2-INT-003`.
4. Swagger/error-handler work: activate `1.2-INT-004` and `1.2-INT-005`.

For each activated scenario: run the appropriate Vitest project, confirm it fails before the implementation change, implement the minimal green path, then keep it active once passing.

## Step 5 — Validation & Completion

### Validation checklist result

- **Prerequisites:** satisfied for this backend/API story: Story 1.2 is `ready-for-dev`, ACs are clear, Vitest unit/integration framework exists.
- **Generated files:** present and linked in story metadata.
- **Red-phase compliance:** all generated acceptance scaffolds use `test.skip(...)`; no active passing acceptance tests were emitted.
- **Placeholder assertions:** none found.
- **Story handoff:** Story 1.2 includes an `ATDD Artifacts` subsection under Dev Notes.
- **Browser sessions:** N/A; no browser recording was used.
- **Temp artifacts:** worker JSON and summary were written under `/tmp`; durable handoff artifacts are stored in `_bmad-output/test-artifacts/` and repo test paths.

### Verification commands

- `npm run typecheck` — passed.
- `npm run test:unit` — passed; Vitest reported 1 existing unit test passed and 8 ATDD unit scaffolds skipped.
- `npm run test:integration` — passed; Vitest reported 3 existing integration tests passed and 5 ATDD integration scaffolds skipped.

### Completion summary

- **Story ID:** `1.2`
- **Story key:** `1-2-todo-contracts-schema-repository-real-read-path`
- **Primary test level:** API/backend unit + integration.
- **Generated red-phase tests:** 13 skipped scenarios.
- **Generated fixture helpers:** 1 file.
- **E2E/browser tests:** 0, intentionally not applicable for this story.
- **Next workflow:** `bmad-dev-story` for Story 1.2. During implementation, activate skipped tests task-by-task and follow red-green-refactor.
