/*
 * Contrast-regression gate (Story 1.6, AC 9).
 *
 * jsdom/axe cannot compute layout or color, so the axe gate disables its
 * color-contrast rule. This script is the complementary half: it reads the
 * committed token hex values straight from src/styles/tokens.css and computes
 * the WCAG 2.x contrast ratios for the documented foreground/background pairs,
 * failing the build if any pair drops below its target. A token edit that
 * quietly worsens contrast is caught here at CI time, from the source of truth.
 *
 * Run: `npm run contrast:check --workspace apps/web`. Exits non-zero on any
 * pair below target. Mirrors scripts/verify-token-lint.mjs (a standalone node
 * gate, zero extra tooling).
 *
 * Targets are RATCHETED to the WCAG levels the committed tokens actually achieve
 * (a regression floor), not the aspirational figures in the UX spec's Contrast
 * verification table. Two spec figures are NOT met by the committed tokens and
 * are in fact mutually exclusive (see Story 1.6 Dev Agent Record):
 *   - muted text on surface: spec "~7.1:1 (AAA)" vs committed 6.71:1 (AA-grade).
 *   - muted-vs-active distinction: spec "≥3:1" vs committed 2.48:1.
 * A single --color-on-surface-muted value cannot be both AAA-dark on the light
 * surface AND ≥3:1 distinct from the near-black on-surface text. Resolving that
 * is a color-system decision deferred to Story 1.7 (when the pending state, the
 * only consumer of the distinction, is built). This gate locks the current
 * achieved ratios so the tokens cannot silently regress in the meantime.
 */

import { readFileSync } from 'node:fs'

const TOKENS_FILE = new URL('../src/styles/tokens.css', import.meta.url).pathname

/** Parse `--name: #hex;` color custom properties from tokens.css. */
function readColorTokens(css) {
  const tokens = {}
  const re = /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g
  let match
  while ((match = re.exec(css)) !== null) {
    tokens[match[1]] = match[2]
  }
  return tokens
}

/** #rgb / #rrggbb → [r, g, b] in 0..255. */
function hexToRgb(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** WCAG relative luminance. */
function relativeLuminance([r, g, b]) {
  const channel = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two hex colors (1..21). */
function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexToRgb(hexA))
  const lumB = relativeLuminance(hexToRgb(hexB))
  const lighter = Math.max(lumA, lumB)
  const darker = Math.min(lumA, lumB)
  return (lighter + 0.05) / (darker + 0.05)
}

const tokens = readColorTokens(readFileSync(TOKENS_FILE, 'utf8'))

// foreground, background, ratcheted target ratio, why. Targets are the WCAG
// level the committed tokens actually achieve (regression floor) — see the
// header for the two spec figures that the tokens cannot meet.
const PAIRS = [
  {
    fg: '--color-on-surface',
    bg: '--color-surface',
    target: 7,
    label: 'primary text on surface (AAA, committed ~16.7:1)',
  },
  {
    // Spec aspires to AAA (~7.1:1); committed token is 6.71:1, i.e. AA-grade.
    // Floored at AA pending the Story 1.7 color decision.
    fg: '--color-on-surface-muted',
    bg: '--color-surface',
    target: 4.5,
    label: 'muted text on surface (AA floor; spec aspired AAA)',
  },
  {
    fg: '--color-on-surface-muted',
    bg: '--color-surface-muted',
    target: 4.5,
    label: 'muted text on muted surface (AA)',
  },
  {
    fg: '--color-accent',
    bg: '--color-surface',
    target: 4.5,
    label: 'accent/affordance on surface (AA)',
  },
  {
    fg: '--color-error',
    bg: '--color-surface',
    target: 4.5,
    label: 'error text on surface (AA)',
  },
  {
    // Pending-vs-settled distinction. Spec wants ≥3:1 but the committed muted
    // token only reaches 2.48:1, and ≥3:1 here is mutually exclusive with AAA
    // muted-on-surface (header). Floored at 2.4 to lock the current value and
    // catch regressions; the real ≥3:1 fix lands with the Story 1.7 pending UI.
    fg: '--color-on-surface-muted',
    bg: '--color-on-surface',
    target: 2.4,
    label: 'muted-vs-active distinction (ratcheted 2.4; spec target 3:1 — see 1.7)',
  },
]

let failures = 0
for (const { fg, bg, target, label } of PAIRS) {
  const fgHex = tokens[fg]
  const bgHex = tokens[bg]
  if (!fgHex || !bgHex) {
    failures++
    console.log(`  FAIL ✗ ${label} — missing token (${fg} or ${bg})`)
    continue
  }
  const ratio = contrastRatio(fgHex, bgHex)
  const rounded = ratio.toFixed(2)
  if (ratio >= target) {
    console.log(
      `  ok   ✓ ${label}  [${rounded}:1 ≥ ${target}:1]  ${fg} on ${bg}`,
    )
  } else {
    failures++
    console.log(
      `  FAIL ✗ ${label}  [${rounded}:1 < ${target}:1]  ${fg} on ${bg}`,
    )
  }
}

console.log(
  failures === 0
    ? `\nContrast gate: all ${PAIRS.length} token pairs meet target.`
    : `\nContrast gate: ${failures}/${PAIRS.length} token pairs BELOW target.`,
)
process.exit(failures === 0 ? 0 : 1)
