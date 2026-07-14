# Instructions Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every gap between this repo and the training brief `docs/instructions.md`: Docker Compose orchestration, non-root/healthchecked container, recorded coverage numbers, and the four missing documentation deliverables (security review, AI integration log, BMAD narrative, README refresh).

**Architecture:** Two small infrastructure changes (Dockerfile hardening, new `docker-compose.yml`) verified by extending the existing `scripts/verify-container.sh` harness, followed by five documentation deliverables under `docs/` reconstructed from evidence already in the repo (`_bmad-output/`, git history, coverage runs). No application code changes.

**Tech Stack:** Docker / Docker Compose v2, Node 24, Vitest coverage (v8), npm audit, Markdown.

## Global Constraints

- **Node 24 required** for any test/coverage command: run `nvm use 24` first (better-sqlite3 ABI fails under the shell-default Node 22).
- **Docker daemon is not auto-started** on this machine: run `open -a Docker` and wait for it before any docker step.
- **No CI changes.** Story 1.11 declined a Docker-build CI job and Story 3.4 owns all CI config; everything Docker here is verified locally via scripts.
- **Do not modify application source** (`apps/*/src`, `packages/`) — this plan is packaging + documentation only. If a doc claim turns out false when reading code, record it as a finding, don't "fix" code.
- **Work on a branch:** all commits go on `chore/instructions-gap-closure` off `main` (create in Task 1, Step 0). Keith merges via PR; do not push or open a PR unless he asks.
- Container listens on **8080** internally; `/health` returns `{"status":"ok"}` (`apps/api/src/routes/health.route.ts`). The `node` user in `node:24-slim` is uid/gid 1000.

---

### Task 1: Dockerfile hardening — non-root USER + HEALTHCHECK

The brief (Step 3, "Dockerfiles") explicitly requires "multi-stage builds, non-root users, and health checks". Multi-stage exists; the other two don't. TDD here = extend the verification script first, watch it fail against the current image, then fix the Dockerfile.

**Files:**
- Modify: `scripts/verify-container.sh` (insert new checks after the first `wait_health` block, i.e. after the line `echo "health: 200 OK"`)
- Modify: `Dockerfile` (runner stage only)

**Interfaces:**
- Consumes: existing `verify-container.sh` helpers `log`, `fail`, `wait_health`, `$CONTAINER`.
- Produces: an image where `id -u` inside the container is `1000` and `docker inspect --format '{{.State.Health.Status}}'` reaches `healthy` — Task 2's compose file inherits this HEALTHCHECK.

- [ ] **Step 0: Create the working branch**

```bash
git checkout main && git checkout -b chore/instructions-gap-closure
```

- [ ] **Step 1: Add the failing checks to the verification script**

In `scripts/verify-container.sh`, immediately after the line `echo "health: 200 OK"`, insert:

```sh
log "container runs as non-root (brief Step 3: non-root users)"
CONTAINER_UID=$(docker exec "$CONTAINER" id -u)
[ "$CONTAINER_UID" = "1000" ] || fail "container running as uid $CONTAINER_UID, wanted 1000 (node)"
echo "uid: $CONTAINER_UID (node)"

log "Docker HEALTHCHECK reports healthy (brief Step 3: health checks)"
deadline=$(( $(date +%s) + 60 ))
while :; do
  HSTATUS=$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo none)
  [ "$HSTATUS" = "healthy" ] && break
  [ "$(date +%s)" -gt "$deadline" ] && fail "health status '$HSTATUS' not healthy within 60s"
  sleep 1
done
echo "healthcheck: healthy"
```

- [ ] **Step 2: Run the script to verify it fails against the current image**

Run: `open -a Docker` (wait for the daemon), then `./scripts/verify-container.sh`
Expected: FAIL at the non-root check with `FAIL: container running as uid 0, wanted 1000 (node)` (docker's cleanup trap removes the run's container/volume).

- [ ] **Step 3: Harden the Dockerfile runner stage**

In `Dockerfile`, replace the block

