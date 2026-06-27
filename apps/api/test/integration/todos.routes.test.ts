import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

describe('POST /todos create path (201 new / 200 existing) (Story 1.7 AC 2, 11)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  // Two valid UUIDv7 ids (version nibble = 7, variant nibble ∈ 8/9/a/b).
  const ID_A = '0190ff8c-3e5a-7c1d-8b2e-1a2b3c4d5e6f';
  const ID_B = '0190ff8c-3e5a-7c1d-8b2e-1a2b3c4d5e70';

  it('201 creates a Todo (camelCase, completed:false, equal timestamps) and GET includes it (AC 2)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/todos',
      payload: { id: ID_A, description: 'Buy milk' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toEqual({
      id: ID_A,
      description: 'Buy milk',
      completed: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    // Server stamps both timestamps to the same value on create.
    expect(body.createdAt).toBe(body.updatedAt);

    const list = await ctx.app.inject({ method: 'GET', url: '/todos' });
    expect(list.json()).toContainEqual(
      expect.objectContaining({ id: ID_A, description: 'Buy milk' }),
    );
  });

  it('200 on a duplicate id returns the EXISTING Todo with no second row (idempotency, AC 11)', async () => {
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/todos',
      payload: { id: ID_B, description: 'Original description' },
    });
    expect(first.statusCode).toBe(201);

    // Re-POST the SAME id with a different description (e.g. a timeout retry).
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/todos',
      payload: { id: ID_B, description: 'Different on retry' },
    });

    // The conflict is a no-op, not an overwrite: 200 + the FIRST description.
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(
      expect.objectContaining({ id: ID_B, description: 'Original description' }),
    );

    // Exactly one row for that id.
    const list = await ctx.app.inject({ method: 'GET', url: '/todos' });
    const matches = (list.json() as { id: string }[]).filter((t) => t.id === ID_B);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual(
      expect.objectContaining({ description: 'Original description' }),
    );
  });
});

describe('POST /todos boundary validation (400 envelope) (Story 1.7 AC 2, 3, 11)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  const VALID_ID = '0190ff8c-3e5a-7c1d-8b2e-1a2b3c4d5e71';

  function expectBadRequest(res: { statusCode: number; json: () => unknown }) {
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: expect.any(String),
        details: expect.anything(),
      },
    });
  }

  it('rejects an empty description (AC 3)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/todos',
      payload: { id: VALID_ID, description: '' },
    });
    expectBadRequest(res);
  });

  it('rejects a >200-char description (AC 3)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/todos',
      payload: { id: VALID_ID, description: 'x'.repeat(201) },
    });
    expectBadRequest(res);
  });

  it('rejects a missing id (AC 2)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/todos',
      payload: { description: 'No id supplied' },
    });
    expectBadRequest(res);
  });

  it('rejects a malformed (non-UUIDv7) id (AC 2)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/todos',
      // A v4 uuid: version nibble is 4, not 7 — must be rejected by the pattern.
      payload: { id: '11111111-1111-4111-8111-111111111111', description: 'Bad id' },
    });
    expectBadRequest(res);
  });
});

describe('POST /todos concurrent submits (AC 10)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('all distinct-id submits fired together succeed and all persist (AC 10)', async () => {
    // Distinct valid UUIDv7 ids; the synchronous better-sqlite3 backend
    // serializes the writes — this asserts correctness/independence, NOT
    // parallel execution.
    const ids = [
      '0190ff8c-3e5a-7c1d-8b2e-1a2b3c4d5e81',
      '0190ff8c-3e5a-7c1d-8b2e-1a2b3c4d5e82',
      '0190ff8c-3e5a-7c1d-8b2e-1a2b3c4d5e83',
      '0190ff8c-3e5a-7c1d-8b2e-1a2b3c4d5e84',
      '0190ff8c-3e5a-7c1d-8b2e-1a2b3c4d5e85',
    ];

    const results = await Promise.all(
      ids.map((id, i) =>
        ctx.app.inject({
          method: 'POST',
          url: '/todos',
          payload: { id, description: `Concurrent ${i}` },
        }),
      ),
    );

    for (const res of results) {
      expect(res.statusCode).toBe(201);
    }

    const list = await ctx.app.inject({ method: 'GET', url: '/todos' });
    const persistedIds = (list.json() as { id: string }[]).map((t) => t.id);
    for (const id of ids) {
      expect(persistedIds).toContain(id);
    }
  });
});

