import { Type, type Static } from '@sinclair/typebox';

// The shared Todo contract — the single source of truth both apps compile
// against. Defined in full now (AC 1) even though PATCH/DELETE wire up in later
// stories; @tlf/contracts is append-mostly.
//
// NOTE: no `format: 'uuid'`/`format: 'date-time'` keywords here. Ajv format
// validation needs `ajv-formats` registered at the API boundary, which lands
// with POST validation in Story 1.7. Plain strings (with the description length
// range) are the correct surface for the read path.

// `$id: 'Todo'` lets @fastify/swagger register a stable, reusable component.
export const todoSchema = Type.Object(
  {
    id: Type.String(),
    description: Type.String({ minLength: 1, maxLength: 200 }),
    completed: Type.Boolean(),
    // ISO-8601 strings, server-owned.
    createdAt: Type.String(),
    updatedAt: Type.String(),
  },
  { $id: 'Todo' },
);

// POST body: client-generated UUIDv7 `id` + the new description. No timestamps,
// no `completed` — the server owns those.
export const createTodoBody = Type.Object({
  id: Type.String(),
  description: Type.String({ minLength: 1, maxLength: 200 }),
});

// PATCH body: completion is the sole mutable field (NG-7).
export const patchTodoBody = Type.Object({
  completed: Type.Boolean(),
});

export type Todo = Static<typeof todoSchema>;
export type CreateTodoBody = Static<typeof createTodoBody>;
export type PatchTodoBody = Static<typeof patchTodoBody>;
