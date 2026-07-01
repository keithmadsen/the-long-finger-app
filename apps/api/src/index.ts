import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildServer } from './server.js';

function readPort(value: string | undefined): number {
  if (value === undefined) return 3001;

  const port = Number(value.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
}

function readDatabasePath(value: string | undefined): string {
  return value?.trim() || './data/todos.db';
}

// Entrypoint: read config from the environment, build the app, listen on PORT.
const port = readPort(process.env.PORT);
const databasePath = readDatabasePath(process.env.DATABASE_PATH);

// Resolve the built web dir (apps/api/src → apps/web/dist) and serve it only
// when it exists, so the container (web is built into the image) serves the SPA
// same-origin, while a local `npm run start --workspace apps/api` with no web
// build still boots headless.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
const staticRoot = existsSync(webDist) ? webDist : undefined;

const app = await buildServer({ databasePath, staticRoot });

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
