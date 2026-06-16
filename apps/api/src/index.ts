import { buildServer } from './server.js';

// Entrypoint: read config from the environment, build the app, listen on PORT.
const port = Number(process.env.PORT ?? 3001);
const databasePath = process.env.DATABASE_PATH ?? './data/todos.db';

const app = await buildServer({ databasePath });

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
