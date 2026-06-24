import type { CreateTodoBody, Todo } from '@tlf/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTodo } from './todos'

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
})
