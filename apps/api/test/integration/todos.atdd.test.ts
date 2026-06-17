import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildServer } from '../../src/server.js';
import { buildTestApp } from './helpers/build-test-app.js';
import { createTodoBody } from '../fixtures/todo.factory.js';

describe('Story 1.2 ATDD API and contract scaffolds (RED)', () => {
  test.skip('[P0][1.2-INT-001] GET /todos returns bare canonical camelCase Todo[]', async () => {
    const ctx = await buildTestApp();

    try {
      const repo = ctx.app.diContainer.cradle.todoRepository as typeof ctx.app.diContainer.cradle.todoRepository & {
        insertTodo: (input: ReturnType<typeof createTodoBody>) => unknown;
      };

      repo.insertTodo(createTodoBody({ id: 'active-older', description: 'Active older' }));
      repo.insertTodo(createTodoBody({ id: 'active-newer', description: 'Active newer' }));

      const res = await ctx.app.inject({ method: 'GET', url: '/todos' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([
        {
          id: 'active-newer',
          description: 'Active newer',
          completed: false,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
        {
          id: 'active-older',
          description: 'Active older',
          completed: false,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      ]);
      expect(res.json()).not.toHaveProperty('data');
    } finally {
      await ctx.cleanup();
    }
  });

  test.skip('[P0][1.2-INT-002] app uses injected temp-file database path', async () => {
    const ctx = await buildTestApp();

    try {
      expect(ctx.databasePath).not.toBe(':memory:');
      expect(ctx.databasePath.endsWith('.db')).toBe(true);
      expect(existsSync(ctx.databasePath)).toBe(true);
    } finally {
      await ctx.cleanup();
    }
  });

  test.skip('[P0][1.2-INT-003] todos persist after app close and rebuild against same file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tlf-atdd-durable-'));
    const databasePath = join(dir, 'todos.db');

    try {
      const firstApp = await buildServer({ databasePath, logger: false });
      await firstApp.ready();
      const repo = firstApp.diContainer.cradle.todoRepository as typeof firstApp.diContainer.cradle.todoRepository & {
        insertTodo: (input: ReturnType<typeof createTodoBody>) => unknown;
      };

      repo.insertTodo(createTodoBody({ id: 'durable', description: 'Survives restart' }));
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

  test.skip('[P1][1.2-INT-004] OpenAPI document exposes GET /todos Todo[] response and error envelope', async () => {
    const ctx = await buildTestApp();

    try {
      const doc = (ctx.app as unknown as { swagger: () => Record<string, unknown> }).swagger();
      const paths = doc.paths as Record<string, unknown>;
      const components = doc.components as { schemas?: Record<string, unknown> };

      expect(paths['/todos']).toBeDefined();
      expect(JSON.stringify(paths['/todos'])).toContain('Todo');
      expect(JSON.stringify(paths['/todos'])).toContain('ErrorEnvelope');
      expect(components.schemas?.Todo).toBeDefined();
      expect(components.schemas?.ErrorEnvelope).toBeDefined();
    } finally {
      await ctx.cleanup();
    }
  });

  test.skip('[P1][1.2-INT-005] non-2xx responses use the uniform error envelope', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tlf-atdd-error-'));
    const databasePath = join(dir, 'todos.db');
    const app = await buildServer({ databasePath, logger: false });

    try {
      app.get('/__atdd_force_500', async () => {
        throw new Error('forced ATDD failure');
      });
      await app.ready();

      const notFound = await app.inject({ method: 'GET', url: '/unknown-route' });
      expect(notFound.statusCode).toBe(404);
      expect(notFound.json()).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: expect.any(String),
        },
      });

      const serverError = await app.inject({ method: 'GET', url: '/__atdd_force_500' });
      expect(serverError.statusCode).toBe(500);
      expect(serverError.json()).toEqual({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: expect.any(String),
        },
      });
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
