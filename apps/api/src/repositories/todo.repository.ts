import type { Dependencies } from '../types/cradle.js';

// The repository is the ONLY module that imports better-sqlite3 knowledge or
// knows snake_case (clean-architecture: data access only).
//
// Factory named for what it produces — no `create` prefix.
//
// Skeleton scope: `listTodos()` runs a raw SELECT and returns the rows (empty
// against a fresh DB). The snake↔camel mapper and the canonical-order query
// (`completed ASC, updated_at DESC`) are Story 1.2's job.
export function todoRepository({ db }: Dependencies) {
  const listStatement = db.prepare('SELECT * FROM todos');

  function listTodos(): unknown[] {
    return listStatement.all();
  }

  return { listTodos };
}
