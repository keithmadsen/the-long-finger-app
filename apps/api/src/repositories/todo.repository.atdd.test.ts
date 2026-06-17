import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import { databaseConnection } from '../db/connection.js';
import { applySchema } from '../db/schema.js';
import { todoRepository } from './todo.repository.js';
import { createTodoBody } from '../../test/fixtures/todo.factory.js';
import type { Dependencies } from '../types/cradle.js';

function withTempDatabase(callback: (db: Database.Database, databasePath: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'tlf-atdd-unit-'));
  const databasePath = join(dir, 'todos.db');
  const db = new Database(databasePath);

  try {
    callback(db, databasePath);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function createFullTodosTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id          TEXT PRIMARY KEY,
      description TEXT    NOT NULL,
      completed   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    )
  `);
}

function insertRow(
  db: Database.Database,
  row: {
    id: string;
    description: string;
    completed: 0 | 1;
    created_at: string;
    updated_at: string;
  },
): void {
  db.prepare(`
    INSERT INTO todos (id, description, completed, created_at, updated_at)
    VALUES (@id, @description, @completed, @created_at, @updated_at)
  `).run(row);
}

describe('Story 1.2 ATDD repository and schema scaffolds (RED)', () => {
  test.skip('[P0][1.2-UNIT-001] contracts package exports schemas and derived runtime symbols', async () => {
    const contracts = (await import('@tlf/contracts')) as Record<string, unknown>;

    expect(contracts.todoSchema).toEqual(expect.objectContaining({ $id: 'Todo' }));
    expect(contracts.createTodoBody).toEqual(expect.objectContaining({ type: 'object' }));
    expect(contracts.patchTodoBody).toEqual(expect.objectContaining({ type: 'object' }));
    expect(contracts.errorEnvelope).toEqual(expect.objectContaining({ $id: 'ErrorEnvelope' }));
  });

  test.skip('[P0][1.2-UNIT-002] applySchema creates and preserves the full todos table', () => {
    withTempDatabase((db) => {
      applySchema(db);
      applySchema(db);

      const columns = db.prepare('PRAGMA table_info(todos)').all() as Array<{ name: string }>;

      expect(columns.map((column) => column.name)).toEqual([
        'id',
        'description',
        'completed',
        'created_at',
        'updated_at',
      ]);
    });
  });

  test.skip('[P0][1.2-UNIT-003] applySchema migrates only the obsolete id-only skeleton table', () => {
    withTempDatabase((db) => {
      db.exec('CREATE TABLE todos (id TEXT PRIMARY KEY)');

      applySchema(db);

      const columns = db.prepare('PRAGMA table_info(todos)').all() as Array<{ name: string }>;
      expect(columns.map((column) => column.name)).toContain('description');
    });
  });

  test.skip('[P0][1.2-UNIT-004] databaseConnection applies WAL and required pragmas', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tlf-atdd-pragmas-'));
    const databasePath = join(dir, 'todos.db');

    try {
      const db = databaseConnection({ databasePath });

      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.pragma('synchronous', { simple: true })).toBe(1);
      expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);

      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.skip('[P0][1.2-UNIT-005] listTodos returns canonical order', () => {
    withTempDatabase((db) => {
      createFullTodosTable(db);
      insertRow(db, {
        id: 'completed-newer',
        description: 'Completed newer',
        completed: 1,
        created_at: '2026-06-17T09:00:00.000Z',
        updated_at: '2026-06-17T12:00:00.000Z',
      });
      insertRow(db, {
        id: 'active-older',
        description: 'Active older',
        completed: 0,
        created_at: '2026-06-17T09:00:00.000Z',
        updated_at: '2026-06-17T10:00:00.000Z',
      });
      insertRow(db, {
        id: 'active-newer',
        description: 'Active newer',
        completed: 0,
        created_at: '2026-06-17T09:00:00.000Z',
        updated_at: '2026-06-17T11:00:00.000Z',
      });

      const repo = todoRepository({ db } as Dependencies);

      expect(repo.listTodos().map((todo) => (todo as { id: string }).id)).toEqual([
        'active-newer',
        'active-older',
        'completed-newer',
      ]);
    });
  });

  test.skip('[P0][1.2-UNIT-006] mapper returns exact camelCase Todo shape', () => {
    withTempDatabase((db) => {
      createFullTodosTable(db);
      insertRow(db, {
        id: 'mapped',
        description: 'Mapped row',
        completed: 1,
        created_at: '2026-06-17T09:00:00.000Z',
        updated_at: '2026-06-17T10:00:00.000Z',
      });

      const repo = todoRepository({ db } as Dependencies);

      expect(repo.listTodos()[0]).toEqual({
        id: 'mapped',
        description: 'Mapped row',
        completed: true,
        createdAt: '2026-06-17T09:00:00.000Z',
        updatedAt: '2026-06-17T10:00:00.000Z',
      });
      expect(Object.keys(repo.listTodos()[0] as Record<string, unknown>)).not.toContain('created_at');
      expect(Object.keys(repo.listTodos()[0] as Record<string, unknown>)).not.toContain('updated_at');
    });
  });

  test.skip('[P0][1.2-UNIT-007] insertTodo stamps server timestamps and starts incomplete', () => {
    withTempDatabase((db) => {
      createFullTodosTable(db);
      const repo = todoRepository({ db } as Dependencies) as ReturnType<typeof todoRepository> & {
        insertTodo: (input: ReturnType<typeof createTodoBody>) => unknown;
      };

      const todo = repo.insertTodo(createTodoBody({ id: 'inserted', description: 'Server stamped' }));

      expect(todo).toEqual({
        id: 'inserted',
        description: 'Server stamped',
        completed: false,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect((todo as { createdAt: string; updatedAt: string }).createdAt).toBe(
        (todo as { createdAt: string; updatedAt: string }).updatedAt,
      );
    });
  });

  test.skip('[P0][1.2-UNIT-008] duplicate insert is idempotent on id', () => {
    withTempDatabase((db) => {
      createFullTodosTable(db);
      const repo = todoRepository({ db } as Dependencies) as ReturnType<typeof todoRepository> & {
        insertTodo: (input: ReturnType<typeof createTodoBody>) => unknown;
      };

      const first = repo.insertTodo(createTodoBody({ id: 'same-id', description: 'Original' }));
      const second = repo.insertTodo(createTodoBody({ id: 'same-id', description: 'Retry ignored' }));
      const count = db.prepare('SELECT COUNT(*) as count FROM todos WHERE id = ?').get('same-id') as {
        count: number;
      };

      expect(second).toEqual(first);
      expect(count.count).toBe(1);
    });
  });
});
