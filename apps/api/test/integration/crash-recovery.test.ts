import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

// Story 3.5 AC 3: SIGKILL mid-write + restart → WAL recovery. better-sqlite3
// is in-process, so the only honest way to test crash semantics is to spawn
// the REAL server (src/index.ts) as a separate OS process, kill -9 it with
// the WAL un-checkpointed, and verify recovery on reopen/restart.
//
// "Mid-write" honesty: an exact mid-INSERT kill is not externally schedulable
// (better-sqlite3 writes are synchronous and microsecond-fast). The falsifiable
// contract: rows whose POST got a 201 MUST survive; in-flight rows may be
// present or absent but never torn; PRAGMA integrity_check = ok.
//
// NOTE (E3): this test must keep using SIGKILL — the graceful SIGTERM handler
// in index.ts must never turn this into a clean shutdown.

// Single-process spawn shape: `node --import <tsx loader> index.ts` — the same
// invocation the production container uses (Dockerfile CMD). The `tsx/cli` bin
// must NOT be used here: it re-spawns node as a grandchild, so SIGKILL would
// hit only the wrapper and the real server would survive, silently voiding the
// whole crash test (observed live, 2026-07-14).
const tsxLoaderUrl = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
// Absolute path to the real entrypoint — cwd-independent, so the test works
// both via `npm run test:integration` (cwd apps/api) and `--root apps/api`.
const serverEntry = fileURLToPath(new URL('../../src/index.ts', import.meta.url));

// High port derived from the worker PID to dodge collisions across parallel
// vitest workers; both children in this file run sequentially on the same port.
const PORT = 20000 + (process.pid % 10000);
const BASE = `http://127.0.0.1:${PORT}`;

/** Valid UUIDv7-shaped id, unique per index (decimal digits are valid hex). */
const v7Id = (i: number) => `01920000-0000-7000-8000-${String(i).padStart(12, '0')}`;

function spawnServer(databasePath: string): ChildProcess {
  const child = spawn(process.execPath, ['--import', tsxLoaderUrl, serverEntry], {
    env: { ...process.env, PORT: String(PORT), DATABASE_PATH: databasePath },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  // Surface boot failures in the health-poll timeout instead of a silent hang.
  child.stderr?.on('data', (chunk: Buffer) => {
    lastStderr = `${lastStderr}${chunk.toString()}`.slice(-2000);
  });
  return child;
}

let lastStderr = '';

/** Poll GET /health until 200 or the deadline passes (never fixed sleeps). */
async function waitForHealth(deadlineMs = 20_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.status === 200) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(`server not healthy on :${PORT} within deadline; stderr: ${lastStderr}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Kill a child (SIGKILL) and await its actual exit so nothing is orphaned. */
async function killAndWait(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((r) => child.once('exit', r));
  child.kill('SIGKILL');
  await exited;
}

/** Poll until /health STOPS answering — proof the kill hit the real server. */
async function waitForDown(deadlineMs = 5_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      await fetch(`${BASE}/health`);
    } catch {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`server still answering on :${PORT} after SIGKILL — kill hit a wrapper?`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('SIGKILL / WAL crash recovery (AC 3)', () => {
  let dir: string | undefined;
  const children: ChildProcess[] = [];

  afterEach(async () => {
    for (const child of children) await killAndWait(child);
    children.length = 0;
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it(
    'recovers cleanly after SIGKILL with POSTs in flight: confirmed rows survive, no corruption',
    async () => {
      dir = mkdtempSync(join(tmpdir(), 'tlf-crash-'));
      const databasePath = join(dir, 'todos.db');

      const first = spawnServer(databasePath);
      children.push(first);
      await waitForHealth();

      // A row the server has CONFIRMED (201 received) — it must survive.
      const baselineId = v7Id(0);
      const baselineRes = await fetch(`${BASE}/todos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: baselineId, description: 'confirmed baseline row' }),
      });
      expect(baselineRes.status).toBe(201);

      // Burst of POSTs, NOT all awaited; SIGKILL lands while they are in
      // flight. Each settles to its id on 201, null otherwise (killed sockets
      // reject — that's the point).
      const burst = Array.from({ length: 20 }, (_, i) => {
        const id = v7Id(i + 1);
        return fetch(`${BASE}/todos`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, description: `burst row ${i + 1}` }),
        })
          .then((res) => (res.status === 201 ? id : null))
          .catch(() => null);
      });

      // Let at least one burst request complete so "confirmed before the kill"
      // is non-trivial, then kill -9 — db.close() never runs, so the WAL
      // sidecar is left un-checkpointed on disk.
      await Promise.race(burst);
      await killAndWait(first);
      await waitForDown();
      const confirmedIds = (await Promise.all(burst)).filter((id): id is string => id !== null);

      expect(existsSync(`${databasePath}-wal`)).toBe(true);

      // Layer (a): direct reopen — the corruption oracle.
      const db = new Database(databasePath);
      try {
        const [integrity] = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
        expect(integrity?.integrity_check).toBe('ok');
      } finally {
        db.close();
      }

      // Layer (b): restart the SAME command against the SAME DATABASE_PATH.
      const second = spawnServer(databasePath);
      children.push(second);
      await waitForHealth();

      const listRes = await fetch(`${BASE}/todos`);
      expect(listRes.status).toBe(200);
      const todos = (await listRes.json()) as Array<Record<string, unknown>>;
      expect(Array.isArray(todos)).toBe(true);

      // Every row is intact — no torn/partial rows regardless of whether an
      // unanswered burst write was kept or cleanly dropped.
      for (const todo of todos) {
        expect(todo).toMatchObject({
          id: expect.any(String),
          description: expect.any(String),
          completed: expect.any(Boolean),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        });
      }

      const ids = new Set(todos.map((t) => t.id));
      expect(ids.has(baselineId)).toBe(true);
      for (const id of confirmedIds) {
        expect(ids.has(id)).toBe(true);
      }
    },
    60_000,
  );

  it(
    'shuts down cleanly on SIGTERM: exit code 0 and data intact (graceful path, Story 3.5 E)',
    async () => {
      dir = mkdtempSync(join(tmpdir(), 'tlf-sigterm-'));
      const databasePath = join(dir, 'todos.db');

      const child = spawnServer(databasePath);
      children.push(child);
      await waitForHealth();

      const id = v7Id(999);
      const res = await fetch(`${BASE}/todos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, description: 'survives graceful shutdown' }),
      });
      expect(res.status).toBe(201);

      // SIGTERM → the index.ts handler awaits app.close() (awilix disposer
      // closes the DB, checkpointing the WAL) and exits 0. Without the handler
      // the process would die ON the signal (signalCode SIGTERM, no exit code).
      const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
        child.once('exit', (code, signal) => resolve({ code, signal })),
      );
      child.kill('SIGTERM');
      const { code, signal } = await exited;
      expect(signal).toBeNull();
      expect(code).toBe(0);

      // Clean close checkpointed the WAL — the confirmed row is in the DB.
      const db = new Database(databasePath, { readonly: true });
      try {
        const row = db.prepare('SELECT id FROM todos WHERE id = ?').get(id);
        expect(row).toEqual({ id });
      } finally {
        db.close();
      }
    },
    60_000,
  );
});
