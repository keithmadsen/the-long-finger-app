# WCAG 2.2 AA Conformance Matrix (traceability, Story 3.4)

**Target: WCAG 2.2 Level AA** (ux-design-specification.md § WCAG Conformance
Statement), with AAA where the design naturally achieves it.

This matrix maps each enumerated success criterion to the **actual gating
mechanism** — the exact gate, script, or test that fails a PR (or blocks a
release) when the criterion regresses. It exists so the claim "AA" is never
made on a subset: rows are verified against the real merged tests, and any
criterion without a genuine covering mechanism is either covered or explicitly
flagged — never left vague.

> **The axe subset alone does NOT constitute "AA enforced".** axe-core
> automates only a fraction of WCAG (roughly the machine-checkable rules).
> Conformance here rests on all three legs together: automated axe scans,
> Playwright-scripted behavioural gates, and the gating manual screen-reader
> smoke test. CI reports the first two; the third is a release gate.

## Gate legend

| Status | Meaning |
|---|---|
| **CI-enforced** | Merge-blocking in `.github/workflows/ci.yml` (`verify` or `e2e` job, Story 3.4). |
| **Manual release gate** | Scripted manual run per `docs/screen-reader-smoke-test.md`; a release candidate does not ship without a recorded passing run (Story 3.2 AC 4). NVDA + VoiceOver first recorded runs land with the release candidate (Story 3.5 timeframe). |

## The matrix

