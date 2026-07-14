# Test Coverage Report

Recorded: 2026-07-14 · Node 24 · Vitest v8 coverage provider

Brief target (`docs/instructions.md`, Success Criteria): **minimum 70% meaningful coverage**.

## Overall numbers

Whole-`src` measurement, via a CLI include override of the delete-path-scoped config (no config
changes; the API run executes both Vitest projects — unit and integration — 60 tests total):

| Suite | Command | Stmts | Branch | Funcs | Lines |
| --- | --- | --- | --- | --- | --- |
| Web (component + hooks, 246 tests) | `npx vitest run --coverage --coverage.include='src/**' --root apps/web` | 95.02% | 90.29% | 96.93% | 96.14% |
| API (unit + integration, 60 tests) | `npx vitest run --coverage --coverage.include='src/**' --root apps/api` | 78.72% | 72.3% | 85.29% | 79.41% |

Verdict vs the 70% target: met for both suites — web clears 70% comfortably on every metric, and
the API clears it on every metric too, though with less headroom (72.3% branches, 79.41% lines).

Note: the API command exits non-zero because the config's delete-path thresholds (80.01%) apply
globally once the include is widened — the coverage report above is still complete and correct;
only the threshold check trips. The whole-src numbers are a snapshot, not a gate.

## Enforced thresholds (CI, story 3.4)

Coverage *gates* are deliberately scoped to the highest-risk path (delete) rather than
a blanket repo-wide floor: >90% on `useArmedDelete`/`useDeleteTodo` (web) and >80% on
the todos route/repository (API). This report records the overall picture; the gates
prevent regression where it matters most.

Important scoping note: the npm scripts (`npm run test:coverage --workspace apps/web`,
`npm run test:integration:coverage --workspace apps/api`) don't just *gate* on the delete path —
their `coverage.include` (in `apps/web/vite.config.ts` / `apps/api/vitest.config.ts`) restricts
*measurement* to those same files, so their "All files" rows are delete-path-only numbers, not
whole-codebase figures. For the record, those scoped runs report:

| Scoped gate run | Stmts | Branch | Funcs | Lines | Gate |
| --- | --- | --- | --- | --- | --- |
| Web (`useArmedDelete`, `useDeleteTodo`) | 97.59% | 92.3% | 100% | 100% | >90% — passing |
| API (`todos.route`, `todo.repository`, integration only) | 100% | 87.5% | 100% | 100% | >80% — passing |

## Gap analysis

Files below 70% line coverage in the whole-`src` runs (from the per-file tables), one bullet each:

- `apps/web/src/main.tsx` — 0% lines. React bootstrap entrypoint (creates the root, renders
  `<App/>`); acceptable — it has no logic to unit-test and is exercised on every page load by the
  Playwright E2E suite.
- `apps/web/src/components/AppErrorBoundary.tsx` — 0% lines. The top-level error boundary's
  render-crash fallback path is never triggered in component tests. A test that would close it:
  render `AppErrorBoundary` around a child that throws during render and assert the fallback UI
  appears.
- `apps/web/src/lib/queryClient.ts` — 0% lines. Production TanStack QueryClient configuration;
  component tests deliberately substitute the retry-free test client in `src/test/queryClient.tsx`,
  so this module only runs in the real app (covered by E2E). A small unit test asserting the
  configured retry/backoff options would close it if instrumented coverage is wanted.
- `apps/api/src/index.ts` — 0% lines. The listen-only entrypoint; by design (see CLAUDE.md) all
  wiring lives in `buildServer` (`src/server.ts`, 100% lines) so integration tests reuse the
  builder, while `index.ts` is exercised by the E2E harness/Docker image boot instead. Acceptable.

Everything else in both trees is at or above 83.33% lines (the lowest non-entrypoint files:
`apps/web/src/api/validateContract.ts` 83.33%, `apps/api/src/plugins/error-handler.ts` 85.71%).
On the API side, `index.ts` alone accounts for 25 of the 28 uncovered lines (the other 3 are the
error-handler's 5xx fallback path) — excluding the entrypoint, the API's tested surface sits at
~97% lines. The web aggregate is similarly dominated by its three 0% files above.

Not counted here: 13 Playwright E2E tests (`e2e/tests/`) and the API unit suite
(`npm run test:unit`) exercise further paths without instrumented coverage.
