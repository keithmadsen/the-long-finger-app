import type { ReactNode } from 'react'
import type { Todo } from '@tlf/contracts'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTestQueryClient } from '../test/queryClient'
import { useCreateTodo } from './useCreateTodo'
import { useTodos } from './useTodos'

function existing(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'existing-1',
    description: 'already here',
    completed: false,
    createdAt: '2026-06-20T09:00:00.000Z',
    updatedAt: '2026-06-20T09:00:00.000Z',
    ...overrides,
  }
}

/*
 * A fetch double that branches GET vs POST. GET returns the canonical server
 * list (used by the onSettled invalidation refetch); POST resolves/rejects based
 * on the submitted description, so a single mock drives mixed-outcome cases.
 */
function stubFetch(opts: {
  getList: () => Todo[]
  failDescriptions?: string[]
  postEcho?: (body: { id: string; description: string }) => Todo
}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init || init.method === undefined || init.method === 'GET') {
      return new Response(JSON.stringify(opts.getList()), { status: 200 })
    }
    const body = JSON.parse(init.body as string) as {
      id: string
      description: string
    }
    if (opts.failDescriptions?.includes(body.description)) {
      return new Response('', { status: 500 })
    }
    const echoed = opts.postEcho
      ? opts.postEcho(body)
      : ({
          id: body.id,
          description: body.description,
          completed: false,
          createdAt: '2026-06-23T10:00:00.000Z',
          updatedAt: '2026-06-23T10:00:00.000Z',
        } as Todo)
    return new Response(JSON.stringify(echoed), { status: 201 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function setup(client: QueryClient, announce?: (m: string) => void) {
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return renderHook(() => useCreateTodo({ announce }), { wrapper })
}

// Variant that also mounts a useTodos OBSERVER, so onSettled's invalidation
// actually refetches (invalidateQueries only refetches active queries) — needed
// to prove the settle reflects the GET refetch, not a merge of the POST body.
function setupWithObserver(client: QueryClient, announce?: (m: string) => void) {
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return renderHook(
    () => ({ create: useCreateTodo({ announce }), list: useTodos() }),
    { wrapper },
  )
}

describe('useCreateTodo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('onMutate writes a pending Todo to the TOP of the cache and tracks its id (AC 8)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [existing()])
    // Never-resolving POST so we can inspect the pending state before settle.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )

    const { result } = setup(client)
    act(() => result.current.submit('new task'))

    await waitFor(() => {
      const list = client.getQueryData<Todo[]>(['todos'])
      expect(list?.[0]?.description).toBe('new task')
    })
    const list = client.getQueryData<Todo[]>(['todos']) ?? []
    expect(list).toHaveLength(2)
    const pendingRow = list[0]!
    expect(pendingRow.completed).toBe(false)
    expect(result.current.pendingIds.has(pendingRow.id)).toBe(true)
    // Existing row is untouched and still present.
    expect(list[1]).toEqual(existing())
  })

  it('announces "{description} added." once on success, settles via invalidate NOT merge (AC 9, 12)', async () => {
    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const announce = vi.fn()
    // The server (GET refetch) returns the canonical truth: the new task with
    // SERVER timestamps. The POST echoes a SENTINEL we must NOT see in the cache.
    const serverTruth = (): Todo[] => [
      {
        id: 'srv',
        description: 'new task',
        completed: false,
        createdAt: '2026-06-23T11:11:11.000Z',
        updatedAt: '2026-06-23T11:11:11.000Z',
      },
    ]
    stubFetch({
      getList: serverTruth,
      postEcho: (body) =>
        ({
          id: body.id,
          description: 'SERVER-ECHO-DO-NOT-MERGE',
          completed: false,
          createdAt: 'x',
          updatedAt: 'x',
        }) as Todo,
    })

    const { result } = setupWithObserver(client, announce)
    act(() => result.current.create.submit('new task'))

    await waitFor(() => expect(announce).toHaveBeenCalledTimes(1))
    expect(announce).toHaveBeenCalledWith('new task added.')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] })

    // Final cache is the GET refetch, never the POST echo body (no merge).
    await waitFor(() => {
      const list = client.getQueryData<Todo[]>(['todos'])
      expect(list?.[0]?.createdAt).toBe('2026-06-23T11:11:11.000Z')
    })
    const flat = JSON.stringify(client.getQueryData<Todo[]>(['todos']))
    expect(flat).not.toContain('SERVER-ECHO-DO-NOT-MERGE')
  })

  it('onError removes ONLY its own optimistic row and clears its pending id (AC 8, 13)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [existing()])
    // GET refetch keeps returning just the existing row (the failed create never persisted).
    stubFetch({ getList: () => [existing()], failDescriptions: ['doomed'] })

    const { result } = setup(client)
    act(() => result.current.submit('doomed'))

    await waitFor(() => {
      const list = client.getQueryData<Todo[]>(['todos'])
      // The failed optimistic row is gone; the existing row survives.
      expect(list).toEqual([existing()])
    })
    expect(result.current.pendingIds.size).toBe(0)
  })

  it('mixed-outcome concurrent: the success survives and the failure rolls back, no cross-contamination (AC 13)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [])
    // GET refetch returns only the surviving "good" todo (server truth).
    stubFetch({
      getList: () => [
        {
          id: 'good-srv',
          description: 'good',
          completed: false,
          createdAt: '2026-06-23T12:00:00.000Z',
          updatedAt: '2026-06-23T12:00:00.000Z',
        },
      ],
      failDescriptions: ['bad'],
    })

    const { result } = setup(client)
    act(() => {
      result.current.submit('good')
      result.current.submit('bad')
    })

    // After both resolve: the success persists, the failure is gone, and the
    // failure's rollback did not clear the success.
    await waitFor(() => {
      const list = client.getQueryData<Todo[]>(['todos']) ?? []
      const descriptions = list.map((t) => t.description)
      expect(descriptions).toContain('good')
      expect(descriptions).not.toContain('bad')
    })
    expect(result.current.pendingIds.size).toBe(0)
  })
})
