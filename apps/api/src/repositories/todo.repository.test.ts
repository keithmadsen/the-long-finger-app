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
    expect(createTodoBody).toEqual(
      expect.objectContaining({ $id: 'CreateTodoBody', type: 'object' }),
    );
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

  it('insertTodo() stamps equal server timestamps, starts incomplete, reports created (AC 7; 1.7 AC 11)', () => {
    const { db, repo } = repoWithMemoryDb();
    const input: CreateTodoBody = { id: 'inserted', description: 'Server stamped' };

    const { todo, created } = repo.insertTodo(input);

    expect(created).toBe(true);
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

  it('insertTodo() is idempotent on id — duplicate returns existing row with created:false (AC 8; 1.7 AC 11)', () => {
    const { db, repo } = repoWithMemoryDb();

    const first = repo.insertTodo({ id: 'same-id', description: 'Original' });
    const second = repo.insertTodo({ id: 'same-id', description: 'Retry ignored' });
    const count = db.prepare('SELECT COUNT(*) as count FROM todos WHERE id = ?').get('same-id') as {
      count: number;
    };

    // First insert created the row; the duplicate is a no-op (created:false)
    // and returns the EXISTING row verbatim — the original description, not the
    // retry's. This created-vs-existing signal is what the route maps to 201/200.
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.todo).toEqual(first.todo);
    expect(second.todo.description).toBe('Original');
    expect(count.count).toBe(1);
    db.close();
  });

  it('updateTodo() flips completed, advances updated_at, leaves created_at, returns the mapped Todo (1.8 AC 7)', () => {
    const { db, repo } = repoWithMemoryDb();
    seed(db, {
      id: 'toggle-me',
      description: 'Toggle me',
      completed: 0,
      created_at: '2020-01-01T09:00:00.000Z',
      updated_at: '2020-01-01T09:00:00.000Z',
    });

    const updated = repo.updateTodo('toggle-me', { completed: true });

    expect(updated).toEqual({
      id: 'toggle-me',
      description: 'Toggle me',
      completed: true,
      createdAt: '2020-01-01T09:00:00.000Z',
      updatedAt: expect.any(String),
    });
    // created_at is untouched; updated_at advances past the seeded value.
    expect(updated!.createdAt).toBe('2020-01-01T09:00:00.000Z');
    expect(updated!.updatedAt > '2020-01-01T09:00:00.000Z').toBe(true);
    db.close();
  });

  it('updateTodo() can uncomplete (true → false) round-trips boolean ↔ 0/1', () => {
    const { db, repo } = repoWithMemoryDb();
    seed(db, {
      id: 'done',
      description: 'Already done',
      completed: 1,
      created_at: '2026-06-25T09:00:00.000Z',
      updated_at: '2026-06-25T09:30:00.000Z',
    });

    const reactivated = repo.updateTodo('done', { completed: false });
    expect(reactivated?.completed).toBe(false);
    db.close();
  });

  it('updateTodo() returns null for a missing id (no throw — the route maps it to 404)', () => {
    const { db, repo } = repoWithMemoryDb();
    expect(repo.updateTodo('does-not-exist', { completed: true })).toBeNull();
    db.close();
  });

  it('deleteTodo() removes an existing row, returns true, and drops it from listTodos() (2.1 AC 1, 5)', () => {
    const { db, repo } = repoWithMemoryDb();
    seed(db, {
      id: 'to-delete',
      description: 'Delete me',
      completed: 0,
      created_at: '2026-06-30T09:00:00.000Z',
      updated_at: '2026-06-30T09:00:00.000Z',
    });

    const removed = repo.deleteTodo('to-delete');

    expect(removed).toBe(true);
    expect(repo.listTodos().map((todo) => todo.id)).not.toContain('to-delete');
    db.close();
  });

  it('deleteTodo() on a missing id is a no-op returning false (no throw — the route maps it to 204) (2.1 AC 2, 5)', () => {
    const { db, repo } = repoWithMemoryDb();
    expect(repo.deleteTodo('does-not-exist')).toBe(false);
    db.close();
  });
});
