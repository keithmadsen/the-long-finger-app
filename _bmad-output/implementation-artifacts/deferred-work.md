## Deferred from: code review of 1-6-list-view-see-your-tasks (2026-06-20)

- Contrast gate enforces weaker targets than the story requires: deferred to Story 1.7 color-system correction.

## Deferred from: Epic 2 retrospective (2026-07-01)

- **Committed Playwright e2e harness** (config + `@p0` delete arm→confirm→revert + 5 s auto-revert + concurrent arm/submit spec + single CI `e2e` job): Epic 1 action item 6 was NOT delivered — Playwright was used only as a one-time investigation aid in 2.3 AC 7. Owned by Story 3.4; **prerequisite for Story 3.3** (browser forced-colors/reduced-motion gates). Stand up via `bmad-testarch-framework` early in Epic 3.
- **`@p0/@p1` priority tagging + coverage thresholds** (Epic 1 action item 7, optional): fold into the harness/CI work in Story 3.4.
- **LiveRegion identical-consecutive-message re-announce fix** (nonce / clear-then-set on the shared primitive): Story 3.2 (consolidated SR contract).
- **Nested-`<label>` invalid-HTML DOM decision** (Epic 1 action item 4, still unresolved — implicitly carried 1.6→2.3): fix the label-in-label OR formally record the re-accept with rationale, in Story 3.1 (roving tabindex already touches row-anchor DOM). Do not carry implicitly a third epic.
- **Bundle-size ratchet → absolute NFR budget check**: convert the per-story ratchet (always trips → rebaseline) to a fail-only-if-over-budget gate when Story 3.4 reworks CI gates.
