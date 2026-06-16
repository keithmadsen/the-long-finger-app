import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../../src/server.js';

export interface TestApp {
  app: FastifyInstance;
  /** The real on-disk SQLite file path this app was built against. */
  databasePath: string;
  /** Close the app and remove the temp database directory. */
  cleanup: () => Promise<void>;
}

// Builds the real Fastify app against a real temp-file SQLite database.
// Proves the injectable DB path (AC 7): the production repository is used
// unchanged, only the path differs — no in-memory fake, no implementation swap.
export async function buildTestApp(): Promise<TestApp> {
  const dir = mkdtempSync(join(tmpdir(), 'tlf-api-'));
  const databasePath = join(dir, 'todos.db');

  const app = await buildServer({ databasePath, logger: false });
  await app.ready();

  // awilix singletons are lazy. Force the db to resolve now so the connection
  // actually opens the injected on-disk path (the heart of AC 7) before any
  // assertion inspects the file.
  void app.diContainer.cradle.db;

  return {
    app,
    databasePath,
    cleanup: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
