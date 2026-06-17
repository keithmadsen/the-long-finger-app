import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { todoSchema, createTodoBody, patchTodoBody, errorEnvelope } from '@tlf/contracts';
import type { CreateTodoBody } from '@tlf/contracts';
import { applySchema } from '../db/schema.js';
import { todoRepository } from './todo.repository.js';
import type { Dependencies } from '../types/cradle.js';

function repoWithMemoryDb() {
  const db = new Database(':memory:');
  applySchema(db);
  return { db, repo: todoRepository({ db } as Dependencies) };
}

function seed(
  db: Database.Database,
  row: { id: string; description: string; completed: 0 | 1; created_at: string; updated_at: string },
): void {
  db.prepare(
    `INSERT INTO todos (id, description, completed, created_at, updated_at)
     VALUES (@id, @description, @completed, @created_at, @updated_at)`,
  ).run(row);
}

describe('@tlf/contracts surface (AC 1)', () => {
  it('exports the TypeBox schemas, with stable $id components and derived types', () => {
    expect(todoSchema).toEqual(expect.objectContaining({ $id: 'Todo', type: 'object' }));
    expect(createTodoBody).toEqual(expect.objectContaining({ type: 'object' }));
    expect(patchTodoBody).toEqual(expect.objectContaining({ type: 'object' }));
    expect(errorEnvelope).toEqual(expect.objectContaining({ $id: 'ErrorEnvelope', type: 'object' }));
  });
});

describe('todoRepository', () => {
  it('listTodos() returns [] for an empty table', () => {
    const { db, repo } = repoWithMemoryDb();
    expect(repo.listTodos()).toEqual([]);
    db.close();
  });

  it('listTodos() returns canonical order: completed ASC, updated_at DESC (AC 3)', () => {
    const { db, repo } = repoWithMemoryDb();
    seed(db, {
      id: 'completed-newer',
      description: 'Completed newer',
      completed: 1,
      created_at: '2026-06-17T09:00:00.000Z',
      updated_at: '2026-06-17T12:00:00.000Z',
    });
    seed(db, {
      id: 'active-older',
      description: 'Active older',
      completed: 0,
      created_at: '2026-06-17T09:00:00.000Z',
      updated_at: '2026-06-17T10:00:00.000Z',
    });
    seed(db, {
      id: 'active-newer',
      description: 'Active newer',
      completed: 0,
      created_at: '2026-06-17T09:00:00.000Z',
      updated_at: '2026-06-17T11:00:00.000Z',
    });

    expect(repo.listTodos().map((todo) => todo.id)).toEqual([
      'active-newer',
      'active-older',
      'completed-newer',
    ]);
    db.close();
  });

  it('maps rows to the exact camelCase Todo shape with boolean completed (AC 4)', () => {
    const { db, repo } = repoWithMemoryDb();
    seed(db, {
      id: 'mapped',
      description: 'Mapped row',
      completed: 1,
      created_at: '2026-06-17T09:00:00.000Z',
      updated_at: '2026-06-17T10:00:00.000Z',
    });

    const todo = repo.listTodos()[0];
    expect(todo).toEqual({
      id: 'mapped',
      description: 'Mapped row',
      completed: true,
      createdAt: '2026-06-17T09:00:00.000Z',
      updatedAt: '2026-06-17T10:00:00.000Z',
    });
    expect(Object.keys(todo!)).not.toContain('created_at');
    expect(Object.keys(todo!)).not.toContain('updated_at');
    db.close();
  });

  it('insertTodo() stamps equal server timestamps and starts incomplete (AC 7)', () => {
    const { db, repo } = repoWithMemoryDb();
    const input: CreateTodoBody = { id: 'inserted', description: 'Server stamped' };

    const todo = repo.insertTodo(input);

    expect(todo).toEqual({
      id: 'inserted',
      description: 'Server stamped',
      completed: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(todo.createdAt).toBe(todo.updatedAt);
    db.close();
  });

  it('insertTodo() is idempotent on id — duplicate returns the existing row (AC 8)', () => {
    const { db, repo } = repoWithMemoryDb();

    const first = repo.insertTodo({ id: 'same-id', description: 'Original' });
    const second = repo.insertTodo({ id: 'same-id', description: 'Retry ignored' });
    const count = db.prepare('SELECT COUNT(*) as count FROM todos WHERE id = ?').get('same-id') as {
      count: number;
    };

    expect(second).toEqual(first);
    expect(count.count).toBe(1);
    db.close();
  });
});
