import type { ReactNode } from 'react'
import type { Todo } from '@tlf/contracts'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTestQueryClient } from '../test/queryClient'
import { useToggleTodo } from './useToggleTodo'

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'a',
    description: 'a task',
    completed: false,
    createdAt: '2026-06-25T09:00:00.000Z',
    updatedAt: '2026-06-25T09:00:00.000Z',
    ...overrides,
  }
}

/*
 * A fetch double branching GET vs PATCH. GET returns the canonical server list
 * (used by the onError reconcile refetch). PATCH resolves/rejects based on the
 * id parsed from the URL, so one mock drives mixed-outcome concurrent cases. On
 * success it echoes the toggled Todo with a SERVER updatedAt sentinel, so a test
 * can prove the success write captured the real timestamp in place.
 */
function stubFetch(opts: {
  getList: () => Todo[]
  failIds?: string[]
  patchEcho?: (id: string, completed: boolean) => Todo
}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method === undefined || init.method === 'GET') {
      return new Response(JSON.stringify(opts.getList()), { status: 200 })
    }
    const id = url.split('/').pop() as string
    const body = JSON.parse(init.body as string) as { completed: boolean }
    if (opts.failIds?.includes(id)) {
      return new Response('', { status: 500 })
    }
    const echoed = opts.patchEcho
      ? opts.patchEcho(id, body.completed)
      : ({
          id,
          description: 'a task',
          completed: body.completed,
          createdAt: '2026-06-25T09:00:00.000Z',
          updatedAt: '2026-06-25T12:00:00.000Z',
        } as Todo)
    return new Response(JSON.stringify(echoed), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function setup(client: QueryClient, announce?: (m: string) => void) {
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return renderHook(() => useToggleTodo({ announce }), { wrapper })
}

describe('useToggleTodo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('onMutate tracks the pending destination without changing confirmed data (AC 3, 4, 8)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [
      todo({ id: 'a', description: 'first', completed: false }),
      todo({ id: 'b', description: 'second', completed: false }),
    ])
    // Never-resolving PATCH so we can inspect the optimistic state.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )

    const { result } = setup(client)
    act(() => result.current.toggle('a', true))

    await waitFor(() => {
      expect(result.current.togglingCompletedById.a).toBe(true)
    })
    const list = client.getQueryData<Todo[]>(['todos']) ?? []
    // Position preserved: 'a' is still index 0, 'b' still index 1, length 2.
    expect(list.map((t) => t.id)).toEqual(['a', 'b'])
    // Confirmed data is unchanged until success, so completion styling/title do
    // not move early; the checkbox destination is tracked separately.
    expect(list[0]?.completed).toBe(false)
    expect(list[1]?.completed).toBe(false)
    expect(result.current.togglingCompletedById.a).toBe(true)
  })

  it('announces "{description} marked complete." on success and captures the server updatedAt in place, NOT invalidating (AC 3, 4)', async () => {
    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const announce = vi.fn()
    client.setQueryData<Todo[]>(['todos'], [
      todo({ id: 'a', description: 'Walk the dog', completed: false }),
    ])
    stubFetch({ getList: () => [], failIds: [] })

    const { result } = setup(client, announce)
    act(() => result.current.toggle('a', true))

    await waitFor(() => expect(announce).toHaveBeenCalledTimes(1))
    expect(announce).toHaveBeenCalledWith('Walk the dog marked complete.')

    // Success wrote the server Todo (with its real updatedAt) into the SAME slot.
    await waitFor(() => {
      const list = client.getQueryData<Todo[]>(['todos'])
      expect(list?.[0]?.updatedAt).toBe('2026-06-25T12:00:00.000Z')
    })
    expect(client.getQueryData<Todo[]>(['todos'])?.[0]?.completed).toBe(true)
    // Crucially, success does NOT invalidate (that would re-sort and move it).
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('announces "{description} marked active." when toggling complete → active', async () => {
    const client = createTestQueryClient()
    const announce = vi.fn()
    client.setQueryData<Todo[]>(['todos'], [
      todo({ id: 'a', description: 'Done thing', completed: true }),
    ])
    stubFetch({ getList: () => [] })

    const { result } = setup(client, announce)
    act(() => result.current.toggle('a', false))

    await waitFor(() => expect(announce).toHaveBeenCalledTimes(1))
    expect(announce).toHaveBeenCalledWith('Done thing marked active.')
  })

  it('bails on a cache-evicted row: no PATCH, no empty-disambiguator announcement (Story 3.2 C2)', async () => {
    const client = createTestQueryClient()
    const announce = vi.fn()
    // The acted-on row is NOT in the cache — a stale action on a row a refetch
    // already reconciled away.
    client.setQueryData<Todo[]>(['todos'], [
      todo({ id: 'b', description: 'other', completed: false }),
    ])
    const fetchMock = stubFetch({ getList: () => [] })

    const { result } = setup(client, announce)
    act(() => result.current.toggle('a', true))

    await waitFor(() =>
      expect(Object.keys(result.current.togglingCompletedById)).toHaveLength(0),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(announce).not.toHaveBeenCalled()
  })

  it('on error reverts THIS row in place and invalidates to reconcile, announcing the failure once (AC 5)', async () => {
    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const announce = vi.fn()
    client.setQueryData<Todo[]>(['todos'], [
      todo({ id: 'a', description: 'Buy milk', completed: false }),
    ])
    // No observer is mounted, so the invalidate does not actually refetch — the
    // in-place revert is what we inspect directly.
    stubFetch({ getList: () => [], failIds: ['a'] })

    const { result } = setup(client, announce)
    act(() => result.current.toggle('a', true))

    await waitFor(() => expect(announce).toHaveBeenCalledTimes(1))
    expect(announce).toHaveBeenCalledWith(
      'Couldn’t update ‘Buy milk’. The list refreshed to current state.',
    )
    // Confirmed data remains/reconciles to the backend-confirmed completed:false.
    expect(client.getQueryData<Todo[]>(['todos'])?.[0]?.completed).toBe(false)
    // Reconciled via invalidate (the AC 5 refetch).
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })
    expect(Object.keys(result.current.togglingCompletedById)).toHaveLength(0)
  })

  it('mixed-outcome concurrent toggles on different rows do not cross-contaminate (AC 8)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [
      todo({ id: 'good', description: 'good', completed: false }),
      todo({ id: 'bad', description: 'bad', completed: false }),
    ])
    stubFetch({ getList: () => [], failIds: ['bad'] })

    const { result } = setup(client)
    act(() => {
      result.current.toggle('good', true)
      result.current.toggle('bad', true)
    })

    await waitFor(() =>
      expect(Object.keys(result.current.togglingCompletedById)).toHaveLength(0),
    )
    const list = client.getQueryData<Todo[]>(['todos']) ?? []
    const byId = Object.fromEntries(list.map((t) => [t.id, t.completed]))
    // The success persists; the failure did not clear the success.
    expect(byId.good).toBe(true)
    expect(byId.bad).toBe(false)
  })

  it('per-row arbitration: a second toggle while one is in flight fires no second PATCH (AC 8)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [
      todo({ id: 'a', description: 'a task', completed: false }),
    ])
    // Never-resolving PATCH keeps the first toggle in flight.
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = setup(client)
    act(() => result.current.toggle('a', true))
    await waitFor(() =>
      expect(result.current.togglingCompletedById.a).toBe(true),
    )

    // A conflicting second toggle of the same row must be a no-op.
    act(() => result.current.toggle('a', false))

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('per-row arbitration blocks same-tick duplicate toggles before React state updates (AC 8)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [
      todo({ id: 'a', description: 'a task', completed: false }),
    ])
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = setup(client)
    act(() => {
      result.current.toggle('a', true)
      result.current.toggle('a', false)
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})
