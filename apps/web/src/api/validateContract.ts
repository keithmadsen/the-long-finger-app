// Named `Check` import (NOT the `Value` namespace facade) so Rollup tree-shakes
// away the rest of the value module — cast/convert/clean/diff/patch/encode/decode
// never reach the client bundle. Keeps the runtime-validation footprint small
// (the bundle-size gate, Story 1.6 AC 9).
import { Check } from '@sinclair/typebox/value'
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
 * serializes against. `Check` is the boolean gate; on a miss we throw a
 * descriptive Error so callers keep the existing "throw → mutation onError /
 * query isError" contract with no behavior change.
 *
 * NOTE: this module is the first RUNTIME import of the TS-source `@tlf/contracts`
 * package into the web bundle (web previously imported it type-only). Vite/esbuild
 * transpiles the workspace `.ts` source directly — verified by `vite build` and
 * `vitest run` (Story 2.1 Task C1).
 */

export function parseTodo(value: unknown): Todo {
  if (!Check(todoSchema, value)) {
    throw new Error('Response body failed Todo contract validation')
  }
  return value
}

// Validate each element against `todoSchema` rather than building
// `Type.Array(todoSchema)`, so the runtime never imports the `Type` builder's
// array combinator solely for this check.
export function parseTodoArray(value: unknown): Todo[] {
  if (!Array.isArray(value) || !value.every((item) => Check(todoSchema, item))) {
    throw new Error('Response body failed Todo[] contract validation')
  }
  return value as Todo[]
}
