/*
 * k6 latency gate for the POST /todos path (Story 3.4, AC 3/4 — promotes the
 * Epic 1 integration-level percentile check to a formal sign-off).
 *
 * Lives OUTSIDE e2e/tests/ so Playwright's testDir never picks it up.
 *
 * Reproducible load profile (AC 3 — the numbers are falsifiable because every
 * variable is pinned):
 *   • Arrival rate: 20 creates/s for 30 s (600 measured POSTs), 10
 *     preallocated VUs. Arrival-rate (not constant-vus) so throughput — and
 *     the dataset growth — is bounded and identical run-to-run.
 *   • Dataset: setup() seeds 100 todos first, so measured POSTs run against
 *     the documented ~100-row list (ending near ~700 rows).
 *   • Warm vs cold: the target must be a FRESHLY STARTED container with a
 *     fresh volume (cold process, empty DB); the 100 seed requests then warm
 *     it (JIT, prepared statements, page cache) so the measured window is
 *     warm-state — cold-start latency is excluded by construction.
 *   • Thresholds are scoped to the measured POSTs via the `type:create` tag;
 *     seed traffic is tagged `type:seed` and never gates.
 *
 * Two tracks, one script (thresholds override via env):
 *   Formal sign-off (strict, local Docker container — docs/k6-latency-signoff.md):
 *     k6 run e2e/load/post-todos-signoff.js -e BASE_URL=http://localhost:3001
 *   CI smoke (loosened ~5×: shared-runner latency is noisy; this is a
 *   regression tripwire, not the sign-off):
 *     k6 run e2e/load/post-todos-signoff.js -e P50_MS=500 -e P95_MS=2000
 *
 * A threshold breach makes k6 exit with code 99, failing the CI step with no
 * extra wiring.
 */

import http from 'k6/http'
import { check } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001'
const P50_MS = __ENV.P50_MS || '100'
const P95_MS = __ENV.P95_MS || '800'

export const options = {
  scenarios: {
    create_todos: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      maxVUs: 20,
    },
  },
  thresholds: {
    // NFR-1 (prd.md §7): p50 ≤ 100 ms / p95 ≤ 800 ms on the POST path.
    'http_req_duration{type:create}': [`p(50)<${P50_MS}`, `p(95)<${P95_MS}`],
    // A constant-arrival-rate executor can otherwise stay green after maxVUs
    // saturation silently drops part of the promised 600-request profile.
    dropped_iterations: ['count==0'],
    // Every measured create must actually succeed — latency percentiles over
    // failed requests would be meaningless.
    checks: ['rate==1'],
  },
}

// The POST body id must be a UUIDv7 (contract pattern rejects anything else
// with a 400). k6 bundles no v7 generator, so build one: 48-bit unix-ms
// timestamp, version nibble 7, variant 8/9/a/b, random tail. Math.random is
// fine here — this is load-test uniqueness, not cryptography.
function uuidv7() {
  const ts = Date.now().toString(16).padStart(12, '0')
  const hex = (n) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const variant = '89ab'[Math.floor(Math.random() * 4)]
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${hex(3)}-${variant}${hex(3)}-${hex(12)}`
}

const HEADERS = { 'Content-Type': 'application/json' }

function createTodo(description, type) {
  return http.post(
    `${BASE_URL}/todos`,
    JSON.stringify({ id: uuidv7(), description }),
    { headers: HEADERS, tags: { type } },
  )
}

export function setup() {
  // Health first: fail fast (and loudly) if the container isn't up.
  const health = http.get(`${BASE_URL}/health`, { tags: { type: 'seed' } })
  if (health.status !== 200) {
    throw new Error(`GET /health returned ${health.status} — is the container running at ${BASE_URL}?`)
  }
  // Seed the documented ~100-row dataset; doubles as process warm-up.
  for (let i = 0; i < 100; i++) {
    const res = createTodo(`k6 seed row ${i + 1} of 100`, 'seed')
    if (res.status !== 201) {
      throw new Error(`Seeding failed at row ${i + 1}: POST /todos → ${res.status}`)
    }
  }
}

export default function () {
  const res = createTodo(`k6 measured create ${uuidv7()}`, 'create')
  check(res, { 'create returned 201': (r) => r.status === 201 })
}
