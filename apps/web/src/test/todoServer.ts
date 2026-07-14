import type { Todo } from '@tlf/contracts'
import { vi } from 'vitest'

// Fixed server-side stamp for rows the stub creates or updates. No App test
// asserts stamp values; GET ordering is purely prepend-based, so the stamps
// carry no ordering semantics — don't build assertions on them.
const SERVER_STAMP = '2026-07-14T12:00:00.000Z'

export function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    description: 'A task',
    completed: false,
    createdAt: '2026-06-19T09:00:00.000Z',
    updatedAt: '2026-06-19T09:00:00.000Z',
    ...overrides,
  }
}

export function okResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 })
}

type MutationMethod = 'POST' | 'PATCH' | 'DELETE'

/*
 * The parameterized stateful server double shared by the App.*.test.tsx suites
 * (modeled on useCreateTodo.test.tsx's stubFetch; extracted because the
 * per-story copies had drifted into verbatim duplicates). Installs itself as
 * the global fetch via vi.stubGlobal — consuming suites must run
 * vi.unstubAllGlobals() in afterEach. One-off behaviors (deferred PATCH,
 * fail-next-POST, per-description release) stay suite-local by design; add an
 * option here only when a second suite needs the same behavior.
 *
 * GET    → always served: the current list, so invalidation refetches observe
 *          prior mutations.
 * Non-GET → served only when listed in `allow` (or POST via `failCreates`);
 *          anything else throws, so a flow that issues an unexpected mutation
 *          fails loudly instead of being silently absorbed.
 * POST   → prepends and echoes the created row (201) — or 500s every create
 *          when `failCreates` is set (the failed-create suites' double).
 * PATCH  → flips the matching row's completed, stamps updatedAt, returns it.
 * DELETE → DEFERRED: resolves only when releaseDelete() is called, so the
 *          Committing (aria-busy) state is observable before the settle
 *          refetch drops the row (honest-pending, Story 2.1). The releasing
 *          DELETE removes the id, so the refetch returns without it. Single
 *          in-flight DELETE only — wait for aria-busy before releasing.
 */
export function stubTodoServer(
  options: {
    initial?: Todo[]
    failCreates?: boolean
    allow?: MutationMethod[]
  } = {},
) {
  let serverTodos = [...(options.initial ?? [])]
  let pendingDelete: (() => void) | undefined
  const allowed = new Set<string>(options.allow ?? [])
  if (options.failCreates) allowed.add('POST')

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method === 'GET') return okResponse(serverTodos)
    if (!allowed.has(method)) {
      throw new Error(`stubTodoServer: unexpected ${method}`)
    }
    if (method === 'POST') {
      if (options.failCreates) return new Response('', { status: 500 })
      const body = JSON.parse(init?.body as string) as {
        id: string
        description: string
      }
      const created: Todo = {
        id: body.id,
        description: body.description,
        completed: false,
        createdAt: SERVER_STAMP,
        updatedAt: SERVER_STAMP,
      }
      serverTodos = [created, ...serverTodos]
      return new Response(JSON.stringify(created), { status: 201 })
    }
    if (method === 'PATCH') {
      const id = String(url).split('/').pop() as string
      const body = JSON.parse(init?.body as string) as { completed: boolean }
      const updated = serverTodos.find((t) => t.id === id)
      if (!updated) throw new Error(`stubTodoServer: PATCH for unknown id ${id}`)
      serverTodos = serverTodos.map((t) =>
        t.id === id
          ? { ...t, completed: body.completed, updatedAt: SERVER_STAMP }
          : t,
      )
      return okResponse(serverTodos.find((t) => t.id === id))
    }
    // DELETE
    const id = String(url).split('/').pop() as string
    return new Promise<Response>((resolve) => {
      pendingDelete = () => {
        serverTodos = serverTodos.filter((t) => t.id !== id)
        resolve(new Response(null, { status: 204 }))
      }
    })
  })
  vi.stubGlobal('fetch', fetchMock)

  return {
    fetchMock,
    // Settle the in-flight DELETE. Throws if none is pending (release before
    // the DELETE is wired — wait for aria-busy first) or on a double release.
    releaseDelete: () => {
      if (!pendingDelete) {
        throw new Error('stubTodoServer: no DELETE in flight to release')
      }
      const release = pendingDelete
      pendingDelete = undefined
      release()
    },
  }
}
