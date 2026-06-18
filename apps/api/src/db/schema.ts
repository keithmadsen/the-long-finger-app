import type { Database } from 'better-sqlite3';

// `db/` is the documented migration extension point (AR-3). There is no
// migration tool in v1; this conditional reset is the stand-in.

type TableColumn = {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

const TODOS_COLUMNS: TableColumn[] = [
  { name: 'id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
  { name: 'description', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { name: 'completed', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
  { name: 'created_at', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { name: 'updated_at', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
];

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
// obsolete id-only table. We probe first and match the EXACT shape:
//   - no table              → create the full table.
//   - exactly the full shape → already correct; CREATE IF NOT EXISTS no-op.
//   - exactly id-only        → DROP then create (safe: the skeleton never held
//                             real data).
//   - any other shape       → throw, rather than run against an unknown schema.
//
// Matching the full column definitions (not merely the presence of the expected
// names) is deliberate: a table with the right names but wrong constraints would
// otherwise slip through as a no-op and leave a broken schema. The drop is
// conditional ON PURPOSE: the AC 9 durability test writes rows then reopens the
// same file, so an unconditional drop would wipe them.
export function applySchema(db: Database): void {
  const columns = db.prepare('PRAGMA table_info(todos)').all() as TableColumn[];

  if (columns.length > 0) {
    const columnNames = columns.map((column) => column.name);
    const isFullTable = matchesExpectedTodosShape(columns);

    if (!isFullTable) {
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

function matchesExpectedTodosShape(columns: TableColumn[]): boolean {
  if (columns.length !== TODOS_COLUMNS.length) {
    return false;
  }

  return TODOS_COLUMNS.every((expected) => {
    const actual = columns.find((column) => column.name === expected.name);
    return (
      actual !== undefined &&
      actual.type.toUpperCase() === expected.type &&
      actual.notnull === expected.notnull &&
      actual.dflt_value === expected.dflt_value &&
      actual.pk === expected.pk
    );
  });
}
