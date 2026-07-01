import type { ReactNode } from 'react'
import type { Todo } from '@tlf/contracts'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTestQueryClient } from '../test/queryClient'
import { useDeleteTodo } from './useDeleteTodo'

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'a',
    description: 'a task',
    completed: false,
    createdAt: '2026-06-30T09:00:00.000Z',
    updatedAt: '2026-06-30T09:00:00.000Z',
    ...overrides,
  }
}

/*
 * A fetch double branching GET vs DELETE. GET returns the canonical list (used
 * by any onSettled reconcile refetch — none is observed here). DELETE resolves
 * 204 (no body) or, for ids in failIds, rejects with a 500 so onError fires.
 */
function stubFetch(opts: { getList?: () => Todo[]; failIds?: string[] } = {}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init || init.method === undefined || init.method === 'GET') {
      return new Response(JSON.stringify(opts.getList?.() ?? []), { status: 200 })
    }
    const id = _url.split('/').pop() as string
    if (opts.failIds?.includes(id)) {
      return new Response('', { status: 500 })
    }
    return new Response(null, { status: 204 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function setup(client: QueryClient) {
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return renderHook(() => useDeleteTodo(), { wrapper })
}

describe('useDeleteTodo (Story 2.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('onMutate marks the row deleting WITHOUT removing it from the cache (AC 3, honest-pending ≠ optimistic)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [
      todo({ id: 'a', description: 'first' }),
      todo({ id: 'b', description: 'second' }),
    ])
    // Never-resolving DELETE so we can inspect the pending state.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )

    const { result } = setup(client)
    act(() => result.current.deleteTodo('a'))

    await waitFor(() => expect(result.current.deletingIds.has('a')).toBe(true))
    // The row is STILL present — it renders as Committing, not gone.
    const list = client.getQueryData<Todo[]>(['todos']) ?? []
    expect(list.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('on success clears deletingIds and invalidates ["todos"] to reconcile (AC 3)', async () => {
    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    client.setQueryData<Todo[]>(['todos'], [todo({ id: 'a' })])
    stubFetch({ getList: () => [] })

    const { result } = setup(client)
    act(() => result.current.deleteTodo('a'))

    await waitFor(() => expect(result.current.deletingIds.has('a')).toBe(false))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
  })

  it('on error does NOT write the cache (no stale full-snapshot rollback) but still invalidates to reconcile (AC 4, review finding)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [
      todo({ id: 'a', description: 'Buy milk' }),
      todo({ id: 'b', description: 'sibling' }),
    ])
    // Spy AFTER seeding so the seed write is not counted.
    const setSpy = vi.spyOn(client, 'setQueryData')
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    stubFetch({ getList: () => [], failIds: ['a'] })

    const { result } = setup(client)
    act(() => result.current.deleteTodo('a'))

    await waitFor(() => expect(result.current.deletingIds.has('a')).toBe(false))
    // The hook never writes the cache — no optimistic remove means no rollback,
    // so a stale snapshot can never resurrect a sibling a parallel delete removed.
    expect(setSpy).not.toHaveBeenCalled()
    // The row was never removed, so it is never silently lost (AC 4).
    const list = client.getQueryData<Todo[]>(['todos']) ?? []
    expect(list.map((t) => t.id)).toContain('a')
    // Reconciliation is the unconditional invalidate (AC 3, 4).
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
  })

  it('per-row arbitration: a second delete while one is in flight fires no second DELETE (AC 3)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [todo({ id: 'a' })])
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = setup(client)
    act(() => result.current.deleteTodo('a'))
    await waitFor(() => expect(result.current.deletingIds.has('a')).toBe(true))

    // A conflicting second delete of the same row must be a no-op.
    act(() => result.current.deleteTodo('a'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('per-row arbitration blocks same-tick duplicate deletes before React state updates (AC 3)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [todo({ id: 'a' })])
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = setup(client)
    act(() => {
      result.current.deleteTodo('a')
      result.current.deleteTodo('a')
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})
