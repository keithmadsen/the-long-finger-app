import { Type, type Static } from '@sinclair/typebox';

// The shared Todo contract — the single source of truth both apps compile
// against. Defined in full now (AC 1) even though PATCH/DELETE wire up in later
// stories; @tlf/contracts is append-mostly.
//
// NOTE: no `format: 'uuid'`/`format: 'date-time'` keywords on the Todo schema.
// Ajv `format` keywords need `ajv-formats` registered at the boundary, and even
// `format: 'uuid'` does not assert the v7 version nibble the client-generated id
// requires. Story 1.7 validates the POST body's id with a UUIDv7 `pattern`
// instead (see `UUIDV7_PATTERN` / `createTodoBody`) — a pattern needs no extra
// dependency. Plain strings (with the description length range) remain the
// correct surface for the read-path `Todo` schema.

// UUIDv7 string pattern: 8-4-4-4-12 hex with the version nibble pinned to `7`
// and the variant nibble to 8/9/a/b. Asserts a client-generated v7 id without
// pulling in ajv-formats (which would not check the version anyway).
export const UUIDV7_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

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
// no `completed` — the server owns those. `$id` lets @fastify/swagger register
// it as a reusable OpenAPI component the route references by $ref (matching the
// `Todo`/`ErrorEnvelope` pattern). The id `pattern` rejects a malformed/non-v7
// id with a 400 at the boundary (Story 1.7 AC 2).
export const createTodoBody = Type.Object(
  {
    id: Type.String({ pattern: UUIDV7_PATTERN }),
    description: Type.String({ minLength: 1, maxLength: 200 }),
  },
  { $id: 'CreateTodoBody' },
);

// PATCH body: completion is the sole mutable field (NG-7). `$id` lets
// @fastify/swagger register it as a reusable OpenAPI component the route
// references by $ref (matching the `Todo`/`CreateTodoBody`/`ErrorEnvelope`
// pattern). `additionalProperties: false` CLOSES the object so an extra/unknown
// field is a 400 at the boundary (Story 1.8 AC 9) — TypeBox does not close an
// object by default, and Fastify's `removeAdditional` only strips when the
// schema is explicitly closed, so this keyword is what makes the contract strict.
export const patchTodoBody = Type.Object(
  {
    completed: Type.Boolean(),
  },
  { $id: 'PatchTodoBody', additionalProperties: false },
);

export type Todo = Static<typeof todoSchema>;
export type CreateTodoBody = Static<typeof createTodoBody>;
export type PatchTodoBody = Static<typeof patchTodoBody>;
