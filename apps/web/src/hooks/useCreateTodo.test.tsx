import type { ReactNode } from 'react'
import type { Todo } from '@tlf/contracts'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTestQueryClient } from '../test/queryClient'
import { CREATE_TIMEOUT_MS, useCreateTodo } from './useCreateTodo'
import type { PendingClock } from './usePendingPresentation'
import { useTodos } from './useTodos'

/*
 * A controllable clock implementing PendingClock (Story 1.9): the test advances
 * `now` to simulate a wall-clock time jump (backgrounded tab / laptop sleep) and
 * fires due timers manually — no real wall-clock waits. Mirrors the injectable
 * clock seam the honest-pending presentation uses.
 */
function makeFakeClock(start = 0) {
  let now = start
  let nextId = 1
  const timers = new Map<number, { fn: () => void; at: number }>()
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++
      timers.set(id, { fn, at: now + ms })
      return id
    },
    clearTimeout: (handle: unknown) => {
      timers.delete(handle as number)
    },
    advance(ms: number) {
      now += ms
    },
    /** Fire every timer whose deadline has been reached. */
    runDue() {
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id)
          timer.fn()
        }
      }
    },
  } satisfies PendingClock & {
    advance(ms: number): void
    runDue(): void
  }
}

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

function setup(
  client: QueryClient,
  announce?: (m: string) => void,
  clock?: PendingClock,
) {
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return renderHook(() => useCreateTodo({ announce, clock }), { wrapper })
}

