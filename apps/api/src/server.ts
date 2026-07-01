import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import helmet from '@fastify/helmet';
import { registerContainer } from './plugins/awilix.js';
import { registerSwagger } from './plugins/swagger.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerStatic } from './plugins/static.js';
import healthRoute from './routes/health.route.js';
import todosRoute from './routes/todos.route.js';

export interface BuildServerOptions {
  /** On-disk SQLite path — injectable for tests (AC 7). */
  databasePath: string;
  /** Pino logger config; pass `false` to silence (e.g. in tests). */
  logger?: FastifyServerOptions['logger'];
  /**
   * Absolute path to the built web dir (apps/web/dist). When provided, serve
   * the built SPA from this directory (same-origin prod serving); omitted in
   * tests and headless local runs so the API runs without a web build.
   */
  staticRoot?: string;
}

// Builds the Fastify app: cradle + routes. Does NOT call listen() — the same
// builder is reused by the integration tests (index.ts owns listening).
export async function buildServer({
  databasePath,
  logger = true,
  staticRoot,
}: BuildServerOptions): Promise<FastifyInstance> {
  // Pino is on by default: Fastify logs a per-request id (`reqId`) and the
  // per-request latency (`responseTime`) on the response log line. Request
  // bodies are never logged. (AR-9 — logging only, not a CI gate.)
  // removeAdditional:false makes a CLOSED body schema (additionalProperties:
  // false, e.g. PatchTodoBody) REJECT an unknown field with a 400 rather than
  // silently stripping it (Fastify's default removeAdditional:true would strip)
  // — this is what satisfies the "extra-field body → 400" half of Story 1.8
  // AC 9. Open schemas (CreateTodoBody) are unaffected: with nothing to close
  // against, extra fields still pass and are ignored downstream. Every other
  // Ajv default (coerceTypes, useDefaults, …) is preserved via the merge.
  // bodyLimit caps the accepted request body at 64 KiB — generous for a
  // ≤200-char todo, but a tight bound versus Fastify's 1 MB default. Oversized
  // bodies are rejected with a 413 before the handler runs (Story 1.11 AC 4).
  const app = Fastify({
    logger,
    bodyLimit: 64 * 1024,
    ajv: { customOptions: { removeAdditional: false } },
  });

  // Baseline security headers (X-Content-Type-Options, X-DNS-Prefetch-Control,
  // Referrer-Policy, …) on the root app so they cover the API and, in prod, the
  // static SPA layer too. CSP is intentionally DISABLED for v1: helmet's default
  // CSP would block the bundled Vite SPA and the swagger-ui /docs assets.
  // Hardened static-serving headers (strict CSP, COEP/CORP) are deferred to
  // Epic 3 Story 3.5 (Story 1.11 AC 4). Registered before routes.
  await app.register(helmet, { contentSecurityPolicy: false });

  await registerContainer(app, { databasePath });

  // Swagger must be registered BEFORE routes (it collects route schemas via an
  // onRoute hook). The error-handler is installed on the root app so it covers
  // every route, including the swagger/health/todos routes that follow.
  await registerSwagger(app);
  registerErrorHandler(app);

  await app.register(healthRoute);
  await app.register(todosRoute);

  // Serve the built SPA only when a static root is supplied, and AFTER the API
  // + swagger routes so the explicit routes win and API 404s keep returning the
  // uniform error envelope. Omitted in tests/headless runs — @fastify/static
  // throws at registration if `root` is missing, so it must stay option-gated.
  if (staticRoot) {
    await registerStatic(app, { staticRoot });
  }

  return app;
}
