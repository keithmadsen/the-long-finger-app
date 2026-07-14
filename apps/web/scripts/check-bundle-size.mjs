/*
 * Absolute-ceiling bundle-size gate (Story 3.4, AC 5 — converted from the
 * Story 1.6 ratchet per epics Notes #14 / epic-2 retro item 7: the ratchet
 * "is doing paperwork, not gate-keeping").
 *
 * After a production build, measures the gzipped size of the dist JS + CSS
 * assets and fails the build only if the total exceeds the committed ceiling
 * in bundle-size-baseline.json. The ceiling is the merge-blocking proxy for
 * the NFR-2 TTI budget (Lighthouse dropped TTI in v10; live timing on shared
 * runners is flaky — see docs/k6-latency-signoff.md for the recorded slow-3G
 * measurement and the budget discrepancy it documents).
 *
 * There is deliberately NO --update flag: an auto-rebaseline path is what made
 * the ratchet paperwork. Raising the ceiling is a hand edit to
 * bundle-size-baseline.json that must carry its rationale in the PR.
 *
 * Run after a build:  `npm run build --workspace apps/web`
 *                     `npm run size:check --workspace apps/web`
 *
 * Standalone node gate, mirroring scripts/verify-token-lint.mjs — no size-limit
 * dependency, consistent with the repo's zero-extra-tooling lint scripts.
 */

import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST_DIR = new URL('../dist', import.meta.url).pathname
const CEILING_FILE = new URL('../bundle-size-baseline.json', import.meta.url)
  .pathname

/** Recursively collect .js/.css asset paths under dist. */
function collectAssets(dir) {
  const assets = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      assets.push(...collectAssets(full))
    } else if (entry.endsWith('.js') || entry.endsWith('.css')) {
      assets.push(full)
    }
  }
  return assets
}

function measureGzipBytes() {
  let dist
  try {
    dist = statSync(DIST_DIR)
  } catch {
    dist = null
  }
  if (!dist || !dist.isDirectory()) {
    console.error(
      `No dist/ directory at ${DIST_DIR}. Run \`npm run build --workspace apps/web\` first.`,
    )
    process.exit(1)
  }

  const assets = collectAssets(DIST_DIR).sort()
  if (assets.length === 0) {
    console.error(
      `No JavaScript or CSS assets found under ${DIST_DIR}; refusing to pass an empty or misconfigured build.`,
    )
    process.exit(1)
  }
  let total = 0
  for (const file of assets) {
    const gz = gzipSync(readFileSync(file)).length
    total += gz
    console.log(`  ${gz.toString().padStart(7)} B gz  ${file.slice(DIST_DIR.length + 1)}`)
  }
  return { total, count: assets.length }
}

const { total, count } = measureGzipBytes()
console.log(`  ${'—'.repeat(7)}`)
console.log(`  ${total.toString().padStart(7)} B gz  total across ${count} asset(s)\n`)

let ceiling
try {
  const parsed = JSON.parse(readFileSync(CEILING_FILE, 'utf8'))
  ceiling = parsed.ceilingGzipBytes
} catch {
  ceiling = undefined
}
if (typeof ceiling !== 'number' || !Number.isFinite(ceiling)) {
  console.error(
    'No valid `ceilingGzipBytes` in bundle-size-baseline.json — the absolute ceiling must be a committed number (see the file for its rationale).',
  )
  process.exit(1)
}

if (total <= ceiling) {
  console.log(
    `Bundle-size gate: ${total} B gz ≤ ${ceiling} B gz absolute ceiling (${ceiling - total} B headroom). OK.`,
  )
  process.exit(0)
}

console.error(
  `Bundle-size gate: ${total} B gz EXCEEDS the ${ceiling} B gz absolute ceiling by ${total - ceiling} B.\n` +
    'Shrink the bundle, or raise `ceilingGzipBytes` in bundle-size-baseline.json ' +
    'as a deliberate, justified change in the PR (there is no --update shortcut by design).',
)
process.exit(1)
