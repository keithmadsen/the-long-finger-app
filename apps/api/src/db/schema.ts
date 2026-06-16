import type { Database } from 'better-sqlite3';

// Walking-skeleton schema: the minimal table the skeleton SELECT needs.
//
// Story 1.2 owns the real `todos` schema (description, completed, created_at,
// updated_at) plus WAL and the full pragma set. That story must handle the
// transition from this id-only skeleton table explicitly; SQLite will not add
// missing columns when a later `CREATE TABLE IF NOT EXISTS` statement runs.
// Do NOT add feature columns here.
export function applySchema(db: Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY)');
}
