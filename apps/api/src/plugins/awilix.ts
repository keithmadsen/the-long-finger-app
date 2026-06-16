import type { FastifyInstance } from 'fastify';
import { fastifyAwilixPlugin } from '@fastify/awilix';
import { asFunction, asValue, Lifetime } from 'awilix';
import { databaseConnection } from '../db/connection.js';
import { todoRepository } from '../repositories/todo.repository.js';
import '../types/cradle.js';

export interface ContainerOptions {
  /** On-disk SQLite path — injectable so tests can supply a temp file (AC 7). */
  databasePath: string;
}

// Registers the awilix cradle on the Fastify instance.
//
// The DB-file path is registered as a value, so the `db` factory reads it from
// the cradle. A test constructs the app with a temp-dir path and gets the real
// repository against a real file — no implementation swap, no in-memory fake.
export async function registerContainer(
  app: FastifyInstance,
  { databasePath }: ContainerOptions,
): Promise<void> {
  await app.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: false,
  });

  app.diContainer.register({
    databasePath: asValue(databasePath),
    db: asFunction(databaseConnection, {
      lifetime: Lifetime.SINGLETON,
      dispose: (db) => db.close(),
    }),
    todoRepository: asFunction(todoRepository, { lifetime: Lifetime.SINGLETON }),
  });
}
