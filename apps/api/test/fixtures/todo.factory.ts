import type Database from 'better-sqlite3';

/** Raw snake_case shape of a `todos` row as stored by SQLite. */
export interface TodoRow {
  id: string;
  description: string;
  completed: 0 | 1;
  created_at: string;
  updated_at: string;
}

/**
 * Seed a row directly into the todos table, bypassing the repository, so tests
 * control the timestamps exactly (server-stamped inserts could collide on ms
 * and break canonical-order assertions). Returns the row as written.
 */
export function seedTodoRow(
  db: Database.Database,
  overrides: Partial<TodoRow> = {},
): TodoRow {
  const row: TodoRow = {
    id: 'todo-001',
    description: 'Write an acceptance test',
    completed: 0,
    created_at: '2026-06-17T09:00:00.000Z',
    updated_at: '2026-06-17T09:00:00.000Z',
    ...overrides,
  };

  db.prepare(
    `INSERT INTO todos (id, description, completed, created_at, updated_at)
     VALUES (@id, @description, @completed, @created_at, @updated_at)`,
  ).run(row);

  return row;
}
