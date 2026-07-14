import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/build-test-app.js';
import { expectedAppCsp, parseCsp } from './helpers/csp.js';

// Story 1.11 AC 4: baseline @fastify/helmet headers + an explicit body-size
// limit, applied at the root app so they cover every route. Asserted through
// the standard headless harness (no staticRoot) — the same buildServer the
// container runs. Story 3.5 AC 1 lands the strict CSP on top.
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
  });

  it('emits the committed strict CSP directive set (Story 3.5 AC 1)', async () => {
    const res = await ctx!.app.inject({ method: 'GET', url: '/health' });
    const header = res.headers['content-security-policy'];
    expect(header).toBeDefined();
    expect(parseCsp(String(header))).toEqual(expectedAppCsp);
    // frame-ancestors 'none' and XFO must agree (CSP wins where supported,
    // XFO is the legacy fallback — they should not contradict).
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('locks the COOP/CORP-on, COEP-off posture (1.11 AC 4 second half)', async () => {
    const res = await ctx!.app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    // COEP stays off: nothing needs cross-origin isolation, and it adds
    // embedding friction for zero benefit at v1 (Story 3.5 decision).
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined();
  });

  it('/docs carries swagger-ui’s own staticCSP, not the global policy', async () => {
    const res = await ctx!.app.inject({ method: 'GET', url: '/docs/' });
    expect(res.statusCode).toBe(200);
    const header = String(res.headers['content-security-policy']);
    // swagger-ui’s encapsulated onSend hook owns /docs*: its policy allows
    // its own asset needs (e.g. the validator badge origin) that the global
    // strict policy forbids — proof the override fired and differs.
    expect(header).toContain('validator.swagger.io');
    expect(parseCsp(header)).not.toEqual(expectedAppCsp);
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
