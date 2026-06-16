import type { FastifyInstance } from 'fastify';

// GET /todos — resolves the repository from the cradle and returns the rows
// (200 [] against a fresh DB). Route stays thin: no logic, no DB knowledge.
// POST/PATCH/DELETE are out of scope for the skeleton (Stories 1.7/1.8/2.x).
export default async function todosRoute(app: FastifyInstance): Promise<void> {
  app.get('/todos', async (request) => {
    const { todoRepository } = request.diScope.cradle;
    return todoRepository.listTodos();
  });
}
