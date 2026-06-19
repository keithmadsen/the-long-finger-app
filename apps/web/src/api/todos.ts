import type { Todo } from '@tlf/contracts'

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
