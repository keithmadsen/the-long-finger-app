# Latency & TTI Sign-off (Story 3.4, ACs 3–5)

Two recorded measurements against the **production Docker container** (the
same image `docker build` produces from the repo-root Dockerfile): the formal
k6 POST-latency sign-off (NFR-1) and the slow-3G TTI evidence run (NFR-2).
Patterned on `docs/screen-reader-smoke-test.md`: environment captured per run,
results recorded honestly — including the budget this app currently does not
meet.

## 1. k6 POST /todos latency — formal sign-off (ACs 3–4)

**Verdict: PASS.** p50 = **2.85 ms** (budget ≤ 100 ms), p95 = **6.34 ms**
(budget ≤ 800 ms), 601/601 measured creates returned 201, 0 failed requests.

### Reproducible profile (AC 3)

Committed script: `e2e/load/post-todos-signoff.js`. Every variable is pinned so
the numbers are falsifiable:

| Variable | Value |
|---|---|
| Executor | `constant-arrival-rate`, 20 creates/s × 30 s (600 measured POSTs), 10 preallocated VUs (max 20) |
| Dataset | `setup()` seeds 100 todos before measurement; run ends near ~700 rows |
| Warm vs cold | Target is a freshly started container on a fresh volume (cold process, empty DB); the 100 seed requests warm it, so the measured window is **warm-state** — cold-start latency is excluded by construction |
| Threshold scope | `http_req_duration{type:create}` — seed traffic is tagged `type:seed` and never gates |
| Thresholds (formal) | `p(50)<100`, `p(95)<800`, `checks rate==1` (every create must 201) |

### Environment (run of record)

| Field | Value |
|---|---|
| Date | 2026-07-14 |
| Machine | Apple M4 Pro, 24 GB RAM, macOS (Darwin 25.2.0) |
| Docker | Docker Desktop, engine 29.6.1 (linux/arm64 VM) |
| Image | `tlf-app` built from commit `8e6f0d3` (image `sha256:67acf09d8794…`) |
| Container | `docker run -d -p 3001:8080 tlf-app`, fresh anonymous volume |
| k6 | v2.1.0 (grafana/k6 image, linux/arm64), reaching the app via `host.docker.internal` |
| Command | `docker run --rm -i -e BASE_URL=http://host.docker.internal:3001 grafana/k6 run - < e2e/load/post-todos-signoff.js` |

### Results (run of record)

```
http_req_duration{type:create}: avg=3.28ms med=2.85ms p(90)=5.09ms p(95)=6.34ms max=27.1ms
checks_succeeded: 100% (601/601 creates → 201)
http_req_failed: 0% (0/702)
```

Headroom is ~35× on p50 and ~125× on p95 — the synchronous better-sqlite3
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

**Verdict: BUDGET NOT MET — surfaced, not hidden.** Median time-to-usable-list
**7,839 ms** against the "TTI ≤ 1 s on slow-3G" budget (ux-design-specification
§ Performance Contracts). Three runs: 7,839 / 7,858 / 7,832 ms (FCP ~7.2 s).

### Method

Committed script: `e2e/load/measure-tti.mjs`. Playwright Chromium with CDP
`Network.emulateNetworkConditions` at the DevTools Slow-3G preset (400 ms
latency, 50 KB/s down/up), against the production container with an empty DB.
"Usable list" = capture input visible **and** the list surface rendered.
This is recorded **evidence, not a per-PR gate** (Lighthouse removed TTI as a
metric in v10; live timing on shared runners is flaky).

### Why it misses, precisely

1. **The container serves assets uncompressed.** `content-encoding` is absent;
   the JS bundle is 301,119 B on the wire (not the 92,498 B gzip figure the
   bundle gate tracks). At 50 KB/s that is ~6.0 s of transfer before parsing.
   `@fastify/static` is not configured for compression and no precompressed
   assets are shipped.
2. Even **with** gzip enabled, 92.5 KB at 50 KB/s ≈ 1.85 s + ≥0.4 s RTT — the
   ≤ 1 s budget is arithmetically unreachable for the current bundle on this
   network profile. architecture.md's "met by design but not yet enforced" was
   optimistic; the Story 3.4 Dev Notes predicted exactly this.

### Decision needed (Keith)

The measured number is honest and the merge-blocking proxy in place is the
**absolute bundle-size ceiling** (95,000 B gz — an NFR-2 *regression stop*,
deliberately not derived from the slow-3G math). Options for follow-up work
(likely Story 3.5 or later):

- **Enable response compression in the container** (`@fastify/compress` or
  precompressed `.gz`/`.br` assets with `@fastify/static`'s `preCompressed`) —
  cheapest single win: ~6.0 s → ~1.9 s transfer.
- **Revise the budget** to something the architecture can meet (e.g. TTI ≤ 3 s
  on slow-3G with compression enabled), recording the change in the UX spec.
- **Bundle-diet work** (React → preact/htm, code-splitting) — out of scope for
  this story and probably disproportionate for a to-do app.

Until one is chosen, the WCAG/performance conformance position is: NFR-1
(latency) **signed off**; NFR-2 (TTI) **enforced as a size regression stop,
budget discrepancy on record here**.
