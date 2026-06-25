import type { CreateTodoBody, Todo } from '@tlf/contracts'

/*
 * The ONLY place the network is touched for the read path (architecture.md
 * component boundary: just hooks/api reach the network; recipes/primitives never
 * do). Mirrors the walking-skeleton fetch (GET /todos via the Vite proxy) but
 * returns the parsed, typed Todo[].
 *
 * Throws on a non-OK response so TanStack Query enters isError and <App> shows
 * the load-failed surface (AC 6). The backend is the canonical-order authority
 * (completed ASC, updated_at DESC) — we return its array verbatim and NEVER
 * re-sort (AC 8).
 */
export async function getTodos(): Promise<Todo[]> {
  const response = await fetch('/todos')

  if (!response.ok) {
    throw new Error(`GET /todos failed: ${response.status}`)
  }

  return (await response.json()) as Todo[]
}

function isTodo(value: unknown): value is Todo {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.completed === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  )
}

/*
 * The write counterpart: create a todo from a client-generated UUIDv7 `id` +
 * description. POSTs JSON through the same Vite proxy. The server is idempotent
 * on `id` (201 new / 200 existing) — both are success here; the client already
 * owns the final id so there is no reconciliation, the settle is the cache
 * invalidation (useCreateTodo onSettled), not this response body.
 *
 * Throws on a non-OK response AND on a malformed success body, so either failure
 * routes to the mutation's onError (which rolls the pending row back) rather than
 * crashing the render — mirrors the read-path malformed-payload guard.
 */
export async function createTodo(body: CreateTodoBody): Promise<Todo> {
  const response = await fetch('/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: body.id, description: body.description }),
  })

  if (!response.ok) {
    throw new Error(`POST /todos failed: ${response.status}`)
  }

  try {
    const parsed: unknown = await response.json()
    if (!isTodo(parsed)) {
      throw new Error('POST /todos returned a malformed response body')
    }
    return parsed
  } catch {
    throw new Error('POST /todos returned a malformed response body')
  }
}
