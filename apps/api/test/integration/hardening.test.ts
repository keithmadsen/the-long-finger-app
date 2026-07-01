import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/build-test-app.js';

// Story 1.11 AC 4: baseline @fastify/helmet headers + an explicit body-size
// limit, applied at the root app so they cover every route. Asserted through
// the standard headless harness (no staticRoot) — the same buildServer the
// container runs.
describe('baseline hardening: helmet headers + body limit (AC 4)', () => {
  let ctx: TestApp | undefined;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('applies representative helmet security headers on a normal response', async () => {
    const res = await ctx!.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    // Two stable, default-on helmet headers — proof helmet is registered.
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    // CSP is intentionally disabled for v1 (would break the bundled SPA).
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  it('rejects a body larger than the 64 KiB limit with 413', async () => {
    // 80 KiB of payload — comfortably over the 64 KiB bodyLimit, so Fastify
    // rejects it at the transport layer before the route/schema runs.
    const oversized = JSON.stringify({ description: 'x'.repeat(80 * 1024) });
    const res = await ctx!.app.inject({
      method: 'POST',
      url: '/todos',
      headers: { 'content-type': 'application/json' },
      payload: oversized,
    });
    expect(res.statusCode).toBe(413);
    // Still wrapped in the uniform error envelope by the error handler.
    expect(res.json().error).toMatchObject({ code: expect.any(String) });
  });
});
