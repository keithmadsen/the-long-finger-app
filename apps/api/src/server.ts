import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { registerContainer } from './plugins/awilix.js';
import healthRoute from './routes/health.route.js';
import todosRoute from './routes/todos.route.js';

export interface BuildServerOptions {
  /** On-disk SQLite path — injectable for tests (AC 7). */
  databasePath: string;
  /** Pino logger config; pass `false` to silence (e.g. in tests). */
  logger?: FastifyServerOptions['logger'];
}

// Builds the Fastify app: cradle + routes. Does NOT call listen() — the same
// builder is reused by the integration tests (index.ts owns listening).
export async function buildServer({
  databasePath,
  logger = true,
}: BuildServerOptions): Promise<FastifyInstance> {
  // Pino is on by default: Fastify logs a per-request id (`reqId`) and the
  // per-request latency (`responseTime`) on the response log line. Request
  // bodies are never logged. (AR-9 — logging only, not a CI gate.)
  const app = Fastify({ logger });

  await registerContainer(app, { databasePath });
  await app.register(healthRoute);
  await app.register(todosRoute);

  return app;
}