```dockerfile
# SQLite durability across restarts (AC 5). connection.ts mkdir's the parent of
# DATABASE_PATH, so a fresh /data volume initialises cleanly and a reused volume
# retains todos.db (+ the *.db-wal / *.db-shm WAL sidecars).
VOLUME ["/data"]
```

with

```dockerfile
# SQLite durability across restarts (AC 5). connection.ts mkdir's the parent of
# DATABASE_PATH, so a fresh /data volume initialises cleanly and a reused volume
# retains todos.db (+ the *.db-wal / *.db-shm WAL sidecars). /data is created
# and chowned BEFORE VOLUME so a fresh named volume inherits node-ownership —
# required because the process runs as the non-root `node` user (uid 1000).
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node

# Orchestrator-facing liveness: Node 24's global fetch against the API's own
# /health route — node:24-slim ships no curl/wget, and this avoids adding one.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
```

(Keep the existing exec-form `CMD` comment block and `CMD` line below this, unchanged.)

- [ ] **Step 4: Run the full verification script to verify it passes**

Run: `./scripts/verify-container.sh`
Expected: all sections pass, including `uid: 1000 (node)`, `healthcheck: healthy`, both persistence legs, and `ALL CHECKS PASSED`. This also proves the SIGTERM/SIGKILL/WAL behavior from story 3.5 still works as the non-root user.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile scripts/verify-container.sh
git commit -m "feat: run container as non-root node user with HEALTHCHECK

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: docker-compose.yml — orchestration + dev/test profiles

Closes the brief's named success criterion "application runs successfully via docker-compose up", plus "proper networking, volume mounts, and environment configuration" and "dev/test environments through environment variables and compose profiles".

**Files:**
- Create: `docker-compose.yml` (repo root)

**Interfaces:**
- Consumes: Task 1's image (HEALTHCHECK is inherited by compose; `docker compose ps` shows `(healthy)`).
- Produces: services `app` (default, persistent named volume `tlf-data`) and `app-test` (profile `test`, ephemeral anonymous volume). Env vars: `PORT` (host port for `app`, default 8080), `TEST_PORT` (host port for `app-test`, default 18080).

- [ ] **Step 1: Write docker-compose.yml**

```yaml
# Orchestration for the single production image (Fastify serves API + built SPA
# from one origin — see Dockerfile). Two services, one image:
#
#   docker compose up -d                    # prod-shaped: persistent tlf-data volume
#   docker compose --profile test up -d     # test: ephemeral anonymous /data volume
#
# Env config (brief Step 3 "Environment Config"): PORT / TEST_PORT pick the host
# port per environment; in-container the app always listens on 8080 and writes
# SQLite to /data/todos.db (set via ENV in the Dockerfile).
name: tlf

services:
  app:
    build: .
    image: tlf-app
    ports:
      - "${PORT:-8080}:8080"
    volumes:
      - tlf-data:/data
    restart: unless-stopped

  app-test:
    profiles: ["test"]
    build: .
    image: tlf-app
    ports:
      - "${TEST_PORT:-18080}:8080"
    volumes:
      - /data   # anonymous volume: node-owned like the image dir, discarded with `down -v`

volumes:
  tlf-data:
```

- [ ] **Step 2: Verify the prod service — up, healthy, logs, persistence**

Run each command and check the expected result:

```bash
docker compose up -d --build
docker compose ps                     # app shows "Up ... (healthy)" within ~30s
curl -s http://localhost:8080/health  # {"status":"ok"}
docker compose logs app | head -5     # pino JSON startup lines visible (brief: logs accessible)

# persistence across down/up (named volume survives `down` without -v):
curl -s -X POST http://localhost:8080/todos -H 'content-type: application/json' \
  -d '{"id":"01920000-0000-7000-8000-00000000c0de","description":"compose persistence check"}'   # 201 body
docker compose down
docker compose up -d
sleep 5 && curl -s http://localhost:8080/todos | grep -c c0de   # 1
docker compose down
```

