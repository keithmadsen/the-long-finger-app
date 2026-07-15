# Security Review

## 1. Scope & method

AI-assisted review (Claude Code) of the OWASP-style categories named in the training
brief: **XSS**, **injection**, **security headers**, **information disclosure**,
**input validation**, and **dependency and container posture**. Each claim below was
verified by reading the cited source line(s) directly — no claim is carried over
from documentation or commit messages without independent confirmation in the
current tree.

- **Reviewed commit:** `fb32f78`
- **Date:** 2026-07-14
- **Repo:** `the-long-finger-app` (apps/api Fastify 5 + apps/web React 19 SPA + `@tlf/contracts`, shipped as one Docker image)

## 2. Findings & remediations table

| Category | Status | Evidence | Remediation |
| --- | --- | --- | --- |
| **XSS** | Mitigated | React 19 escapes all interpolated JSX text/attribute values by default (no `dangerouslySetInnerHTML` used anywhere in `apps/web/src` — confirmed by search, zero hits) *and* a strict CSP is registered on the root app before any routes: `apps/api/src/server.ts:66-84` (`default-src: ["'self'"]`, `script-src: ["'self'"]`, `frame-ancestors: ["'none'"]`, `xFrameOptions: { action: 'deny' }`). Helmet is registered first, ahead of the cradle/swagger/routes/static (`apps/api/src/server.ts:86-103`), so the same policy covers the API and the static SPA layer in production (`apps/api/src/plugins/static.ts:22-27` registers `@fastify/static` on the same root app instance after the CSP is already installed). | None required. If inline scripts/styles are ever introduced, the CSP will break them by design — that is the intended guardrail, not a bug to work around with `'unsafe-inline'`. |
| **Injection (SQL)** | Mitigated | Every caller-influenced CRUD statement in `apps/api/src/repositories/todo.repository.ts` is a `db.prepare(...)` call with named (`@id`, `@description`, …) or positional (`?`) placeholders — `listStatement` (line 19-21), `insertStatement` (22-26), `findByIdStatement` (27), `updateStatement` (28-30), `deleteStatement` (31). No caller-supplied value is interpolated into SQL. The other production SQL is fixed schema/bootstrap text in `apps/api/src/db/schema.ts`; this is an observation of the reviewed tree, not a lint-enforced architectural boundary. | None required. Add an architectural lint/test if this convention ever needs mechanical enforcement. |
| **Security headers** | Mitigated | Helmet registered via `await app.register(helmet, {...})` at `apps/api/src/server.ts:66-84`, before `registerContainer`/`registerSwagger`/`registerErrorHandler`/routes/static (lines 86-103) — headers apply to every response on the instance. CSP directives close the gaps versus helmet's defaults: `style-src`/`font-src`/`img-src` tightened to `'self'` (no `unsafe-inline`/`https:`/`data:`), `object-src: 'none'`, `base-uri: 'self'`, `form-action: 'self'`, `frame-ancestors: 'none'` (server.ts:69-81). Swagger's `/docs` UI is the one documented, intentional exception — it overrides the CSP with its own `staticCSP` inside an encapsulated onSend hook per `apps/api/src/server.ts:63-64` comment (not re-verified line-by-line here since `/docs` is a dev/inspection surface, not the app surface). | None required. |
| **Information disclosure** | Mitigated | 5xx responses never leak the real error: `apps/api/src/plugins/error-handler.ts:41` — `message` is hard-coded to `'Internal Server Error'` whenever `statusCode >= 500`; the real `error` object is only ever passed to `request.log.error(error)` at line 45, never into the reply. `reply.status(statusCode).send(envelope)` at line 62 sends only `{ code, message, details? }`, and `details` is populated only from Ajv `error.validation` (4xx path, line 58), never from a 5xx. Verified end-to-end by the integration test `apps/api/test/integration/logging.test.ts:116-127` — forces a real `throw new Error('kaboom')` on an ad hoc `/boom` route and asserts `res.json().error.message === 'Internal Server Error'` while a single `level === 50` (error) log line is captured server-side. | None required. |
| **Information disclosure — never-log-payloads** | Mitigated | 4xx branch logs only `{ statusCode, code }` and the derived `message` at `warn`, never `error.validation` or the request body: `apps/api/src/plugins/error-handler.ts:46-52` (comment at 47-50 explicitly calls out that `error.validation` "can embed the submitted value" and must not be logged) and the 404 branch at lines 65-80 logs only `request.method`/`request.url`. Test-verified by `apps/api/test/integration/logging.test.ts:82-102` (`SENTINEL` marker in an oversized/invalid POST body appears in the client-facing 400 envelope but the warn-level *log line* does not contain it, and `warn.validation` is asserted `undefined`) and by the whole-suite negative assertion at `logging.test.ts:129-142` (the sentinel appears in **zero** log lines across the full run, including a successful 201 create). | None required. |
| **Input validation** | Mitigated (with one documented asymmetry, not a defect) | Ajv is configured with `removeAdditional: false` at `apps/api/src/server.ts:46`, so a *closed* schema (`additionalProperties: false`) rejects an unknown field with 400 instead of Fastify's default silent-strip behavior (comment at `server.ts:33-39`). `PatchTodoBody` is closed: `packages/contracts/src/todo.schema.ts:54-59` (`{ completed: Type.Boolean() }, { $id: 'PatchTodoBody', additionalProperties: false }`). `CreateTodoBody` (`todo.schema.ts:39-45`) is deliberately **open** (no `additionalProperties: false`) — extra fields are accepted and ignored downstream rather than rejected, per the schema's own comment and `todo.repository.ts:58-68` (`insertTodo` only ever reads `input.id`/`input.description` off the validated body, so an extra field cannot reach storage regardless of schema closure). This is a documented design choice, not a gap: only `PatchTodoBody` needed the closed-schema guarantee (Story 1.8 AC 9); `CreateTodoBody`'s shape is narrow enough that an ignored extra field has no effect. `id` is further constrained by a UUIDv7 `pattern` (`todo.schema.ts:18-19,41`) and `description` is length-bounded 1–200 chars (`todo.schema.ts:25,42`); request bodies are additionally capped at 64 KiB (`server.ts:45`, 413 before the handler runs). | None required for `PatchTodoBody`/`CreateTodoBody` as specified. If a future body schema needs strict-unknown-field rejection, add `additionalProperties: false` to that schema explicitly (Ajv config already supports it). |
| **Container posture** | Mitigated | Runtime stage drops root: `USER node` at `Dockerfile:60`, with `/data` pre-created and `chown`'d to `node:node` at `Dockerfile:58` *before* the `VOLUME` declaration so a fresh named volume inherits correct ownership (comment `Dockerfile:53-59`). Orchestrator-facing liveness via `HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3` at `Dockerfile:64-65`, using Node's global `fetch` against the container's own `/health` route (no curl/wget added to the slim image). PID-1 shutdown handling is exec-form: `CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]` at `Dockerfile:75`, so `node` itself is PID 1 and receives `SIGTERM` directly — comment at `Dockerfile:67-74` documents that an `npm`-as-PID-1 form does not reliably forward `SIGTERM`, causing `docker stop` to stall the full grace period and fall back to `SIGKILL`. | None required. |

