import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applySchema } from './schema.js';

function columnNames(db: Database.Database): string[] {
  return (db.prepare('PRAGMA table_info(todos)').all() as Array<{ name: string }>).map(
    (column) => column.name,
  );
}

describe('applySchema (AC 2)', () => {
  it('creates the full todos table and is idempotent', () => {
    const db = new Database(':memory:');
    applySchema(db);
    applySchema(db);

    expect(columnNames(db)).toEqual(['id', 'description', 'completed', 'created_at', 'updated_at']);
    db.close();
  });

  it('migrates the obsolete id-only skeleton table from Story 1.1', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE todos (id TEXT PRIMARY KEY)');

    applySchema(db);

    expect(columnNames(db)).toContain('description');
    db.close();
  });

  it('throws on an unexpected partial schema rather than running blind', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE todos (id TEXT PRIMARY KEY, mystery TEXT)');

    expect(() => applySchema(db)).toThrow(/unexpected schema/i);
    db.close();
  });

  it('throws on a partial table that has `description` but is not the full shape', () => {
    const db = new Database(':memory:');
    // Has `description` but is missing completed/created_at/updated_at — a
    // `CREATE TABLE IF NOT EXISTS` would silently no-op and leave this broken.
    db.exec('CREATE TABLE todos (id TEXT PRIMARY KEY, description TEXT)');

    expect(() => applySchema(db)).toThrow(/unexpected schema/i);
    db.close();
  });

  it('never drops the full table unconditionally — existing rows survive (AC 9 guard)', () => {
    const db = new Database(':memory:');
    applySchema(db);
    db.prepare(
      `INSERT INTO todos (id, description, completed, created_at, updated_at)
       VALUES ('keep', 'Keep me', 0, '2026-06-17T09:00:00.000Z', '2026-06-17T09:00:00.000Z')`,
    ).run();

    applySchema(db); // second run must be a no-op, not a drop

    const { count } = db.prepare('SELECT COUNT(*) as count FROM todos').get() as { count: number };
    expect(count).toBe(1);
    db.close();
  });
});
