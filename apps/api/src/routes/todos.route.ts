import type { FastifyInstance } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { Todo, ErrorEnvelope } from '@tlf/contracts';

// `Todo` and `ErrorEnvelope` are registered as reusable components by their
// `$id` (see plugins/swagger.ts → addSchema), so the route references them by
// $ref. Type.Unsafe preserves the static type through the 0.34 string-ref API.
const todoArrayResponse = Type.Array(Type.Unsafe<Todo>(Type.Ref('Todo')));
const errorResponse = Type.Unsafe<ErrorEnvelope>(Type.Ref('ErrorEnvelope'));

// GET /todos — resolves the repository from the cradle and returns the
// canonically-ordered, mapped Todo[] (camelCase, no success envelope). Route
// stays thin: no logic, no DB knowledge. POST/PATCH/DELETE are Stories 1.7/1.8/2.x.
//
// The response schema enforces the contract at the boundary (Fastify serializes
// against it, stripping any non-schema field) and feeds the OpenAPI document.
export default async function todosRoute(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
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
}