describe('PATCH /todos/:id toggle path (Story 1.8 AC 1, 7, 9)', () => {
  let ctx: TestApp;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // Seed one active + one completed row with controlled timestamps so the
  // canonical-order and updated_at assertions are deterministic.
  function seed() {
    const { db } = ctx.app.diContainer.cradle;
    const insert = db.prepare(
      `INSERT INTO todos (id, description, completed, created_at, updated_at)
       VALUES (@id, @description, @completed, @created_at, @updated_at)`,
    );
    insert.run({
      id: 'active-1',
      description: 'Active one',
      completed: 0,
      created_at: '2020-01-01T09:00:00.000Z',
      updated_at: '2020-01-01T09:00:00.000Z',
    });
    insert.run({
      id: 'active-2',
      description: 'Active two',
      completed: 0,
      created_at: '2026-06-25T08:00:00.000Z',
      updated_at: '2026-06-25T08:00:00.000Z',
    });
  }

  it('200 toggles completed:true, stamps a fresh updated_at, leaves created_at (AC 7, 9)', async () => {
    seed();

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/todos/active-1',
      payload: { completed: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      id: 'active-1',
      description: 'Active one',
      completed: true,
      createdAt: '2020-01-01T09:00:00.000Z',
      updatedAt: expect.any(String),
    });
    // The Todo is returned directly — no success envelope (AC 9).
    expect(body).not.toHaveProperty('data');
    // Server advanced updated_at past the seeded value; created_at unchanged.
    expect(body.updatedAt > '2020-01-01T09:00:00.000Z').toBe(true);
    expect(body.createdAt).toBe('2020-01-01T09:00:00.000Z');
  });

  it('a completed row re-sorts below actives on the NEXT fresh GET (canonical order, AC 7)', async () => {
    seed();

    await ctx.app.inject({
      method: 'PATCH',
      url: '/todos/active-1',
      payload: { completed: true },
    });

    const list = await ctx.app.inject({ method: 'GET', url: '/todos' });
    const ids = (list.json() as { id: string }[]).map((t) => t.id);
    // active-2 (still active) sinks above the just-completed active-1.
    expect(ids).toEqual(['active-2', 'active-1']);
  });

  it('404 NOT_FOUND envelope when the id does not exist (domain decision, AC 9)', async () => {
    seed();

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/todos/missing-id',
      payload: { completed: true },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });

  it('400 BAD_REQUEST envelope on an extra/unknown body field (closed object, AC 9)', async () => {
    seed();

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/todos/active-1',
      payload: { completed: true, sneaky: 'extra' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: expect.any(String),
        details: expect.anything(),
      },
    });
  });

  it('400 BAD_REQUEST envelope on a malformed body (wrong type) (AC 9)', async () => {
    seed();

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/todos/active-1',
      payload: { completed: 'yes' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: 'BAD_REQUEST' }) }),
    );
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
    const todosPath = paths['/todos'] as Record<string, unknown>;
    // Both GET and POST operations are documented (Story 1.7 adds POST).
    expect(todosPath.get).toBeDefined();
    expect(todosPath.post).toBeDefined();
    expect(JSON.stringify(paths['/todos'])).toContain('Todo');
    expect(JSON.stringify(paths['/todos'])).toContain('CreateTodoBody');
    expect(JSON.stringify(paths['/todos'])).toContain('ErrorEnvelope');
    expect(components.schemas?.Todo).toBeDefined();
    expect(components.schemas?.CreateTodoBody).toBeDefined();
    expect(components.schemas?.ErrorEnvelope).toBeDefined();
  });

  it('exposes PATCH /todos/{id} referencing PatchTodoBody and registers it as a component (Story 1.8)', () => {
    const doc = (ctx.app as unknown as { swagger: () => Record<string, unknown> }).swagger();
    const paths = doc.paths as Record<string, unknown>;
    const components = doc.components as { schemas?: Record<string, unknown> };

    const patchPath = paths['/todos/{id}'] as Record<string, unknown> | undefined;
    expect(patchPath?.patch).toBeDefined();
    expect(JSON.stringify(patchPath)).toContain('PatchTodoBody');
    expect(components.schemas?.PatchTodoBody).toBeDefined();
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

  it('preserves valid custom error.statusCode values inside the 4xx/5xx range', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tlf-error-'));
    const databasePath = join(dir, 'todos.db');
    const app = await buildServer({ databasePath, logger: false });

    try {
      app.get('/__custom_status', async () => {
        const err = new Error('custom client failure') as Error & { statusCode: number };
        err.statusCode = 418;
        throw err;
      });
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/__custom_status' });
      expect(res.statusCode).toBe(418);
      expect(res.json()).toEqual({
        error: { code: 'ERROR', message: 'custom client failure' },
      });
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
