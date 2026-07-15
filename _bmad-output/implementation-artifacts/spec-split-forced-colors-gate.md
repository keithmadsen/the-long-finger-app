---
title: 'Split the forced-colors mega-test and trim the reduced-motion probe'
type: 'refactor'
created: '2026-07-15'
status: 'done'
route: 'one-shot'
---

# Split the forced-colors mega-test and trim the reduced-motion probe

## Intent

**Problem:** Test-review follow-up 4: the 120-line forced-colors test bundled three concerns (focus-ring survival, completion cues, armed-delete label flip), so a failure in the first masked the other two, and `borderMetrics` was inlined twice; the reduced-motion test also spent 900 ms of wall clock on a persistence probe whose extra 550 ms bought no assertion power.

**Approach:** Split the mega-test into three independent tests in the same describe, each seeding its own stamp-scoped rows; hoist `borderMetrics`, `outlineMetrics`, and a `checkboxIndicator` locator to module scope; trim the probe to the suite's established 350 ms window-crossing convention with an honest comment (revert-not-near-zero; the exact 5 s race stays unit-tested against the injectable clock).

## Suggested Review Order

**The split (one concern per test)**

- Focus-ring test: seeds one row, keeps keyboard-driven :focus-visible assertions.
  [`a11y-modes.spec.ts:56`](../../e2e/tests/ui/a11y-modes.spec.ts#L56)

- Completion-cues test: the only one needing a completed row (PATCH seed).
  [`a11y-modes.spec.ts:93`](../../e2e/tests/ui/a11y-modes.spec.ts#L93)

- Armed-delete test: label flip + aria-pressed + boundary, nothing else.
  [`a11y-modes.spec.ts:144`](../../e2e/tests/ui/a11y-modes.spec.ts#L144)

**Hoisted helpers**

- `borderMetrics` at module scope; comment states the evaluate-serialization constraint.
  [`a11y-modes.spec.ts:38`](../../e2e/tests/ui/a11y-modes.spec.ts#L38)

- `checkboxIndicator` locator replaces `nextElementSibling` hops; selects on `aria-hidden`.
  [`a11y-modes.spec.ts:31`](../../e2e/tests/ui/a11y-modes.spec.ts#L31)

- `outlineMetrics` dedupes the two focus-ring evaluates (review patch).
  [`a11y-modes.spec.ts:50`](../../e2e/tests/ui/a11y-modes.spec.ts#L50)

**The probe trim**

- 900 ms → 350 ms; comment rewritten to the honest weaker claim (review patch).
  [`a11y-modes.spec.ts:240`](../../e2e/tests/ui/a11y-modes.spec.ts#L240)
