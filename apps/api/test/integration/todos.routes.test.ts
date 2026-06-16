import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/build-test-app.js';

describe('walking-skeleton round-trip (real temp-file SQLite)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('uses a real on-disk file, not in-memory (AC 7)', () => {
    expect(ctx.databasePath).not.toBe(':memory:');
    expect(ctx.databasePath.endsWith('.db')).toBe(true);
    // The file exists on disk because the connection + schema ran against it.
    expect(existsSync(ctx.databasePath)).toBe(true);
  });

  it('GET /health → 200 liveness payload (AC 2)', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /todos → 200 [] read through the cradle repository (AC 3)', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/todos' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