- [ ] **Step 3: Verify the test profile — ephemeral data, separate port**

```bash
docker compose --profile test up -d app-test
sleep 5 && curl -s http://localhost:18080/health                # {"status":"ok"}
curl -s http://localhost:18080/todos                            # [] — no bleed from tlf-data
docker compose --profile test down -v                           # anonymous volume discarded
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose orchestration with test profile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Coverage report — measure and record the overall number

The brief's success criterion is "minimum 70% meaningful code coverage", but only delete-path-scoped thresholds are recorded anywhere. This task runs the existing coverage commands and records the overall numbers with a gap analysis.

**Files:**
- Create: `docs/coverage-report.md`

**Interfaces:**
- Consumes: existing npm scripts `test:coverage` (apps/web) and `test:integration:coverage` (apps/api).
- Produces: `docs/coverage-report.md`, linked from the README in Task 7.

- [ ] **Step 1: Run both coverage suites and capture the summary tables**

```bash
nvm use 24
npm run test:coverage --workspace apps/web 2>&1 | tee /tmp/web-coverage.txt
npm run test:integration:coverage --workspace apps/api 2>&1 | tee /tmp/api-coverage.txt
```

Expected: both suites PASS (they run in CI on every merge). Copy each run's full `% Coverage report` summary table — especially the `All files` row (Stmts / Branch / Funcs / Lines).

- [ ] **Step 2: Write docs/coverage-report.md**

Structure (fill the ⟨angle-bracket⟩ slots with the actual numbers from Step 1 — everything else verbatim):

```markdown
# Test Coverage Report

Recorded: 2026-07-14 · Node 24 · Vitest v8 coverage provider

Brief target (`docs/instructions.md`, Success Criteria): **minimum 70% meaningful coverage**.

## Overall numbers

| Suite | Command | Stmts | Branch | Funcs | Lines |
| --- | --- | --- | --- | --- | --- |
| Web (component + hooks) | `npm run test:coverage --workspace apps/web` | ⟨%⟩ | ⟨%⟩ | ⟨%⟩ | ⟨%⟩ |
| API (integration) | `npm run test:integration:coverage --workspace apps/api` | ⟨%⟩ | ⟨%⟩ | ⟨%⟩ | ⟨%⟩ |

Verdict vs the 70% target: ⟨met / not met, per suite, one sentence⟩.

## Enforced thresholds (CI, story 3.4)

Coverage *gates* are deliberately scoped to the highest-risk path (delete) rather than
a blanket repo-wide floor: >90% on `useArmedDelete`/`useDeleteTodo` (web) and >80% on
the todos route/repository (API). This report records the overall picture; the gates
prevent regression where it matters most.

## Gap analysis

⟨List every file whose line coverage is below 70%, from the Step 1 tables, one bullet
each: path, number, and either why it's acceptable (e.g. bootstrap/entrypoint code,
covered by E2E instead) or what test would close it. If nothing is below 70%, say so.⟩

Not counted here: 13 Playwright E2E tests (`e2e/tests/`) and the API unit suite
(`npm run test:unit`) exercise further paths without instrumented coverage.
```

- [ ] **Step 3: Commit**

```bash
git add docs/coverage-report.md
git commit -m "docs: record overall coverage vs the 70% training-brief target

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Security review report

The brief (Step 4) requires an AI-assisted review of common security issues, with documented findings **and** remediations. The mitigations largely exist in code (helmet/CSP, prepared statements, closed schemas, error envelope); this task verifies each claim against the actual source and writes the report — evidence first, no unverified assertions.

**Files:**
- Create: `docs/security-review.md`

**Interfaces:**
- Consumes: Task 1's non-root container (cite it in the container section).
- Produces: `docs/security-review.md`, linked from the README in Task 7.

- [ ] **Step 1: Gather evidence**

Run and save output:

```bash
nvm use 24
npm audit 2>&1 | tail -20          # full tree
npm audit --omit=dev 2>&1 | tail -20   # production-relevant subset
```

