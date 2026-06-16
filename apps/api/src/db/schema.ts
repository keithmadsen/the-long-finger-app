import type { Database } from 'better-sqlite3';

// Walking-skeleton schema: the minimal table the skeleton SELECT needs.
//
// Story 1.2 owns the real `todos` schema (description, completed, created_at,
// updated_at) plus WAL and the full pragma set. Because that story also uses
// `CREATE TABLE IF NOT EXISTS`, expanding the column set there is additive —
// no migration, no rewrite. Do NOT add feature columns here.
export function applySchema(db: Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY)');
}
