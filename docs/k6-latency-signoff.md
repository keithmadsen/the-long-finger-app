# Latency & TTI Sign-off (Story 3.4, ACs 3–5)

Two recorded measurements against the **production Docker container** (the
same image `docker build` produces from the repo-root Dockerfile): the formal
k6 POST-latency sign-off (NFR-1) and the slow-3G TTI evidence run (NFR-2).
Patterned on `docs/screen-reader-smoke-test.md`: environment captured per run,
results recorded honestly against the product-approved budgets.

## 1. k6 POST /todos latency — formal sign-off (ACs 3–4)

**Verdict: PASS.** p50 = **3.69 ms** (budget ≤ 100 ms), p95 = **5.01 ms**
(budget ≤ 800 ms), 601/601 measured creates returned 201, 0 failed requests,
and 0 scheduled iterations were dropped.

### Reproducible profile (AC 3)

Committed script: `e2e/load/post-todos-signoff.js`. Every variable is pinned so
the numbers are falsifiable:

| Variable | Value |
|---|---|
| Executor | `constant-arrival-rate`, 20 creates/s × 30 s (600 measured POSTs), 10 preallocated VUs (max 20) |
| Dataset | `setup()` seeds 100 todos before measurement; run ends near ~700 rows |
| Warm vs cold | Target is a freshly started container on a fresh volume (cold process, empty DB); the 100 seed requests warm it, so the measured window is **warm-state** — cold-start latency is excluded by construction |
| Threshold scope | `http_req_duration{type:create}` — seed traffic is tagged `type:seed` and never gates |
| Thresholds (formal) | `p(50)<100`, `p(95)<800`, `checks rate==1` (every create must 201), `dropped_iterations count==0` (the full profile must execute) |

### Environment (run of record)

| Field | Value |
|---|---|
| Date | 2026-07-14 |
| Machine | Apple M4 Pro, 24 GB RAM, macOS (Darwin 25.2.0) |
| Docker | Docker Desktop, engine 29.6.1 (linux/arm64 VM) |
| Image | `tlf-app-review-34` built from reviewed candidate `38344d1` plus applied review patches (image `sha256:371f7c9eac34…`) |
| Container | `docker run -d --name tlf-review-34 -p 3003:8080 tlf-app-review-34`, fresh anonymous volume |
| k6 | v2.1.0 (grafana/k6 image, linux/arm64), reaching the app via `host.docker.internal` |
| Command | `docker run --rm -i -e BASE_URL=http://host.docker.internal:3003 -v <worktree>/e2e/load:/scripts:ro grafana/k6 run /scripts/post-todos-signoff.js` |

### Results (run of record)

```
http_req_duration{type:create}: avg=3.66ms med=3.69ms p(90)=4.56ms p(95)=5.01ms max=18.95ms
checks_succeeded: 100% (601/601 creates → 201)
http_req_failed: 0% (0/702)
dropped_iterations: 0
```

Headroom is ~27× on p50 and ~159× on p95 — the synchronous better-sqlite3
write path is nowhere near these budgets at to-do-app scale.

### CI smoke track (loosened thresholds — AC 4/6)

The `k6-smoke` job in `.github/workflows/ci.yml` runs the same script against
the container built in that job with `P50_MS=500 / P95_MS=2000` (~5× the formal
numbers). **Rationale:** shared-runner latency is noisy enough that the strict
numbers would flake; given the ~3 ms measured reality, a run that breaches even
the loosened numbers is an order-of-magnitude regression worth blocking. A
threshold breach exits k6 with code 99, which fails the step and blocks the
merge. This job is also the first CI exercise of the Dockerfile itself.

## 2. TTI on slow-3G — evidence run (AC 5)

**Verdict: PASS.** Median time-to-usable-list **7,839 ms** against the
product-approved **≤10 s** slow-3G budget (Keith, 2026-07-14; recorded in the
UX Performance Contracts and Story 3.4 AC 5). Three runs: 7,839 / 7,858 /
7,832 ms (FCP ~7.2 s).

### Method

Committed script: `e2e/load/measure-tti.mjs`. Playwright Chromium with CDP
`Network.emulateNetworkConditions` at the DevTools Slow-3G preset (400 ms
latency, 50 KB/s down/up), against the production container with an empty DB.
"Usable list" = capture input visible **and** the list surface rendered.
This is recorded **evidence, not a per-PR gate** (Lighthouse removed TTI as a
metric in v10; live timing on shared runners is flaky).

### Baseline analysis and remaining optimization

1. **The container serves assets uncompressed.** `content-encoding` is absent;
   the JS bundle is 301,119 B on the wire (not the 92,498 B gzip figure the
   bundle gate tracks). At 50 KB/s that is ~6.0 s of transfer before parsing.
   `@fastify/static` is not configured for compression and no precompressed
   assets are shipped.
2. Even **with** gzip enabled, 92.5 KB at 50 KB/s ≈ 1.85 s + ≥0.4 s RTT. This
   explains why the original ≤1 s aspiration was unreachable and why Keith
   approved the measured, falsifiable ≤10 s budget during code review.

### Decision record

Keith approved **≤10 s time-to-usable-list on the documented slow-3G profile**
on 2026-07-14. The measured 7,839 ms run therefore passes. The merge-blocking
proxy remains the 95,000 B gzip ceiling; live throttled timing stays recorded
release evidence because shared-runner timing would be flaky.

Optional follow-up work (likely Story 3.5 or later):

- **Enable response compression in the container** (`@fastify/compress` or
  precompressed `.gz`/`.br` assets with `@fastify/static`'s `preCompressed`) —
  cheapest single win: ~6.0 s → ~1.9 s transfer.
- **Bundle-diet work** (React → preact/htm, code-splitting) — out of scope for
  this story and probably disproportionate for a to-do app.

Conformance position: NFR-1 latency and NFR-2 time-to-usable are both signed
off; the size ceiling prevents silent payload regression between evidence runs.