Then read each of these files and confirm the specific claim before writing it (if any claim doesn't hold, record it as a **finding** instead):

| Claim to verify | File |
| --- | --- |
| Helmet registered first; strict CSP (`default-src 'self'`, `frame-ancestors 'none'`) at the static layer | `apps/api/src/server.ts` + `apps/api/src/plugins/` (helmet/static registration) |
| 5xx envelope never leaks message/stack; real error only to pino | `apps/api/src/plugins/error-handler.ts` |
| All SQL is prepared statements, no string interpolation | `apps/api/src/repositories/todo.repository.ts` |
| Closed body schemas reject unknown fields with 400 (`removeAdditional: false`) | `apps/api/src/server.ts` (Ajv config) + `packages/contracts/` (`additionalProperties: false`) |
| 4xx logged at warn without payloads (never-log-payloads lock, story 3.5) | `apps/api/src/plugins/error-handler.ts` and its test |

- [ ] **Step 2: Write docs/security-review.md**

Sections, in order — populate each from Step 1's verified evidence with `file:line` references:

1. **Scope & method** — AI-assisted review (Claude Code) of the OWASP-style categories named in the brief: XSS, injection, security headers, information disclosure, input validation, dependency and container posture. Date, commit hash (`git rev-parse --short HEAD`).
2. **Findings & remediations table** — one row per category: Category | Status (mitigated / finding / n/a) | Evidence (`file:line`) | Remediation. XSS row covers both React's default escaping *and* the CSP; injection row cites the prepared statements; disclosure row cites the 5xx envelope + never-log-payloads; validation row cites closed Ajv schemas; container row cites non-root user + HEALTHCHECK (Task 1) and exec-form PID-1 shutdown (story 3.5).
3. **Dependency audit** — the two `npm audit` results verbatim; for any non-zero advisory, a row with severity and disposition (fix now / accept with reason).
4. **Out of scope / residual risk** — no authn/authz by design (single-user local app per PRD), plain HTTP inside the container (TLS is a deployment concern), SQLite file permissions rely on volume ownership.

- [ ] **Step 3: Commit**

```bash
git add docs/security-review.md
git commit -m "docs: add security review report (brief Step 4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: AI integration log

Required deliverable ("maintain a log throughout") that was never started. Reconstruct it from the repo's own record, then flag it for Keith's pass — the "which prompts worked best" answers are his to confirm.

**Files:**
- Create: `docs/ai-integration-log.md`

**Interfaces:**
- Produces: `docs/ai-integration-log.md`, linked from the README in Task 7.

- [ ] **Step 1: Mine the sources**

Read, in this order, extracting dated events involving AI agents, skills, or MCP servers:
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — the dated comment log is a near-complete timeline (create-story → dev-story → code-review per story; testarch-framework; scope decisions).
- `_bmad-output/implementation-artifacts/epic-1-retro-2026-07-01.md` and `epic-2-retro-2026-07-01.md` — what worked / what didn't, in the team's own words.
- `_bmad-output/implementation-artifacts/deferred-work.md` — items AI flagged but deferred.
- 2–3 representative story files (e.g. `1-2-…`, `2-3-…`, `3-4-…`) — how ACs and test scenarios were specified for the dev agent.

- [ ] **Step 2: Write docs/ai-integration-log.md**

Exactly the five sections the brief names, each populated from Step 1 evidence with dates and artifact links:

1. **Agent Usage** — the BMAD persona/skill per phase (PM → PRD iterations + validation reports; Architect → `architecture.md`; create-story/dev-story per story; Keith's separate-model code-review pass per story — note this deliberate "fresh context, different LLM" choice as a working practice). Cite concrete story→PR examples from the sprint log.
2. **MCP Server Usage** — which servers actually featured (e.g. Playwright-driven browser verification, Chrome DevTools where used); honest "not used" notes where the brief suggested a tool the project replaced with something better (e.g. Postman MCP → shared TypeBox contracts enforced at both boundaries).
3. **Test Generation** — ATDD checklist artifact, test-design docs, axe/emulation gate generation; what AI missed (pull real examples from retro/review notes, e.g. deferred a11y race tests from 2.2 → 2.3).
4. **Debugging with AI** — concrete episodes from the record (e.g. story 3.5's npm-as-PID-1 SIGTERM diagnosis documented in the Dockerfile comments; the TTI slow-3G budget miss investigation).
5. **Limitations Encountered** — where human expertise was critical (scope calls recorded as "Keith's call" in the sprint log: declining whole-suite emulation projects, NVDA/VoiceOver legs deferred to release candidate, k6 dual-track decision).

End the file with a short *"Maintained retrospectively on 2026-07-14 from the project record; reviewed by Keith"* provenance note — honest about the reconstruction.

- [ ] **Step 3: Ask Keith to review the draft** — specifically the "prompts that worked best" and MCP-usage claims, before treating this deliverable as done.

- [ ] **Step 4: Commit**

```bash
git add docs/ai-integration-log.md
git commit -m "docs: add AI integration log (reconstructed from project record)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: BMAD implementation narrative

The deliverable "documentation of how BMAD guided the implementation" — a synthesis, distinct from the raw `_bmad-output/` artifacts and from Task 5's tool-focused log.

**Files:**
- Create: `docs/bmad-implementation-narrative.md`

**Interfaces:**
- Produces: `docs/bmad-implementation-narrative.md`, linked from the README in Task 7.

- [ ] **Step 1: Write docs/bmad-implementation-narrative.md**

One page, four sections, every claim linked to an artifact:

1. **Specs first** — brief Step 1 mapped to artifacts: two PRD iterations with validation reports (`_bmad-output/planning-artifacts/prds/`), `architecture.md`, `ux-design-specification.md`, `epics.md`, the implementation-readiness report (2026-06-15) as the explicit gate before any code.
2. **Story-by-story build** — the repeating cycle (create-story → dev-story → review → done) shown once with a concrete example (pick story 1.2's multi-round review from the sprint log); 19 stories over 3 epics, 2026-06-16 → 2026-07-14; epic retros feeding the next epic (cite: runtime schema validation folded into 2.1 per epic-1 retro action item 2; e2e harness carried from epic-2 retro to 3.4).
3. **Where we adapted BMAD** — deliberate deviations and why: code review in fresh context with a different model; parallel-track stories (3-4/3-5) when dependencies allowed; deferred-work.md as the pressure valve keeping stories small.
4. **What the method bought us** — 2–3 sentences: traceability (ACs cited in code comments), QA-from-day-one (walking skeleton with tests in story 1.1), and a decision record (sprint-status.yaml) that made this narrative reconstructable.

- [ ] **Step 2: Commit**

```bash
git add docs/bmad-implementation-narrative.md
git commit -m "docs: add BMAD implementation narrative

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: README refresh + close the loop

The README still describes the story-1.1 walking skeleton. Bring it to the finished state and index the new deliverables; record gap closure in the sprint log.

**Files:**
- Modify: `README.md`
- Modify: `_bmad-output/implementation-artifacts/sprint-status.yaml` (one dated comment line)

**Interfaces:**
- Consumes: all docs created in Tasks 2–6 (linked here) and the compose commands from Task 2.

- [ ] **Step 1: Update README.md**

Three edits:

**(a)** Replace the stale status block

```markdown
> **Status:** Story 1.1 — *walking skeleton*. One thin vertical slice (`browser → Vite proxy → Fastify → awilix cradle → repository → on-disk SQLite → back`) is wired end-to-end to prove the architecture. No features beyond that slice exist yet.
```

with

```markdown
> **Status:** Feature-complete. Three epics delivered story-by-story with the BMAD method
> (capture/view/complete → safe delete → production readiness): full CRUD with optimistic
> UI and retry-safe idempotent creates, WCAG 2.2 AA conformance with CI-enforced gates,
> and a hardened single-image production deploy. See `_bmad-output/` for the full
> planning and implementation record.
```

**(b)** After the "Run (development)" section, add a production section (adjust placement to fit the file's existing flow — read it first):

```markdown
## Run (production, Docker Compose)

One image serves the API and the built SPA from a single origin:

​```bash
docker compose up -d --build    # http://localhost:8080  (override host port: PORT=9090 docker compose up -d)
docker compose logs -f app      # structured pino logs
docker compose down             # todos persist in the tlf-data volume; add -v to reset
​```

An ephemeral instance for testing (no persistent volume, port 18080):

​```bash
docker compose --profile test up -d app-test
docker compose --profile test down -v
​```

The container runs as the non-root `node` user, reports liveness via a Docker
`HEALTHCHECK` against `/health`, and shuts down gracefully on SIGTERM (WAL
checkpoint included). `./scripts/verify-container.sh` proves all of this plus
data durability across stop/start and SIGKILL.
```

**(c)** Add a docs index at the end of the file:

```markdown
## Project documentation

- [Training brief](docs/instructions.md) — the original assignment this project implements
- [PRD](docs/prd.md) · [BMAD implementation narrative](docs/bmad-implementation-narrative.md) · full artifact record in `_bmad-output/`
- [AI integration log](docs/ai-integration-log.md)
- QA reports: [coverage](docs/coverage-report.md) · [security review](docs/security-review.md) · [WCAG conformance matrix](docs/wcag-conformance-matrix.md) · [screen-reader smoke test](docs/screen-reader-smoke-test.md) · [k6 latency sign-off](docs/k6-latency-signoff.md)
```

(When inserting block (b), un-escape the inner code fences — they're escaped here only to survive this plan's own fencing.)

- [ ] **Step 2: Verify every README link and command**

- Every relative link in the new sections resolves: `ls docs/coverage-report.md docs/security-review.md docs/ai-integration-log.md docs/bmad-implementation-narrative.md docs/wcag-conformance-matrix.md docs/screen-reader-smoke-test.md docs/k6-latency-signoff.md docs/instructions.md docs/prd.md`
- `docker compose up -d --build` then `curl -s http://localhost:8080/health` returns `{"status":"ok"}`; `docker compose down`.

- [ ] **Step 3: Append the closure note to the sprint log**

In `_bmad-output/implementation-artifacts/sprint-status.yaml`, add one comment line below the most recent dated comment, matching the existing style:

```yaml
# 2026-07-14: instructions-gap-closure (non-story track, Keith's call) — docker-compose + non-root/HEALTHCHECK, coverage report, security review, AI integration log, BMAD narrative, README refresh; brief docs/instructions.md deliverables complete except Framework Comparison (external pathway step)
```

- [ ] **Step 4: Commit**

```bash
git add README.md _bmad-output/implementation-artifacts/sprint-status.yaml
git commit -m "docs: refresh README to delivered state; index QA and BMAD deliverables

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Out of scope

- **Framework Comparison** success criterion — blank in the brief itself; belongs to a later pathway step. Flagged in the Task 7 sprint-status note.
- The slow-3G TTI budget miss (uncompressed container assets) — already on record in `docs/k6-latency-signoff.md` with a pending decision; a compression change is a runtime change outside this packaging/documentation plan.
- CI changes of any kind.

## Final verification (after all tasks)

1. `./scripts/verify-container.sh` → `ALL CHECKS PASSED` (now includes non-root + healthcheck).
2. `docker compose up -d --build` → `docker compose ps` shows `(healthy)`; create a todo in the browser at `http://localhost:8080`; `docker compose down && docker compose up -d` → todo still there; `docker compose down`.
3. Walk the brief's Success Criteria table top-to-bottom and point at the artifact for each row: CRUD app ✓, coverage ≥70% → `docs/coverage-report.md`, ≥5 Playwright tests → 13 in `e2e/tests/`, `docker compose up` ✓, zero critical WCAG violations → axe gate + `docs/wcag-conformance-matrix.md`, README + AI log ✓.
4. `nvm use 24 && npm run typecheck && npm test` — untouched, but proves the branch is merge-clean.
