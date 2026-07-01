import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';

// Story 1.11 AC 3: when a staticRoot is supplied, Fastify serves the built SPA
// AND the API from one origin. The static layer (wildcard:false) must NOT shadow
// the API routes nor swallow API 404s. Uses a hermetic temp fixture dir with a
// minimal index.html so the test never depends on a prior `npm run build`.
describe('static SPA serving alongside the API (AC 3)', () => {
  let app: FastifyInstance;
  let staticDir: string;
  let dbDir: string;
  const indexHtml = '<!doctype html><title>tlf</title><h1>The Long Finger</h1>';

  beforeAll(async () => {
    staticDir = mkdtempSync(join(tmpdir(), 'tlf-static-'));
    writeFileSync(join(staticDir, 'index.html'), indexHtml);
    dbDir = mkdtempSync(join(tmpdir(), 'tlf-staticdb-'));

    app = await buildServer({
      databasePath: join(dbDir, 'todos.db'),
      logger: false,
      staticRoot: staticDir,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(staticDir, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('GET / returns the built index.html as text/html', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('The Long Finger');
  });

  it('GET /todos is NOT shadowed by static — still returns the JSON array', async () => {
    const res = await app.inject({ method: 'GET', url: '/todos' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json()).toEqual([]);
  });

  it('an unknown API path still returns the uniform error envelope (no catch-all)', async () => {
    const res = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: 'NOT_FOUND' });
  });
});
