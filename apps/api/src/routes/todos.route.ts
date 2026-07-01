import type { FastifyInstance } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { Todo, CreateTodoBody, PatchTodoBody, ErrorEnvelope } from '@tlf/contracts';

// `Todo`, `CreateTodoBody`, `PatchTodoBody` and `ErrorEnvelope` are registered
// as reusable components by their `$id` (see plugins/swagger.ts → addSchema), so
// the route references them by $ref. Type.Unsafe preserves the static type
// through the 0.34 string-ref API.
const todoResponse = Type.Unsafe<Todo>(Type.Ref('Todo'));
const todoArrayResponse = Type.Array(todoResponse);
const createTodoBodyRef = Type.Unsafe<CreateTodoBody>(Type.Ref('CreateTodoBody'));
const patchTodoBodyRef = Type.Unsafe<PatchTodoBody>(Type.Ref('PatchTodoBody'));
const todoParams = Type.Object({ id: Type.String() });
const errorResponse = Type.Unsafe<ErrorEnvelope>(Type.Ref('ErrorEnvelope'));

// /todos — resolves the repository from the cradle. The route stays thin: no DB
// knowledge, no casing (the repository's mapper owns that). PATCH (1.8) and
// DELETE (2.1) are implemented below.
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

  // PATCH /todos/:id — toggle completion (Story 1.8). The body is `{ completed }`
  // ONLY (closed TypeBox object → 400 on an extra/malformed field). This is the
  // first route with a real DOMAIN decision: a missing id is a 404, decided HERE
  // in the handler (the repository returns null, not a throw, and the not-found
  // handler covers only unknown routes — neither owns this domain 404). The
  // envelope is constructed inline so it matches the uniform `{ error: { code,
  // message } }` shape. updated_at is stamped server-side by the repository so a
  // later fresh GET re-sorts the toggled item into canonical order (AC 7).
  typedApp.patch(
    '/todos/:id',
    {
      schema: {
        params: todoParams,
        body: patchTodoBodyRef,
        response: {
          200: todoResponse,
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { todoRepository } = request.diScope.cradle;
      const todo = todoRepository.updateTodo(request.params.id, request.body);
      if (!todo) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Todo ${request.params.id} not found`,
          },
        });
      }
      return todo;
    },
  );

  // DELETE /todos/:id — hard delete (Story 2.1). The DELIBERATE asymmetry vs.
  // PATCH: delete is IDEMPOTENT, so a missing id also returns 204 (AC 2), NOT
  // 404. There is NO domain decision here — no computation, no status branch —
  // so the repository boolean is intentionally ignored (it exists only for unit
  // tests / future callers). This makes the handler pure transport, the
  // strongest case yet for staying inline (no `delete-todo.handler.ts` factory;
  // see the handler-placement note above). `response: { 204: Type.Null() }`
  // documents the no-content response in OpenAPI; `reply.status(204).send()`
  // (no argument) sends no body — Fastify does not serialize a payload for 204.
  typedApp.delete(
    '/todos/:id',
    {
      schema: {
        params: todoParams,
        response: {
          204: Type.Null(),
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const { todoRepository } = request.diScope.cradle;
      todoRepository.deleteTodo(request.params.id);
      // `send(null)` satisfies the `204: Type.Null()` typed-provider signature;
      // Fastify writes NO body for a 204 regardless (verified by the integration
      // test asserting an empty body).
      return reply.status(204).send(null);
    },
  );
}
