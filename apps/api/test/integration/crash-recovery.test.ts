import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
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

let port = 0;
const baseUrl = () => `http://127.0.0.1:${port}`;

/** Valid UUIDv7-shaped id, unique per index (decimal digits are valid hex). */
const v7Id = (i: number) => `01920000-0000-7000-8000-${String(i).padStart(12, '0')}`;

async function allocatePort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const address = reservation.address();
  if (!address || typeof address === 'string') {
    reservation.close();
    throw new Error('failed to allocate an ephemeral TCP port');
  }
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function spawnServer(databasePath: string): ChildProcess {
  lastStderr = '';
  const child = spawn(process.execPath, ['--import', tsxLoaderUrl, serverEntry], {
    env: { ...process.env, PORT: String(port), DATABASE_PATH: databasePath },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  // Surface boot failures in the health-poll timeout instead of a silent hang.
  child.stderr?.on('data', (chunk: Buffer) => {
    lastStderr = `${lastStderr}${chunk.toString()}`.slice(-2000);
  });
  return child;
}

let lastStderr = '';

function timedFetch(
  input: string,
  init: RequestInit = {},
  timeoutMs = 2_000,
): Promise<Response> {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
}

/** Poll GET /health until 200 or the deadline passes (never fixed sleeps). */
async function waitForHealth(child: ChildProcess, deadlineMs = 20_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`server exited before becoming healthy; stderr: ${lastStderr}`);
    }
    try {
      const res = await timedFetch(`${baseUrl()}/health`);
      if (res.status === 200) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(`server not healthy on :${port} within deadline; stderr: ${lastStderr}`);
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
      await timedFetch(`${baseUrl()}/health`, {}, 500);
    } catch {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`server still answering on :${port} after SIGKILL — kill hit a wrapper?`);
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
      port = await allocatePort();

      const first = spawnServer(databasePath);
      children.push(first);
      await waitForHealth(first);

      // A row the server has CONFIRMED (201 received) — it must survive.
      const baselineId = v7Id(0);
      const baselineRes = await timedFetch(`${baseUrl()}/todos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: baselineId, description: 'confirmed baseline row' }),
      });
      expect(baselineRes.status).toBe(201);

      // Burst of POSTs, NOT all awaited; SIGKILL lands while they are in
      // flight. Each settles to its id on 201, null otherwise (killed sockets
      // reject — that's the point).
      let settled = 0;
      const burst = Array.from({ length: 200 }, (_, i) => {
        const id = v7Id(i + 1);
        return timedFetch(`${baseUrl()}/todos`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, description: `burst row ${i + 1}` }),
        }, 10_000)
          .then((res) => (res.status === 201 ? id : null))
          .catch(() => null)
          .finally(() => {
            settled += 1;
          });
      });

      // Let at least one burst request complete so "confirmed before the kill"
      // is non-trivial, then kill -9 — db.close() never runs, so the WAL
      // sidecar is left un-checkpointed on disk.
      await Promise.race(burst);
      expect(settled).toBeGreaterThan(0);
      expect(settled).toBeLessThan(burst.length);
      await killAndWait(first);
      await waitForDown();
      const confirmedIds = (await Promise.all(burst)).filter((id): id is string => id !== null);

      expect(existsSync(`${databasePath}-wal`)).toBe(true);

      // Restart the SAME production command against the crash-left WAL before
      // any direct SQLite open can recover or checkpoint it.
      const second = spawnServer(databasePath);
      children.push(second);
      await waitForHealth(second);

      // Independent corruption oracle after the production process has itself
      // reopened the crash-left database. Readonly avoids checkpointing it.
      const db = new Database(databasePath, { readonly: true });
      try {
        const [integrity] = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
        expect(integrity?.integrity_check).toBe('ok');
      } finally {
        db.close();
      }

      const listRes = await timedFetch(`${baseUrl()}/todos`);
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
      port = await allocatePort();

      const child = spawnServer(databasePath);
      children.push(child);
      await waitForHealth(child);

      const id = v7Id(999);
      const res = await timedFetch(`${baseUrl()}/todos`, {
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
