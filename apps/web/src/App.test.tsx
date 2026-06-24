import type { Todo } from '@tlf/contracts'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { renderWithClient } from './test/queryClient'

const LOAD_FAILURE_MESSAGE = 'Couldn’t load your list. Refresh to try again.'
const INSTRUCTION_LINE = 'Type a task and press Enter to add it to your list.'
const CAPTURE_PLACEHOLDER = 'What do you want to do?'

// The instruction line stays MOUNTED but retires via aria-hidden + a CSS collapse
// once a task exists (AC 14). aria-hidden="true" on its wrapper is the signal.
function instructionWrap(): HTMLElement {
  const wrap = screen.getByText(INSTRUCTION_LINE).parentElement
  if (!wrap) throw new Error('instruction wrapper not found')
  return wrap
}

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    description: 'A task',
    completed: false,
    createdAt: '2026-06-19T09:00:00.000Z',
    updatedAt: '2026-06-19T09:00:00.000Z',
    ...overrides,
  }
}

function okResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 })
}

describe('App', () => {
  beforeEach(() => {
    document.title = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the loading surface while the initial GET /todos is in flight (AC 1)', () => {
    // A never-resolving fetch keeps the query in its pending state.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )

    renderWithClient(<App />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(document.title).toBe('the long finger')
  })

  it('renders the list and reflects the active count in the title (AC 2, 7)', async () => {
    const todos = [
      todo({ id: 'a', description: 'active one', completed: false }),
      todo({ id: 'b', description: 'active two', completed: false }),
      todo({ id: 'c', description: 'done one', completed: true }),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse(todos)),
    )

    renderWithClient(<App />)

    const list = await screen.findByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    await waitFor(() =>
      expect(document.title).toBe('the long finger (2 active)'),
    )
  })

  it('omits the count from the title when zero tasks are active (AC 7)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([todo({ completed: true })])),
    )

    renderWithClient(<App />)

    // The list still renders (a completed task exists) but the title has no count.
    await screen.findByRole('list')
    await waitFor(() => expect(document.title).toBe('the long finger'))
  })

  it('shows the empty surface and bare title when there are no todos (AC 5, 7)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([])),
    )

    renderWithClient(<App />)

    expect(
      await screen.findByText('Your list will appear here.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(document.title).toBe('the long finger')
  })

  it('shows the failed surface and announces the failure once via the LiveRegion (AC 6)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )

    renderWithClient(<App />)

    // Failed surface with a Retry affordance.
    expect(
      await screen.findByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument()

    // The polite status region carries the failure message exactly once.
    const liveRegions = screen.getAllByRole('status')
    expect(liveRegions).toHaveLength(1)
    expect(liveRegions[0]).toHaveTextContent(LOAD_FAILURE_MESSAGE)
  })

  it('recovers when Retry succeeds (refetch → list) (AC 6)', async () => {
    const user = userEvent.setup()
    const todos = [todo({ id: 'a', description: 'now loaded' })]
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(okResponse(todos))
    vi.stubGlobal('fetch', fetchMock)

    renderWithClient(<App />)

    await user.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('list')).toBeInTheDocument()
    expect(screen.getByText('now loaded')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('App capture-and-confirm (Story 1.7)', () => {
  beforeEach(() => {
    document.title = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // A stateful server double: GET returns the current list; POST creates and
  // makes the subsequent GET (invalidation refetch) return the new task.
  function stubServer(initial: Todo[] = []) {
    let serverTodos = [...initial]
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return okResponse(serverTodos)
      }
      const body = JSON.parse(init.body as string) as {
        id: string
        description: string
      }
      const created: Todo = {
        id: body.id,
        description: body.description,
        completed: false,
        createdAt: '2026-06-23T13:00:00.000Z',
        updatedAt: '2026-06-23T13:00:00.000Z',
      }
      serverTodos = [created, ...serverTodos]
      return new Response(JSON.stringify(created), { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('shows the instruction line on first open, retires it after the first task, and announces "{description} added." once (AC 1, 9, 14)', async () => {
    const user = userEvent.setup()
    stubServer([])
    renderWithClient(<App />)

    // First open (never created): the instruction line is visible (not retired).
    await screen.findByText('Your list will appear here.')
    expect(instructionWrap()).not.toHaveAttribute('aria-hidden', 'true')

    // Capture a task.
    await user.type(
      screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
      'Walk the dog',
    )
    await user.keyboard('{Enter}')

    // The instruction line retires (it stays mounted but goes aria-hidden).
    await waitFor(() =>
      expect(instructionWrap()).toHaveAttribute('aria-hidden', 'true'),
    )

    // The confirmation is announced exactly once via the single LiveRegion.
    const status = screen.getByRole('status')
    await waitFor(() =>
      expect(status).toHaveTextContent('Walk the dog added.'),
    )
  })

  it('does NOT bring the instruction line back when the list later empties (AC 14)', async () => {
    const user = userEvent.setup()
    stubServer([])
    const { client } = renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    await user.type(
      screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
      'A task',
    )
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(instructionWrap()).toHaveAttribute('aria-hidden', 'true'),
    )

    // Simulate the list returning to empty (e.g. a future delete). The
    // instruction line must NOT reappear — only the persistent empty-state line.
    act(() => client.setQueryData<Todo[]>(['todos'], []))

    expect(await screen.findByText('Your list will appear here.')).toBeInTheDocument()
    expect(instructionWrap()).toHaveAttribute('aria-hidden', 'true')
  })
})
