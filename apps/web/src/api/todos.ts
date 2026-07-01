import type { CreateTodoBody, PatchTodoBody, Todo } from '@tlf/contracts'

import { parseTodo, parseTodoArray } from './validateContract'

/*
 * The ONLY place the network is touched for the read path (architecture.md
 * component boundary: just hooks/api reach the network; recipes/primitives never
 * do). Mirrors the walking-skeleton fetch (GET /todos via the Vite proxy) but
 * returns the parsed, typed Todo[].
 *
 * Throws on a non-OK response so TanStack Query enters isError and <App> shows
 * the load-failed surface (AC 6). The 2xx body is validated at runtime against
 * the shared @tlf/contracts schema (Story 2.1 AC 6) — a malformed body throws
 * and routes to isError too. The backend is the canonical-order authority
 * (completed ASC, updated_at DESC) — we return its array verbatim and NEVER
 * re-sort (AC 8).
 */
export async function getTodos(): Promise<Todo[]> {
  const response = await fetch('/todos')

  if (!response.ok) {
    throw new Error(`GET /todos failed: ${response.status}`)
  }

  return parseTodoArray(await response.json())
}

/*
 * The write counterpart: create a todo from a client-generated UUIDv7 `id` +
 * description. POSTs JSON through the same Vite proxy. The server is idempotent
 * on `id` (201 new / 200 existing) — both are success here; the client already
 * owns the final id so there is no reconciliation, the settle is the cache
 * invalidation (useCreateTodo onSettled), not this response body.
 *
 * Throws on a non-OK response AND on a malformed success body (validated at
 * runtime against the shared @tlf/contracts schema, Story 2.1 AC 6), so either
 * failure routes to the mutation's onError (which rolls the pending row back)
 * rather than crashing the render — mirrors the read-path malformed-payload guard.
 *
 * Accepts an optional AbortSignal (Story 1.9): a failed-create's Dismiss aborts
 * the in-flight POST via its per-row controller. The `await fetch(...)` is left
 * OUTSIDE any try/catch ON PURPOSE — an aborted fetch throws a DOMException named
 * 'AbortError' from fetch itself (before the response.ok check), and that error
 * must propagate UN-WRAPPED so useCreateTodo's onError can detect it by
 * `name === 'AbortError'` and skip the markFailed/announce cleanup (the Dismiss
 * path already cleaned up). The try/catch below wraps ONLY the JSON parse.
 */
export async function createTodo(
  body: CreateTodoBody,
  signal?: AbortSignal,
): Promise<Todo> {
  const response = await fetch('/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: body.id, description: body.description }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`POST /todos failed: ${response.status}`)
  }

  try {
    return parseTodo(await response.json())
  } catch {
    throw new Error('POST /todos returned a malformed response body')
  }
}

/*
 * Toggle a todo's completion (Story 1.8). PATCHes `{ completed }` ONLY — the
 * server owns updated_at and never trusts a client timestamp. Mirrors createTodo:
 * throws on a non-OK response (a 404/400/500 routes to useToggleTodo's onError,
 * which reverts the row in place and reconciles) AND on a malformed 2xx body
 * (validated against the shared @tlf/contracts schema, Story 2.1 AC 6), so a bad
 * payload never crashes the render. Validation does not cover the id-mismatch
 * case, so the explicit `parsed.id !== id` cross-check is kept. The returned Todo
 * carries the server's real updated_at — useToggleTodo writes it into the same
 * array position to capture it without re-sorting.
 */
export async function patchTodo(
  id: string,
  body: PatchTodoBody,
): Promise<Todo> {
  const response = await fetch(`/todos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: body.completed }),
  })

  if (!response.ok) {
    throw new Error(`PATCH /todos/${id} failed: ${response.status}`)
  }

  try {
    const parsed = parseTodo(await response.json())
    if (parsed.id !== id) {
      throw new Error('PATCH /todos returned a malformed response body')
    }
    return parsed
  } catch {
    throw new Error('PATCH /todos returned a malformed response body')
  }
}

/*
 * Delete a todo (Story 2.1). DELETEs /todos/:id through the same Vite proxy.
 * This is the ONE wrapper with no @tlf/contracts representation: the endpoint
 * returns 204 with no body, so it parses no JSON and validates NOTHING — the
 * 204/no-schema asymmetry is intentional (AC 8). Throws on a non-OK response so
 * useDeleteTodo's onError fires (rollback + reconcile). The server is idempotent
 * (204 even for an absent id), so a retry is always safe.
 */
export async function deleteTodo(id: string): Promise<void> {
  const response = await fetch(`/todos/${id}`, { method: 'DELETE' })

  if (!response.ok) {
    throw new Error(`DELETE /todos/${id} failed: ${response.status}`)
  }
}
