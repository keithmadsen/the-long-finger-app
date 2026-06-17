import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseConnection } from './connection.js';

// WAL must be asserted against a real on-disk file: an in-memory database
// reports journal_mode 'memory', not 'wal'.
describe('databaseConnection pragmas (AC 2)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tlf-conn-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies WAL and the required pragma set', () => {
    const db = databaseConnection({ databasePath: join(dir, 'todos.db') });

    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('synchronous', { simple: true })).toBe(1); // NORMAL
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1); // ON

    db.close();
  });
});
