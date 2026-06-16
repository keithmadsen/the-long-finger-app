import type { FastifyInstance } from 'fastify';

// GET /health — liveness probe for container orchestration (AC 2).
export default async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok' }));
}