// Variant that also mounts a useTodos OBSERVER, so onSettled's invalidation
// actually refetches (invalidateQueries only refetches active queries) — needed
// to prove the settle reflects the GET refetch, not a merge of the POST body.
function setupWithObserver(
  client: QueryClient,
  announce?: (m: string) => void,
  clock?: PendingClock,
) {
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return renderHook(
    () => ({ create: useCreateTodo({ announce, clock }), list: useTodos() }),
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

describe('useCreateTodo failed-create recovery (Story 1.9)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const FAIL_MESSAGE = (description: string) =>
    `Couldn’t save ‘${description}’. Use Retry to try again.`

  it('keeps a failed create as a Failed row (in failedCreates, out of the cache) and announces once (AC 1, 4)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [existing()])
    stubFetch({ getList: () => [existing()], failDescriptions: ['doomed'] })
    const announce = vi.fn()

    const { result } = setup(client, announce)
    act(() => result.current.submit('doomed'))

    await waitFor(() =>
      expect(result.current.failedCreates.map((t) => t.description)).toEqual([
        'doomed',
      ]),
    )
    // Removed from the cache (the existing row survives); pending cleared.
    expect(client.getQueryData<Todo[]>(['todos'])).toEqual([existing()])
    expect(result.current.pendingIds.size).toBe(0)
    // Announced exactly once with the curly-quoted copy.
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith(FAIL_MESSAGE('doomed'))
  })

  it('retry re-fires with the SAME id and on success clears the failed row + announces "added" (AC 2)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [])
    let failNext = true
    const postIds: string[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      const body = JSON.parse(init.body as string) as {
        id: string
        description: string
      }
      postIds.push(body.id)
      if (failNext) {
        failNext = false
        return new Response('', { status: 500 })
      }
      return new Response(
        JSON.stringify({
          id: body.id,
          description: body.description,
          completed: false,
          createdAt: '2026-06-28T10:00:00.000Z',
          updatedAt: '2026-06-28T10:00:00.000Z',
        }),
        { status: 201 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const announce = vi.fn()

    const { result } = setup(client, announce)
    act(() => result.current.submit('retry me'))

    await waitFor(() =>
      expect(result.current.failedCreates.map((t) => t.description)).toContain(
        'retry me',
      ),
    )
    const id = result.current.failedCreates[0]!.id

    act(() => result.current.retry(id))

    await waitFor(() => expect(result.current.failedCreates).toHaveLength(0))
    // The SAME id was used on the original POST and on the retry POST.
    expect(postIds).toEqual([id, id])
    expect(announce).toHaveBeenCalledWith('retry me added.')
  })

  it('a retry that fails again does NOT re-announce (AC 4)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [])
    // POST always 500s.
    stubFetch({ getList: () => [], failDescriptions: ['always fails'] })
    const announce = vi.fn()

    const { result } = setup(client, announce)
    act(() => result.current.submit('always fails'))

    await waitFor(() =>
      expect(result.current.failedCreates.map((t) => t.description)).toContain(
        'always fails',
      ),
    )
    expect(announce).toHaveBeenCalledTimes(1)
    const id = result.current.failedCreates[0]!.id

    act(() => result.current.retry(id))

    // It fails again and re-appears as a failed row...
    await waitFor(() =>
      expect(result.current.failedCreates.map((t) => t.description)).toContain(
        'always fails',
      ),
    )
    // ...but the announce-once guard survived the retry: still announced ONCE.
    expect(announce).toHaveBeenCalledTimes(1)
  })

  it('mixed-outcome: a sibling success and its invalidation do NOT wipe the failed row (AC 8)', async () => {
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [])
    // GET (the success's invalidation refetch) returns ONLY the good server row —
    // never the failed-only optimistic row. If the failed row lived in the cache
    // this refetch would wipe it; it lives in failedCreates, so it survives.
    stubFetch({
      getList: () => [
        {
          id: 'good-srv',
          description: 'good',
          completed: false,
          createdAt: '2026-06-28T12:00:00.000Z',
          updatedAt: '2026-06-28T12:00:00.000Z',
        },
      ],
      failDescriptions: ['bad'],
    })
    const announce = vi.fn()

    const { result } = setupWithObserver(client, announce)
    act(() => {
      result.current.create.submit('good')
      result.current.create.submit('bad')
    })

    // 'bad' surfaces as a failed row...
    await waitFor(() =>
      expect(
        result.current.create.failedCreates.map((t) => t.description),
      ).toContain('bad'),
    )
    // ...and the success's invalidation refetch lands without removing it.
    await waitFor(() => {
      const cache = client.getQueryData<Todo[]>(['todos']) ?? []
      expect(cache.map((t) => t.description)).toContain('good')
    })
    expect(
      result.current.create.failedCreates.map((t) => t.description),
    ).toContain('bad')
    // The good row is the server truth, never a failed row in the cache.
    const cache = client.getQueryData<Todo[]>(['todos']) ?? []
    expect(cache.map((t) => t.description)).not.toContain('bad')
  })

  it('the wall-clock timeout fails a still-pending create via the armed timer, WITHOUT aborting it (AC 6)', async () => {
    const clock = makeFakeClock()
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [])
    let capturedSignal: AbortSignal | null = null
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      capturedSignal = init.signal ?? null
      // Never resolves — the request stays in flight while the timeout fires.
      return new Promise<Response>(() => {})
    })
    vi.stubGlobal('fetch', fetchMock)
    const announce = vi.fn()

    const { result } = setup(client, announce, clock)
    act(() => result.current.submit('slow task'))

    await waitFor(() =>
      expect(client.getQueryData<Todo[]>(['todos'])).toHaveLength(1),
    )

    // Jump past the deadline and fire the armed timer.
    act(() => {
      clock.advance(CREATE_TIMEOUT_MS + 1)
      clock.runDue()
    })

    await waitFor(() =>
      expect(result.current.failedCreates.map((t) => t.description)).toContain(
        'slow task',
      ),
    )
    // Out of the cache, announced once, and NOT aborted (timeout transitions the
    // UI only; only Dismiss aborts).
    expect(client.getQueryData<Todo[]>(['todos'])).toEqual([])
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith(FAIL_MESSAGE('slow task'))
    expect((capturedSignal as AbortSignal | null)?.aborted).toBe(false)
  })

  it('the timeout also fires on visibilitychange after a backgrounded time jump (AC 6)', async () => {
    const clock = makeFakeClock()
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [])
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      return new Promise<Response>(() => {})
    })
    vi.stubGlobal('fetch', fetchMock)
    // jsdom's default visibilityState is not reliably 'visible'; pin it so the
    // foreground re-check path runs.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })

    const { result } = setup(client, vi.fn(), clock)
    act(() => result.current.submit('woke from sleep'))
    await waitFor(() =>
      expect(client.getQueryData<Todo[]>(['todos'])).toHaveLength(1),
    )

    // The tab was backgrounded across the deadline (the armed setTimeout is
    // throttled/suspended — we deliberately do NOT runDue). On foreground the
    // visibilitychange re-check immediately fails the over-deadline row.
    act(() => {
      clock.advance(CREATE_TIMEOUT_MS + 1)
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() =>
      expect(result.current.failedCreates.map((t) => t.description)).toContain(
        'woke from sleep',
      ),
    )
  })

  it('dismiss removes a failed row and aborts its still-in-flight request (AC 3)', async () => {
    const clock = makeFakeClock()
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [])
    let aborted = false
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          aborted = true
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const announce = vi.fn()

    const { result } = setup(client, announce, clock)
    act(() => result.current.submit('cancel me'))
    await waitFor(() =>
      expect(client.getQueryData<Todo[]>(['todos'])).toHaveLength(1),
    )

    // Timeout → failed, request still in flight (controller still alive).
    act(() => {
      clock.advance(CREATE_TIMEOUT_MS + 1)
      clock.runDue()
    })
    await waitFor(() =>
      expect(result.current.failedCreates).toHaveLength(1),
    )
    expect(announce).toHaveBeenCalledTimes(1)
    const id = result.current.failedCreates[0]!.id

    await act(async () => {
      result.current.dismiss(id)
      // Let the aborted fetch reject and its onError/onSettled run.
      await Promise.resolve()
    })

    expect(aborted).toBe(true)
    await waitFor(() => expect(result.current.failedCreates).toHaveLength(0))
    expect(result.current.pendingIds.size).toBe(0)
    expect(client.getQueryData<Todo[]>(['todos'])).toEqual([])
    // The late AbortError did NOT re-announce or re-add the row.
    expect(announce).toHaveBeenCalledTimes(1)
  })

  it('a late success after a timeout→failed clears the failed row (AC 6 lifecycle)', async () => {
    const clock = makeFakeClock()
    const client = createTestQueryClient()
    client.setQueryData<Todo[]>(['todos'], [])
    let resolvePost: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      const body = JSON.parse(init.body as string) as {
        id: string
        description: string
      }
      return new Promise<Response>((resolve) => {
        resolvePost = () =>
          resolve(
            new Response(
              JSON.stringify({
                id: body.id,
                description: body.description,
                completed: false,
                createdAt: '2026-06-28T14:00:00.000Z',
                updatedAt: '2026-06-28T14:00:00.000Z',
              }),
              { status: 201 },
            ),
          )
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const announce = vi.fn()

    const { result } = setup(client, announce, clock)
    act(() => result.current.submit('eventually saves'))
    await waitFor(() =>
      expect(client.getQueryData<Todo[]>(['todos'])).toHaveLength(1),
    )

    act(() => {
      clock.advance(CREATE_TIMEOUT_MS + 1)
      clock.runDue()
    })
    await waitFor(() => expect(result.current.failedCreates).toHaveLength(1))

    // The original request finally succeeds — the failed row clears.
    await act(async () => {
      resolvePost?.(new Response('', { status: 201 }))
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.failedCreates).toHaveLength(0))
    expect(announce).toHaveBeenCalledWith('eventually saves added.')
  })
})
