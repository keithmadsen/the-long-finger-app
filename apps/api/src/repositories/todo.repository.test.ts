import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { todoRepository } from './todo.repository.js';
import type { Dependencies } from '../types/cradle.js';

describe('todoRepository', () => {
  it('listTodos() returns [] for an empty table', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY)');

    const repo = todoRepository({ db } as Dependencies);

    expect(repo.listTodos()).toEqual([]);
    db.close();
  });
});