| SC | Name | Gating mechanism (exact gate → test) | Status |
|---|---|---|---|
| 1.4.3 | Contrast (Minimum) | Token-math gate `apps/web/scripts/check-contrast.mjs` (`contrast:check`, 8 pairs — a superset of the UX Color System table's 6 documented pairs, verified 2026-07-14) **+** real-browser axe `color-contrast` in `e2e/tests/ui/axe-gate.spec.ts` (all 6 scans; the only gate where that rule truly runs — the jsdom gate `App.axe.test.tsx` keeps it disabled since jsdom computes no layout/color) | CI-enforced |
| 1.4.4 | Resize Text | `e2e/tests/ui/a11y-modes.spec.ts` → "@p1 200% zoom (1280×800 ≡ 640×400 viewport): no horizontal scroll, everything operable" (viewport-halving equivalence — Playwright has no real zoom API) | CI-enforced |
| 1.4.10 | Reflow | `a11y-modes.spec.ts` → "@p1 mobile floor 320×568: no horizontal scroll, 16px padding, ≥48px touch targets" **+** "@p1 reflow lock: toggle and arm-delete change zero geometry" **+** the 200%-zoom test above | CI-enforced |
| 1.4.11 | Non-text Contrast | `check-contrast.mjs` pair "focus ring on surface (non-text ≥3:1)" — **added by Story 3.4**: `--color-focus` is declared separately from `--color-accent` precisely so it can diverge, so it is gated in its own right. Supported by `a11y-modes.spec.ts` → forced-colors test (ring/borders survive) and prefers-contrast test. **Honesty note:** the epic bucketed 1.4.11 under "axe-core/automated", but axe-core OSS ships no automated 1.4.11 rule — the token-math pair is the real lock. Checkbox borders (`--color-border`, ~1.2:1) are not the sole identifier of the control (visible row label, ✓ glyph, strikethrough, whole-row target), so they are not a 1.4.11 failure vector. | CI-enforced |
| 1.4.12 | Text Spacing | `a11y-modes.spec.ts` → "@p1 WCAG text-spacing overrides: no horizontal scroll, no clipped controls, everything operable" — **added by Story 3.4** (this SC had no covering test when the matrix was drawn up; the UX mechanism "no fixed line-height/letter-spacing in component CSS" was a claim without an executable lock). Injects the 1.4.12 override metrics verbatim and asserts no content/functionality loss. | CI-enforced |
| 2.1.1 | Keyboard | Manual smoke `docs/screen-reader-smoke-test.md` (gating). Scripted partial: `e2e/tests/ui/keyboard-navigation.spec.ts` → "@p1 keyboard-only: roving anchors, arrows, toggle, escape, delete with focus-follow" covers reachability/operability of capture, toggle, and delete keyboard-only. | Manual release gate (scripted partial CI-enforced) |
| 2.1.2 | No Keyboard Trap | Manual smoke (gating). Scripted partial: the keyboard-navigation test exercises Escape-to-input and Tab progression through every stop without trapping. | Manual release gate (scripted partial CI-enforced) |
| 2.4.3 | Focus Order | Manual smoke (gating). Scripted partial: the keyboard-navigation test asserts the order input → roving row anchor → row delete, and focus-follow after delete (never stranded on `<body>`). | Manual release gate (scripted partial CI-enforced) |
| 2.4.7 | Focus Visible | `a11y-modes.spec.ts` → forced-colors test (":focus-visible outline survives" on row anchor + input) **+** `keyboard-navigation.spec.ts` focus assertions **+** the stylelint gate (`npm run lint:css`) which rejects bare `:focus`/unpaired `outline: none` (focus-ring pairing rule) | CI-enforced |
| 2.5.5 | Target Size (AAA) | `a11y-modes.spec.ts` → mobile-floor test asserts row anchor, capture input, and delete affordance ≥48px | CI-enforced |
| 2.5.8 | Target Size (Minimum) | Same test — 48px ≥ the 24px AA minimum (satisfied via the AAA target) | CI-enforced |
| 3.3.1 | Error Identification | Manual smoke (gating — audible leg). Scripted partial: `axe-gate.spec.ts` failed-load/failed-create scans + `screen-reader-contract.spec.ts` region mechanics; the visible failed-create surface (left-border + Retry/Dismiss) is exercised in `App.axe.test.tsx` and the axe e2e failed-create state. | Manual release gate (scripted partial CI-enforced) |
| 3.3.4 | Error Prevention | Manual smoke (gating). Scripted partial: `e2e/tests/ui/delete-path.spec.ts` (@p0, Story 3.4) → arm→confirm two-step, tap-away/arm-another-row reverts, and the real-timer 5 s auto-revert with no DELETE fired. | Manual release gate (scripted partial CI-enforced) |
| 4.1.2 | Name, Role, Value | axe rule set (button-name, label, aria-valid-attr*, aria-allowed-attr…) in **both** axe gates: jsdom `App.axe.test.tsx` (6 states, `verify` job) + real-browser `axe-gate.spec.ts` (6 states, `e2e` job). Enriched delete names and `aria-pressed` asserted in `screen-reader-contract.spec.ts` / `keyboard-navigation.spec.ts` via role+name selectors. | CI-enforced |
| 4.1.3 | Status Messages | `screen-reader-contract.spec.ts` → "@p1 single polite region carries create/toggle/delete announcements; aria-busy spans pending; identical deletes re-announce" (region mechanics at browser level). **Honesty note:** the epic bucketed 4.1.3 under "axe-core/automated", but axe validates only ARIA attribute validity here — the behavioural contract (single polite region, announce-on-confirm) is the Playwright spec, and actual utterances are only verifiable on real AT (manual smoke). | CI-enforced (utterances: manual release gate) |

## How CI composes the gates (AC 6)

Both jobs in `.github/workflows/ci.yml` are merge-blocking:

- **`verify`**: typecheck → CSS token lint + selftest → web Vitest (incl. jsdom
  axe, 6 states) → `contrast:check` (8 token pairs) → web build → bundle-size
  ceiling → API unit → API integration.
- **`e2e`**: the **full unfiltered** Playwright suite (api + chromium) — a
  `@p0`-filtered run would silently drop the `@p1` WCAG gates out of the
  merge-blocking path, so the job deliberately runs `npm run test:e2e` with no
  grep.

## Recorded decision: no whole-suite emulation projects (Keith, 2026-07-14)

The option of dedicated Playwright **projects** that re-run the entire UI suite
under forced-colors / reduced-motion / zoomed emulation was **declined**.
Story 3.3's merged gates are per-test `page.emulateMedia()` /
`setViewportSize()` calls inside the chromium project, and each emulated mode's
acceptance criteria are asserted directly in those tests; re-running the whole
suite under emulation would multiply chromium CI time with **no new assertion
coverage**. This closes the extension-point question 3.3 left behind (the
config stub was deleted with the 3.3 merge).

## Maintenance

- Adding a token pair to the Color System table? Mirror it in
  `check-contrast.mjs` — AC 1 requires the gate to compute **every documented
  pair** from the source of truth (`tokens.css`).
- Adding an interactive element or app state? Extend both axe gates (jsdom +
  `axe-gate.spec.ts`) and re-verify the scripted rows above still cite a real,
  existing test name.
- The five manual rows stay honest: they flip to "recorded" only when
  `docs/screen-reader-smoke-test.md` carries a passing run for the release
  candidate (both legs).
