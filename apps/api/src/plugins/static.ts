import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

export interface RegisterStaticOptions {
  /** Absolute path to the built web dir (apps/web/dist). */
  staticRoot: string;
}

// Serves the built SPA (apps/web/dist) from a Fastify instance so the API and
// the frontend share ONE origin in production — same-origin relative
// `fetch('/todos')` resolves to the real API route, no Vite proxy, no CORS.
//
// `wildcard: false` is load-bearing: @fastify/static globs the built files at
// startup and serves them by EXACT path (+ `index.html` at `/`) WITHOUT adding
// a `GET /*` catch-all. A catch-all would shadow `/todos`, `/health`, `/docs`
// and convert API 404s into HTML, breaking the uniform error-envelope contract
// (Story 1.11 AC 3). The web app has no client-side router (architecture: "no
// router"), so no SPA deep-link fallback is needed.
//
// Registered only when a static root is supplied (see server.ts) and AFTER the
// API + swagger routes, so the explicit routes always win.
export async function registerStatic(
  app: FastifyInstance,
  { staticRoot }: RegisterStaticOptions,
): Promise<void> {
  await app.register(fastifyStatic, { root: staticRoot, wildcard: false });
}
