import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server.js';
import { buildTestApp, type TestApp } from './helpers/build-test-app.js';

describe('walking-skeleton round-trip (real temp-file SQLite)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('uses a real on-disk file, not in-memory (AC 6)', () => {
    expect(ctx.databasePath).not.toBe(':memory:');
    expect(ctx.databasePath.endsWith('.db')).toBe(true);
    // The file exists on disk because the connection + schema ran against it.
    expect(existsSync(ctx.databasePath)).toBe(true);
  });

  it('GET /health → 200 liveness payload', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /todos → 200 [] read through the cradle repository', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/todos' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

describe('GET /todos read path (canonical, camelCase, no envelope)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await buildTestApp();
    // Seed with controlled timestamps through the cradle db so the ordering
    // assertion is deterministic (server-stamped inserts could collide on ms).
    const { db } = ctx.app.diContainer.cradle;
    const insert = db.prepare(
      `INSERT INTO todos (id, description, completed, created_at, updated_at)
       VALUES (@id, @description, @completed, @created_at, @updated_at)`,
    );
    insert.run({
      id: 'completed-newer',
      description: 'Completed newer',
      completed: 1,
      created_at: '2026-06-17T09:00:00.000Z',
      updated_at: '2026-06-17T12:00:00.000Z',
    });
    insert.run({
      id: 'active-older',
      description: 'Active older',
      completed: 0,
      created_at: '2026-06-17T09:00:00.000Z',
      updated_at: '2026-06-17T10:00:00.000Z',
    });
    insert.run({
      id: 'active-newer',
      description: 'Active newer',
      completed: 0,
      created_at: '2026-06-17T09:00:00.000Z',
      updated_at: '2026-06-17T11:00:00.000Z',
    });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('returns a bare canonically-ordered camelCase Todo[] with no success envelope (AC 3, 5)', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/todos' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([
      {
        id: 'active-newer',
        description: 'Active newer',
        completed: false,
        createdAt: '2026-06-17T09:00:00.000Z',
        updatedAt: '2026-06-17T11:00:00.000Z',
      },
      {
        id: 'active-older',
        description: 'Active older',
        completed: false,
        createdAt: '2026-06-17T09:00:00.000Z',
        updatedAt: '2026-06-17T10:00:00.000Z',
      },
      {
        id: 'completed-newer',
        description: 'Completed newer',
        completed: true,
        createdAt: '2026-06-17T09:00:00.000Z',
        updatedAt: '2026-06-17T12:00:00.000Z',
      },
    ]);
    expect(body).not.toHaveProperty('data');
  });
});

describe('durability across a real process restart (AC 9, FR-9)', () => {
  it('todos written then closed survive a fresh app against the same file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tlf-durable-'));
    const databasePath = join(dir, 'todos.db');

    try {
      const firstApp = await buildServer({ databasePath, logger: false });
      await firstApp.ready();
      firstApp.diContainer.cradle.todoRepository.insertTodo({
        id: 'durable',
        description: 'Survives restart',
      });
      // close → awilix dispose → db.close() → WAL checkpoint; the handle is
      // closed so the next read cannot be served from an in-process cache.
      await firstApp.close();

      const secondApp = await buildServer({ databasePath, logger: false });
      await secondApp.ready();
      const res = await secondApp.inject({ method: 'GET', url: '/todos' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([
        expect.objectContaining({
          id: 'durable',
          description: 'Survives restart',
          completed: false,
        }),
      ]);

      await secondApp.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('OpenAPI document (AC 10)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('exposes GET /todos with Todo[] + ErrorEnvelope and registers them as components', () => {
    const doc = (ctx.app as unknown as { swagger: () => Record<string, unknown> }).swagger();
    const paths = doc.paths as Record<string, unknown>;
    const components = doc.components as { schemas?: Record<string, unknown> };

    expect(paths['/todos']).toBeDefined();
    expect(JSON.stringify(paths['/todos'])).toContain('Todo');
    expect(JSON.stringify(paths['/todos'])).toContain('ErrorEnvelope');
    expect(components.schemas?.Todo).toBeDefined();
    expect(components.schemas?.ErrorEnvelope).toBeDefined();
  });
});

describe('uniform error envelope on non-2xx (AC 11)', () => {
  it('maps unknown routes (404) and thrown errors (500) to { error: { code, message } }', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tlf-error-'));
    const databasePath = join(dir, 'todos.db');
    const app = await buildServer({ databasePath, logger: false });

    try {
      app.get('/__force_500', async () => {
        throw new Error('forced failure');
      });
      await app.ready();

      const notFound = await app.inject({ method: 'GET', url: '/unknown-route' });
      expect(notFound.statusCode).toBe(404);
      expect(notFound.json()).toEqual({
        error: { code: 'NOT_FOUND', message: expect.any(String) },
      });

      const serverError = await app.inject({ method: 'GET', url: '/__force_500' });
      expect(serverError.statusCode).toBe(500);
      expect(serverError.json()).toEqual({
        error: { code: 'INTERNAL_SERVER_ERROR', message: expect.any(String) },
      });
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('coerces an out-of-range error.statusCode to a 500 envelope, not a bogus status', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tlf-error-'));
    const databasePath = join(dir, 'todos.db');
    const app = await buildServer({ databasePath, logger: false });

    try {
      app.get('/__bad_status', async () => {
        // An error carrying a non-error HTTP status (e.g. a buggy 3rd-party
        // throw). The handler must not echo it back as the response status.
        const err = new Error('weird status') as Error & { statusCode: number };
        err.statusCode = 200;
        throw err;
      });
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/__bad_status' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        error: { code: 'INTERNAL_SERVER_ERROR', message: expect.any(String) },
      });
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
