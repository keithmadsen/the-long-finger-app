import type { Database } from 'better-sqlite3';
import type { todoRepository } from '../repositories/todo.repository.js';

// The Awilix Cradle: the set of dependencies resolvable from the container.
// Factory functions take `Dependencies` and pull what they need by name.
export interface Dependencies {
  /** Injectable on-disk SQLite file path (AC 7). */
  databasePath: string;
  /** Open better-sqlite3 connection. */
  db: Database;
  /** Data-access boundary for the `todos` table. */
  todoRepository: ReturnType<typeof todoRepository>;
}

// Make `app.diContainer.cradle` / `request.diScope.cradle` strongly typed.
declare module '@fastify/awilix' {
  interface Cradle extends Dependencies {}
}
