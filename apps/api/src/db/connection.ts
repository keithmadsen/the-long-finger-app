import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { applySchema } from './schema.js';

// Opens a real on-disk SQLite connection at the injected `databasePath`.
//
// The path is a cradle dependency (registered as a value in plugins/awilix.ts),
// so a test can point this at a temp-dir file WITHOUT swapping the repository
// implementation (AC 6).
export function databaseConnection({ databasePath }: { databasePath: string }): Database.Database {
  // SQLite will not create missing parent directories; ensure they exist.
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);

  // Pragmas BEFORE applySchema so WAL/integrity are in effect from first write.
  // journal_mode is persisted in the DB file; the rest are per-connection.
  db.pragma('journal_mode = WAL'); // concurrent reads during a write
  db.pragma('synchronous = NORMAL'); // corruption-safe under WAL, faster than FULL
  db.pragma('busy_timeout = 5000'); // wait out transient locks instead of erroring
  db.pragma('foreign_keys = ON'); // integrity baseline (off by default)

  applySchema(db);
  return db;
}
