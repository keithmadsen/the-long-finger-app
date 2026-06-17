import type { Database } from 'better-sqlite3';

// `db/` is the documented migration extension point (AR-3). There is no
// migration tool in v1; this conditional reset is the stand-in.

const CREATE_TODOS_TABLE = `
  CREATE TABLE IF NOT EXISTS todos (
    id          TEXT PRIMARY KEY,
    description TEXT    NOT NULL,
    completed   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  )
`;

// Creates the real `todos` table, handling the id-only → full-table transition
// left by the Story 1.1 walking skeleton.
//
// SQLite will NOT add the new columns through `CREATE TABLE IF NOT EXISTS`, so
// any DB file created by 1.1 (including a developer's local *.db) still has the
// obsolete id-only table. We probe first:
//   - no table              → create the full table.
//   - has `description`     → already the full table; CREATE IF NOT EXISTS no-op.
//   - exactly id-only       → DROP then create (safe: the skeleton never held
//                             real data).
//   - any other shape       → throw, rather than run against an unknown schema.
//
// The drop is conditional ON PURPOSE: the AC 9 durability test writes rows then
// reopens the same file, so an unconditional drop on startup would wipe them.
export function applySchema(db: Database): void {
  const columns = db.prepare('PRAGMA table_info(todos)').all() as Array<{ name: string }>;

  if (columns.length > 0) {
    const columnNames = columns.map((column) => column.name);
    const hasDescription = columnNames.includes('description');

    if (!hasDescription) {
      const isObsoleteSkeleton = columnNames.length === 1 && columnNames[0] === 'id';
      if (!isObsoleteSkeleton) {
        throw new Error(
          `Refusing to start: existing 'todos' table has an unexpected schema [${columnNames.join(
            ', ',
          )}]. Expected the full table or the obsolete id-only skeleton.`,
        );
      }
      // Obsolete id-only skeleton from Story 1.1 — safe to drop and recreate.
      db.exec('DROP TABLE todos');
    }
  }

  db.exec(CREATE_TODOS_TABLE);
}
