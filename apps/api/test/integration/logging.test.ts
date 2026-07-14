import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';

// Story 3.5 AC 4 (+ AC 5 rides along): pino emits structured JSON at the
// committed levels — info lifecycle (reqId + responseTime), warn for
// recoverable 4xx, error for 500s — and NEVER logs payload content. The app is
// built with a captured pino destination stream so every emitted line can be
// parsed and audited.

/** A unique payload marker that must never appear in any log line. */
const SENTINEL = 'never-log-me-7f3a1c9e2b';

/** Valid UUIDv7-shaped ids for the POST bodies. */
const V7_ID_OK = '01920000-0000-7000-8000-000000000001';

interface LogLine {
  level: number;
  reqId?: string;
  responseTime?: number;
  msg?: string;
  [key: string]: unknown;
}

describe('committed log levels + never-log-payloads (AC 4, AC 5)', () => {
  let app: FastifyInstance;
  let dbDir: string;
  const rawLines: string[] = [];

  const lines = (): LogLine[] => rawLines.map((l) => JSON.parse(l) as LogLine);

  beforeAll(async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'tlf-logdb-'));
    app = await buildServer({
      databasePath: join(dbDir, 'todos.db'),
      // Fastify passes this verbatim to pino: keep the committed level and
      // capture every emitted line (pino writes one line per event).
      logger: {
        level: 'info',
        stream: {
          write(chunk: string) {
            for (const line of chunk.split('\n')) {
              if (line.trim()) rawLines.push(line);
            }
          },
        },
      },
    });
    // A cheaply reachable forced 500: the error handler's ≥500 branch must log
    // the real error at `error` level and never leak it into the response.
    app.get('/boom', () => {
      throw new Error('kaboom');
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('emits parseable JSON lifecycle logs with reqId + numeric responseTime, and /health is a 200 liveness probe (AC 5)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });

    // Every line emitted so far parses as JSON (throws otherwise).
    const parsed = lines();
    const completion = parsed.find(
      (l) => l.msg === 'request completed' && l.responseTime !== undefined,
    );
    expect(completion).toBeDefined();
    expect(completion!.reqId).toEqual(expect.any(String));
    expect(completion!.responseTime).toEqual(expect.any(Number));
    // The healthy probe is lifecycle-only: info lines, no warn/error emitted.
    expect(parsed.every((l) => l.level <= 30)).toBe(true);
  });

  it('logs a recoverable validation 400 at warn, without the offending value', async () => {
    const before = rawLines.length;
    const res = await app.inject({
      method: 'POST',
      url: '/todos',
      payload: { id: V7_ID_OK, description: `${SENTINEL}${'x'.repeat(200)}` },
    });
    expect(res.statusCode).toBe(400);
    // The envelope may carry details to the CLIENT (contract unchanged) …
    expect(res.json().error.code).toBe('BAD_REQUEST');

    const warns = lines()
      .slice(before)
      .filter((l) => l.level === 40);
    expect(warns.length).toBe(1);
    const warn = warns[0]!;
    expect(warn).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
    // … but the LOG line must not embed the validation payload.
    expect(JSON.stringify(warn)).not.toContain(SENTINEL);
    expect(warn.validation).toBeUndefined();
  });

  it('logs a 404 (unknown route) at warn', async () => {
    const before = rawLines.length;
    const res = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(res.statusCode).toBe(404);

    const warns = lines()
      .slice(before)
      .filter((l) => l.level === 40);
    expect(warns.length).toBe(1);
    expect(warns[0]).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('still logs 500s at error (the ≥500 branch is untouched)', async () => {
    const before = rawLines.length;
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    // The response never leaks the real error…
    expect(res.json().error.message).toBe('Internal Server Error');
    // …which goes to pino at error level instead.
    const errors = lines()
      .slice(before)
      .filter((l) => l.level === 50);
    expect(errors.length).toBe(1);
  });

  it('never logs payload content: the sentinel appears in zero log lines', async () => {
    // Success path: a valid create whose description carries the sentinel.
    const res = await app.inject({
      method: 'POST',
      url: '/todos',
      payload: { id: V7_ID_OK, description: SENTINEL },
    });
    expect(res.statusCode).toBe(201);

    // Across EVERYTHING logged in this suite — lifecycle lines for the
    // successful create above AND the earlier validation warn whose offending
    // payload carried the sentinel — the submitted value appears in ZERO lines.
    expect(rawLines.filter((l) => l.includes(SENTINEL))).toEqual([]);
  });
});
