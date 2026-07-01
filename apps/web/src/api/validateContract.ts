import { Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { todoSchema, type Todo } from '@tlf/contracts'

/*
 * Runtime contract validation (Epic 1 retro action item 2, Keith-confirmed:
 * "I would expect run-time validation of schemas at all times"). This is the
 * single place the web client validates a parsed 2xx body against the SHARED
 * `@tlf/contracts` TypeBox schema, so client and server cannot drift — it
 * replaces the hand-rolled `isTodo` guard that duplicated the shape by hand.
 *
 * We use `@sinclair/typebox/value` (NOT Ajv) on the client: no extra dependency,
 * browser-friendly, and it validates the exact same schema object the API
 * serializes against. `Value.Check` is the boolean gate; on a miss we throw a
 * descriptive Error so callers keep the existing "throw → mutation onError /
 * query isError" contract with no behavior change.
 *
 * NOTE: this module is the first RUNTIME import of the TS-source `@tlf/contracts`
 * package into the web bundle (web previously imported it type-only). Vite/esbuild
 * transpiles the workspace `.ts` source directly — verified by `vite build` and
 * `vitest run` (Story 2.1 Task C1).
 */

const todoArraySchema = Type.Array(todoSchema)

export function parseTodo(value: unknown): Todo {
  if (!Value.Check(todoSchema, value)) {
    throw new Error('Response body failed Todo contract validation')
  }
  return value
}

export function parseTodoArray(value: unknown): Todo[] {
  if (!Value.Check(todoArraySchema, value)) {
    throw new Error('Response body failed Todo[] contract validation')
  }
  return value
}
