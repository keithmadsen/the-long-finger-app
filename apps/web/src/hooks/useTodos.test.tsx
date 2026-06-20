import type { Todo } from '@tlf/contracts'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTestQueryClient } from '../test/queryClient'
import { useTodos } from './useTodos'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// Two todos in a deliberately NON-canonical, backend-decided order, so the
// "preserve order verbatim" assertion (AC 8) is meaningful — if anything
// re-sorted, this order would change.
const TODOS: Todo[] = [
  {
    id: 'b',
    description: 'second as the backend returned it',
    completed: false,
    createdAt: '2026-06-19T10:00:00.000Z',
    updatedAt: '2026-06-19T10:00:00.000Z',
  },
  {
    id: 'a',
    description: 'first as the backend returned it',
    completed: true,
    createdAt: '2026-06-19T09:00:00.000Z',
    updatedAt: '2026-06-19T09:30:00.000Z',
  },
]

function stubFetchOk(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
  )
}

function stubFetchStatus(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status })),
  )
}

function wrapper({ children }: { children: ReactNode }) {
  const client = createTestQueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useTodos', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the backend Todo[] in the exact order received (AC 8)', async () => {
    stubFetchOk(TODOS)

    const { result } = renderHook(() => useTodos(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(TODOS)
    // Order preserved verbatim — ids in the backend's returned sequence.
    expect(result.current.data?.map((todo) => todo.id)).toEqual(['b', 'a'])
  })

  it('surfaces isError on a non-OK response (negative path, AC 6)', async () => {
    stubFetchStatus(500)

    const { result } = renderHook(() => useTodos(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
