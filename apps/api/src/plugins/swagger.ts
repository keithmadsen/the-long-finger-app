import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { todoSchema, createTodoBody, errorEnvelope } from '@tlf/contracts';

// Registers the OpenAPI document generation (AR-4's third leg) from the
// registered TypeBox schemas, plus the Swagger UI at /docs.
//
// Called directly on the root app BEFORE routes are registered: @fastify/swagger
// collects route schemas via an onRoute hook, so it must see the routes after
// itself. The `$id`-bearing schemas are added so `Todo` and `ErrorEnvelope`
// appear as reusable components that routes reference by $ref.
export async function registerSwagger(app: FastifyInstance): Promise<void> {
  // Register the shared contract schemas as reusable OpenAPI components.
  app.addSchema(todoSchema);
  app.addSchema(createTodoBody);
  app.addSchema(errorEnvelope);

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'The Long Finger API',
        description: 'Capture, view and complete your list.',
        version: '0.1.0',
      },
    },
    // Name components by their schema `$id` (e.g. `Todo`, `ErrorEnvelope`)
    // instead of the default anonymous `def-0`/`def-1` keys.
    refResolver: {
      buildLocalReference(json, _baseUri, _fragment, i) {
        return typeof json.$id === 'string' ? json.$id : `def-${i}`;
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });
}
