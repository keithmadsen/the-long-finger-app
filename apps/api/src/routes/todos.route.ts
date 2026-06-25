import type { FastifyInstance } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { Todo, CreateTodoBody, ErrorEnvelope } from '@tlf/contracts';

// `Todo`, `CreateTodoBody` and `ErrorEnvelope` are registered as reusable
// components by their `$id` (see plugins/swagger.ts → addSchema), so the route
// references them by $ref. Type.Unsafe preserves the static type through the
// 0.34 string-ref API.
const todoResponse = Type.Unsafe<Todo>(Type.Ref('Todo'));
const todoArrayResponse = Type.Array(todoResponse);
const createTodoBodyRef = Type.Unsafe<CreateTodoBody>(Type.Ref('CreateTodoBody'));
const errorResponse = Type.Unsafe<ErrorEnvelope>(Type.Ref('ErrorEnvelope'));

// /todos — resolves the repository from the cradle. The route stays thin: no DB
// knowledge, no casing (the repository's mapper owns that). PATCH/DELETE are
// Stories 1.8/2.x.
//
// The schemas enforce the contract at the boundary (Fastify serializes responses
// against them, stripping non-schema fields; Ajv validates the POST body) and
// feed the OpenAPI document.
//
// Handler placement (clean-architecture): in this cradle-injected Fastify shape
// the route's async fn IS the handler (cf. the skill's Lambda example, "the
// route file IS the handler"). The POST orchestration is purely transport-level
// — call the repository, map created→201/200, return the Todo — with no domain
// decision and no DB knowledge, so a separate `create-todo.handler.ts` factory
// would only add indirection ("a service adds no value — skip it"). It is kept
// inline here, consistent with GET. Toggle (1.8) / delete (Epic 2) introduce
// real domain decisions (e.g. 404-on-missing-id) and may warrant extraction then.
export default async function todosRoute(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<TypeBoxTypeProvider>();

  typedApp.get(
    '/todos',
    {
      schema: {
        response: {
          200: todoArrayResponse,
          500: errorResponse,
        },
      },
    },
    async (request) => {
      const { todoRepository } = request.diScope.cradle;
      return todoRepository.listTodos();
    },
  );

  // POST /todos — create with a client-generated UUIDv7 id. Idempotent on id:
  // a new row → 201, an already-existing id → 200 with the existing Todo (AC 11),
  // so a Story 1.9 retry is safe. Body validation (length range + UUIDv7 pattern)
  // happens here at the boundary; an Ajv failure is turned into the 400
  // BAD_REQUEST envelope by the (previously dormant) error-handler.
  typedApp.post(
    '/todos',
    {
      schema: {
        body: createTodoBodyRef,
        response: {
          201: todoResponse,
          200: todoResponse,
          400: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { todoRepository } = request.diScope.cradle;
      const { todo, created } = todoRepository.insertTodo(request.body);
      reply.status(created ? 201 : 200);
      return todo;
    },
  );
}
