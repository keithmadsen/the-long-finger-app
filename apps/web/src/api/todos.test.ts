import type { CreateTodoBody, Todo } from '@tlf/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTodo, deleteTodo, patchTodo } from './todos'

const BODY: CreateTodoBody = {
  id: '0190ff8c-3e5a-7c1d-8b2e-1a2b3c4d5e6f',
  description: 'Buy milk',
}

const CREATED: Todo = {
  ...BODY,
  completed: false,
  createdAt: '2026-06-23T09:00:00.000Z',
  updatedAt: '2026-06-23T09:00:00.000Z',
}

describe('createTodo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs { id, description } as JSON to /todos and returns the parsed Todo', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(CREATED), { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await createTodo(BODY)

    expect(result).toEqual(CREATED)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe('/todos')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )
    // Exactly { id, description } — no timestamps/completed leaked.
    expect(JSON.parse(init.body as string)).toEqual({
      id: BODY.id,
      description: BODY.description,
    })
  })

  it('accepts the idempotent 200 response (existing Todo) as success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(CREATED), { status: 200 })),
    )

    await expect(createTodo(BODY)).resolves.toEqual(CREATED)
  })

  it('throws on a non-OK response so the mutation onError fires (negative path)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 400 })),
    )

    await expect(createTodo(BODY)).rejects.toThrow(/400/)
  })

  it('rejects (does not crash) on a malformed 2xx body — routes to onError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json at all', { status: 201 })),
    )

    await expect(createTodo(BODY)).rejects.toThrow()
  })

  it('rejects a 2xx body that is JSON but not a Todo shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ id: BODY.id }), { status: 201 }),
      ),
    )

    await expect(createTodo(BODY)).rejects.toThrow(
      'POST /todos returned a malformed response body',
    )
  })

  it('forwards the AbortSignal to fetch (Story 1.9 AC 3)', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(CREATED), { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await createTodo(BODY, controller.signal)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })

  it('lets an aborted fetch reject with the AbortError un-wrapped (name preserved) (Story 1.9 AC 3)', async () => {
    // fetch itself throws a DOMException named 'AbortError' when the signal is
    // aborted — BEFORE the response.ok check. createTodo must NOT wrap it, so the
    // mutation's onError can detect it by name and skip the failed-row cleanup.
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      return new Response(JSON.stringify(CREATED), { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()

    await expect(createTodo(BODY, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})

describe('patchTodo (Story 1.8)', () => {
  const TOGGLED: Todo = { ...CREATED, completed: true }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('PATCHes { completed } as JSON to /todos/:id and returns the parsed Todo', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(TOGGLED), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await patchTodo(BODY.id, { completed: true })

    expect(result).toEqual(TOGGLED)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe(`/todos/${BODY.id}`)
    expect(init.method).toBe('PATCH')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )
    // Exactly { completed } — nothing else is sent.
    expect(JSON.parse(init.body as string)).toEqual({ completed: true })
  })

  it('throws on a non-OK response so the mutation onError fires (e.g. 404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )

    await expect(patchTodo(BODY.id, { completed: true })).rejects.toThrow(/404/)
  })

  it('rejects (does not crash) on a malformed 2xx body — routes to onError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json at all', { status: 200 })),
    )

    await expect(patchTodo(BODY.id, { completed: true })).rejects.toThrow(
      'PATCH /todos returned a malformed response body',
    )
  })

  it('rejects a 2xx body that is JSON but not a Todo shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: BODY.id }), { status: 200 }),
      ),
    )

    await expect(patchTodo(BODY.id, { completed: true })).rejects.toThrow(
      'PATCH /todos returned a malformed response body',
    )
  })

  it('rejects a 2xx Todo body for a different id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...TOGGLED, id: 'different-id' }), {
            status: 200,
          }),
      ),
    )

    await expect(patchTodo(BODY.id, { completed: true })).rejects.toThrow(
      'PATCH /todos returned a malformed response body',
    )
  })
})

describe('deleteTodo (Story 2.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DELETEs to /todos/:id and resolves undefined on a 204 (no body parsed)', async () => {
    const jsonSpy = vi.fn()
    const fetchMock = vi.fn(async () => {
      const res = new Response(null, { status: 204 })
      // Prove the wrapper never touches the body on the 204 path (AC 8).
      Object.defineProperty(res, 'json', { value: jsonSpy })
      return res
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteTodo(BODY.id)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/todos/${BODY.id}`)
    expect(init.method).toBe('DELETE')
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it('throws on a non-OK response so the mutation onError fires (e.g. 500)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )

    await expect(deleteTodo(BODY.id)).rejects.toThrow(/500/)
  })

  it('throws on an unexpected 2xx (only 204 confirms a delete) (review finding)', async () => {
    // A backend regression returning 200 must NOT be silently accepted as a
    // confirmed delete — the 204 contract is strict.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    )

    await expect(deleteTodo(BODY.id)).rejects.toThrow(/200/)
  })
})
