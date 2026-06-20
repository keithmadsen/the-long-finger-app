import { useQuery } from '@tanstack/react-query'

import { getTodos } from '../api/todos'

/*
 * The list read hook. The single stable query key ['todos'] is the cache anchor
 * the whole app shares — every later mutation (Stories 1.7/1.8, Epic 2) does its
 * pending update then invalidates this EXACT key, so getting it right now is
 * load-bearing (architecture.md Query keys).
 *
 * Returns the query result as-is — data stays in backend order; nothing here
 * re-sorts it (AC 8). <App> branches on isPending / isError and calls refetch
 * for the load-failed Retry (AC 1, 6).
 */
export function useTodos() {
  return useQuery({
    queryKey: ['todos'],
    queryFn: getTodos,
  })
}
