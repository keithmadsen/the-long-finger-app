import type { CreateTodoBody, PatchTodoBody, Todo } from '@tlf/contracts';
import type { Dependencies } from '../types/cradle.js';

// The raw on-disk row shape. snake_case and `completed` as 0/1 live ONLY here.
interface TodoRow {
  id: string;
  description: string;
  completed: number;
  created_at: string;
  updated_at: string;
}

// The repository is the ONLY module that imports better-sqlite3 knowledge or
// knows snake_case (clean-architecture: data access only). Factory named for
// what it produces — no `create` prefix.
export function todoRepository({ db }: Dependencies) {
  // Canonical order authority (AC 3): incomplete first, newest-updated first.
  // The frontend render and any domain helper are derivative and must not re-sort.
  const listStatement = db.prepare(
    'SELECT * FROM todos ORDER BY completed ASC, updated_at DESC',
  );
  const insertStatement = db.prepare(
    `INSERT INTO todos (id, description, completed, created_at, updated_at)
     VALUES (@id, @description, 0, @created_at, @updated_at)
     ON CONFLICT(id) DO NOTHING`,
  );
  const findByIdStatement = db.prepare('SELECT * FROM todos WHERE id = ?');
  const updateStatement = db.prepare(
    'UPDATE todos SET completed = @completed, updated_at = @updated_at WHERE id = @id',
  );

  // The SINGLE place casing crosses over and `completed` is coerced to boolean
  // (AC 4). No mapping logic exists anywhere else in the codebase.
  function toDomain(row: TodoRow): Todo {
    return {
      id: row.id,
      description: row.description,
      completed: !!row.completed,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function listTodos(): Todo[] {
    return (listStatement.all() as TodoRow[]).map(toDomain);
  }

  // Server stamps both timestamps to the same value; `completed` starts 0.
  // Any client-supplied timestamp is impossible to leak — CreateTodoBody is
  // exactly { id, description } (AC 7). Idempotent on `id`: a duplicate insert
  // is a no-op and returns the EXISTING row, no second row, no throw.
  //
  // Returns `created` so the route can map new vs. existing → 201 vs. 200
  // (Story 1.7 AC 11). `INSERT … ON CONFLICT(id) DO NOTHING` reports
  // `changes === 0` when the id already existed; that is the sole signal —
  // the SQL itself is unchanged (still a no-op on conflict, never an overwrite).
  function insertTodo(input: CreateTodoBody): { todo: Todo; created: boolean } {
    const now = new Date().toISOString();
    const result = insertStatement.run({
      id: input.id,
      description: input.description,
      created_at: now,
      updated_at: now,
    });
    const row = findByIdStatement.get(input.id) as TodoRow;
    return { todo: toDomain(row), created: result.changes > 0 };
  }

  // Toggle completion (Story 1.8 AC 7, 9). The server stamps `updated_at` to the
  // write time — NEVER trusting a client timestamp — so the next fresh GET
  // re-sorts the toggled item into canonical order (completed ASC, updated_at
  // DESC). `created_at` is deliberately untouched. `completed` boolean is coerced
  // to the row's 0/1 here (the toDomain mapper coerces back on read).
  //
  // A missing id is NOT a throw: `result.changes === 0` → return null, which the
  // route maps to the domain 404. This keeps the repository free of transport
  // concerns (clean-architecture: the 404 envelope is the handler's decision).
  function updateTodo(id: string, input: PatchTodoBody): Todo | null {
    const result = updateStatement.run({
      id,
      completed: input.completed ? 1 : 0,
      updated_at: new Date().toISOString(),
    });
    if (result.changes === 0) {
      return null;
    }
    const row = findByIdStatement.get(id) as TodoRow;
    return toDomain(row);
  }

  return { listTodos, insertTodo, updateTodo };
}