## 3. Dependency audit

Run under Node 24 (`nvm use 24`) at commit `fb32f78`.

### `npm audit` (full tree, includes devDependencies)

```
# npm audit report

uuid  <11.1.1
Severity: moderate
uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided - https://github.com/advisories/GHSA-w5hq-g745-h8pq
No fix available
node_modules/@seontechnologies/playwright-utils/node_modules/uuid
node_modules/exceljs/node_modules/uuid
  @seontechnologies/playwright-utils  *
  Depends on vulnerable versions of exceljs
  Depends on vulnerable versions of uuid
  node_modules/@seontechnologies/playwright-utils
  exceljs  >=3.5.0
  Depends on vulnerable versions of uuid
  node_modules/exceljs

3 moderate severity vulnerabilities

To address issues that do not require attention, run:
  npm audit fix

Some issues need review, and may require choosing
a different dependency.
```

### `npm audit --omit=dev` (production-relevant subset)

```
found 0 vulnerabilities
```

### Disposition

| Advisory | Severity | Path | Disposition |
| --- | --- | --- | --- |
| `uuid` &lt;11.1.1 — missing buffer bounds check in v3/v5/v6 when a caller-supplied `buf` is provided ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)) | Moderate | Classified dev-only by npm: `@seontechnologies/playwright-utils` → `exceljs` → `uuid`, so it is omitted by `npm audit --omit=dev`. However, the current runner copies the builder's complete `node_modules`, so this chain is physically present in the production image even though the application does not import it. | **Accept with residual risk.** The vulnerable `buf` code path is not reachable from the app's runtime imports, and no upstream fix is available. Re-check on dependency upgrades; prune build/test packages when the TypeScript-at-runtime image strategy is revised. |

No dependencies classified by npm as production dependencies have advisories. This classification
does not mean the current image excludes dev packages; the disposition above records that distinction.

## 4. Out of scope / residual risk

- **No authentication/authorization.** By design — this is a single-user local app per the PRD (`docs/prd.md`); every `/todos` route is unauthenticated and there is no per-user data isolation. Acceptable for the stated deployment model (a single operator, single Docker container); would need to be addressed before any multi-tenant or internet-exposed deployment.
- **Plain HTTP inside the container.** The container serves plain HTTP (`Dockerfile` `EXPOSE 8080`, no TLS termination in-process); TLS is a deployment concern left to whatever sits in front of the container (reverse proxy, load balancer, etc.) and is explicitly out of scope for the app's own CSP/header configuration (`apps/api/src/server.ts:61` comment: "upgrade-insecure-requests omitted (the container serves plain HTTP — TLS termination is upstream/undefined at v1)").
- **SQLite file permissions rely on volume ownership.** `/data` is `chown`'d to the non-root `node` user at build time (`Dockerfile:58`) and declared as a `VOLUME` (`Dockerfile:59`), but the actual on-disk permissions of a bind-mounted or named volume at runtime are governed by whatever the orchestrator/host provides — the app does not independently enforce file-mode restrictions on `todos.db` beyond what the process's own `umask` and the pre-created directory ownership establish.
- **Legacy root-owned volumes are unsupported.** A volume created by the previous root-running image can hide the image-layer ownership and leave `/data` unwritable by `node`. The supported upgrade boundary is a fresh `node`-owned volume; this release does not include an automatic ownership migration.
