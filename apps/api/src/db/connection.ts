import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { applySchema } from './schema.js';

// Opens a real on-disk SQLite connection at the injected `databasePath`.
//
// The path is a cradle dependency (registered as a value in plugins/awilix.ts),
// so a test can point this at a temp-dir file WITHOUT swapping the repository
// implementation (AC 7). Minimal for the skeleton — WAL and the full pragma set
// are refined in Story 1.2.
export function databaseConnection({ databasePath }: { databasePath: string }): Database.Database {
  // SQLite will not create missing parent directories; ensure they exist.
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  applySchema(db);
  return db;
}
