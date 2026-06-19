/*
 * Ratcheting bundle-size gate (Story 1.6, AC 9).
 *
 * After a production build, measures the gzipped size of the dist JS + CSS
 * assets and compares the total against a committed baseline. Fails the build
 * if the total grows beyond a small tolerance — a ratchet that catches size
 * growth vs. the last committed baseline, NOT an absolute ceiling yet. The
 * absolute ceiling freezes once Epic 1's UI is complete (epics Notes #14).
 *
 * Run after a build:  `npm run build --workspace apps/web`
 *                     `npm run size:check --workspace apps/web`
 * Update the baseline INTENTIONALLY (e.g. after a deliberate dependency add):
 *                     `npm run size:check --workspace apps/web -- --update`
 *
 * Standalone node gate, mirroring scripts/verify-token-lint.mjs — no size-limit
 * dependency, consistent with the repo's zero-extra-tooling lint scripts.
 */

import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST_DIR = new URL('../dist', import.meta.url).pathname
const BASELINE_FILE = new URL('../bundle-size-baseline.json', import.meta.url)
  .pathname
// Allow small, non-meaningful drift (hashing, minifier nondeterminism) before
// the gate trips; a real growth blows past this.
const TOLERANCE_BYTES = 512

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
  let total = 0
  for (const file of assets) {
    const gz = gzipSync(readFileSync(file)).length
    total += gz
    console.log(`  ${gz.toString().padStart(7)} B gz  ${file.slice(DIST_DIR.length + 1)}`)
  }
  return { total, count: assets.length }
}

const isUpdate = process.argv.includes('--update')
const { total, count } = measureGzipBytes()
console.log(`  ${'—'.repeat(7)}`)
console.log(`  ${total.toString().padStart(7)} B gz  total across ${count} asset(s)\n`)

if (isUpdate) {
  writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify({ totalGzipBytes: total }, null, 2)}\n`,
  )
  console.log(`Baseline updated → ${total} B gz (bundle-size-baseline.json).`)
  process.exit(0)
}

let baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
} catch {
  console.error(
    'No bundle-size-baseline.json. Create it with `npm run size:check --workspace apps/web -- --update`.',
  )
  process.exit(1)
}

const budget = baseline.totalGzipBytes + TOLERANCE_BYTES
if (total <= budget) {
  console.log(
    `Bundle-size gate: ${total} B gz ≤ ${baseline.totalGzipBytes} B baseline (+${TOLERANCE_BYTES} B tolerance). OK.`,
  )
  process.exit(0)
}

console.error(
  `Bundle-size gate: ${total} B gz EXCEEDS ${baseline.totalGzipBytes} B baseline (+${TOLERANCE_BYTES} B tolerance) by ${total - budget} B.\n` +
    'If this growth is intentional, rebaseline: `npm run size:check --workspace apps/web -- --update`.',
)
process.exit(1)
