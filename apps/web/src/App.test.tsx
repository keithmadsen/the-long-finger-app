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
    expect(instructionWrap()).toHaveAttribute('aria-hidden', 'true')
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
    await waitFor(() => expect(status).toHaveTextContent('Walk the dog added.'))
  })

  it('does NOT bring the instruction line back when the list later empties (AC 14)', async () => {
    const user = userEvent.setup()
    stubServer([])
    const { client } = renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    await user.type(screen.getByPlaceholderText(CAPTURE_PLACEHOLDER), 'A task')
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(instructionWrap()).toHaveAttribute('aria-hidden', 'true'),
    )

    // Simulate the list returning to empty (e.g. a future delete). The
    // instruction line must NOT reappear — only the persistent empty-state line.
    act(() => client.setQueryData<Todo[]>(['todos'], []))

    expect(
      await screen.findByText('Your list will appear here.'),
    ).toBeInTheDocument()
    expect(instructionWrap()).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('App toggle (Story 1.8)', () => {
  beforeEach(() => {
    document.title = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // A stateful server double: GET returns the current list; PATCH flips the
  // matching row's completed and stamps a new updatedAt, returning the Todo.
  function stubServer(initial: Todo[]) {
    let serverTodos = [...initial]
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return okResponse(serverTodos)
      }
      const id = url.split('/').pop() as string
      const body = JSON.parse(init.body as string) as { completed: boolean }
      serverTodos = serverTodos.map((t) =>
        t.id === id
          ? {
              ...t,
              completed: body.completed,
              updatedAt: '2026-06-25T15:00:00.000Z',
            }
          : t,
      )
      const updated = serverTodos.find((t) => t.id === id)
      return new Response(JSON.stringify(updated), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('toggling a row issues a PATCH, settles IN PLACE, announces, and updates the title active count (AC 1, 3, 4, 6)', async () => {
    const user = userEvent.setup()
    const fetchMock = stubServer([
      todo({ id: 'a', description: 'active one', completed: false }),
      todo({ id: 'b', description: 'active two', completed: false }),
    ])

    renderWithClient(<App />)

    const list = await screen.findByRole('list')
    await waitFor(() =>
      expect(document.title).toBe('the long finger (2 active)'),
    )

    await user.click(within(list).getAllByRole('checkbox')[0]!)

    // A PATCH was issued for row 'a'.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) =>
            (i as RequestInit | undefined)?.method === 'PATCH' &&
            String(u).endsWith('/todos/a'),
        ),
      ).toBe(true),
    )

    // Announced once via the single LiveRegion.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'active one marked complete.',
      ),
    )

    // Title reflects one active now.
    await waitFor(() =>
      expect(document.title).toBe('the long finger (1 active)'),
    )

    // Settled IN PLACE: still two rows, 'active one' still first (no re-sort,
    // no invalidation moved it mid-session).
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent(
      'active one',
    )
  })

  it('keeps the active-count title confirmed until PATCH succeeds (AC 6)', async () => {
    const user = userEvent.setup()
    let resolvePatch: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return okResponse([
          todo({ id: 'a', description: 'active one', completed: false }),
          todo({ id: 'b', description: 'active two', completed: false }),
        ])
      }
      return new Promise<Response>((resolve) => {
        resolvePatch = resolve
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithClient(<App />)

    const list = await screen.findByRole('list')
    await waitFor(() =>
      expect(document.title).toBe('the long finger (2 active)'),
    )

    await user.click(within(list).getAllByRole('checkbox')[0]!)

    expect(document.title).toBe('the long finger (2 active)')

    act(() =>
      resolvePatch?.(
        okResponse(
          todo({
            id: 'a',
            description: 'active one',
            completed: true,
            updatedAt: '2026-06-25T15:00:00.000Z',
          }),
        ),
      ),
    )

    await waitFor(() =>
      expect(document.title).toBe('the long finger (1 active)'),
    )
  })

  it('a failed toggle announces the failure once and the row reconciles to backend state (AC 5)', async () => {
    const user = userEvent.setup()
    // GET returns the active row; PATCH always 500s. The reconcile refetch keeps
    // returning the active row, so the toggle does not silently persist.
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return okResponse([
          todo({ id: 'a', description: 'Buy milk', completed: false }),
        ])
      }
      return new Response('', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithClient(<App />)

    const list = await screen.findByRole('list')
    await user.click(within(list).getAllByRole('checkbox')[0]!)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Couldn’t update “Buy milk”. The list refreshed to current state.',
      ),
    )

    // Reconciled: the row is active again (the failed toggle did not persist).
    await waitFor(() =>
      expect(within(list).getAllByRole('checkbox')[0]!).not.toBeChecked(),
    )
  })
})

describe('App failed-create recovery (Story 1.9)', () => {
  beforeEach(() => {
    document.title = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const FAILED_HELP_TEXT =
    'Your typed text is saved here until you retry, dismiss, or refresh.'

  // GET returns the (empty) server list; POST always 500s so the create fails.
  function stubFailingCreate() {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return okResponse([])
      }
      return new Response('', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('a failed create surfaces a Failed row on an otherwise-empty list, announces once, and exposes the hidden help text (AC 1, 4, 5)', async () => {
    const user = userEvent.setup()
    stubFailingCreate()
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    await user.type(screen.getByPlaceholderText(CAPTURE_PLACEHOLDER), 'save me')
    await user.keyboard('{Enter}')

    // The Failed row renders (Retry + Dismiss) even though the server list is empty.
    expect(
      await screen.findByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    expect(screen.getByText('save me')).toBeInTheDocument()
    // The empty-state is NOT shown — a lone failed row is a populated list.
    expect(
      screen.queryByText('Your list will appear here.'),
    ).not.toBeInTheDocument()

    // Announced once via the single LiveRegion.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Couldn’t save ‘save me’. Use Retry to try again.',
      ),
    )

    // The shared hidden help text exists and the failed row references it (AC 5).
    const help = document.getElementById('failed-create-help')
    expect(help).not.toBeNull()
    expect(help).toHaveTextContent(FAILED_HELP_TEXT)
    expect(screen.getByText('save me').closest('div')).toHaveAttribute(
      'aria-describedby',
      'failed-create-help',
    )
  })

  it('attaches beforeunload while a failed row exists and detaches it after Dismiss (AC 5, 7)', async () => {
    const user = userEvent.setup()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    stubFailingCreate()
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    await user.type(
      screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
      'guard me',
    )
    await user.keyboard('{Enter}')

    // beforeunload is attached once a failed row exists.
    await screen.findByRole('button', { name: 'Dismiss' })
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    // (The native dialog itself is not scriptable — AC 7 — so only attach/detach
    // is asserted.)

    // Dismiss the only failed row → the handler detaches.
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Dismiss' }),
      ).not.toBeInTheDocument(),
    )
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('Retry on a failed row re-attempts and settles to a normal row on success (AC 2)', async () => {
    const user = userEvent.setup()
    // First POST 500s; the retry POST (same id) succeeds and the GET refetch then
    // returns the saved task.
    let failNext = true
    let serverTodos: Todo[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return okResponse(serverTodos)
      }
      const body = JSON.parse(init.body as string) as {
        id: string
        description: string
      }
      if (failNext) {
        failNext = false
        return new Response('', { status: 500 })
      }
      const created: Todo = {
        id: body.id,
        description: body.description,
        completed: false,
        createdAt: '2026-06-28T16:00:00.000Z',
        updatedAt: '2026-06-28T16:00:00.000Z',
      }
      serverTodos = [created]
      return new Response(JSON.stringify(created), { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    await user.type(
      screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
      'retry me',
    )
    await user.keyboard('{Enter}')

    await user.click(await screen.findByRole('button', { name: 'Retry' }))

    // The failed affordances are gone; the row settled into the normal list with
    // a real checkbox.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Retry' }),
      ).not.toBeInTheDocument(),
    )
    expect(
      await screen.findByRole('checkbox', { name: 'retry me' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('retry me added.'),
    )
  })

  it('does not render both a Failed row and a server row when a later refetch contains the same id', async () => {
    const user = userEvent.setup()
    let submittedId = ''
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return okResponse([])
      }
      const body = JSON.parse(init.body as string) as {
        id: string
        description: string
      }
      submittedId = body.id
      return new Response('', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { client } = renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    await user.type(
      screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
      'saved later',
    )
    await user.keyboard('{Enter}')
    expect(
      await screen.findByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument()

    act(() =>
      client.setQueryData<Todo[]>(
        ['todos'],
        [todo({ id: submittedId, description: 'saved later' })],
      ),
    )

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Retry' }),
      ).not.toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('button', { name: 'Dismiss' }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('saved later')).toHaveLength(1)
    expect(
      screen.getByRole('checkbox', { name: 'saved later' }),
    ).toBeInTheDocument()
  })
})

describe('App unread-error indicator (Story 1.10)', () => {
  // The indicator's accessible name carries the count + the Enter hint (AC 4).
  const indicatorName = (count: number) =>
    `${count === 1 ? '1 error' : `${count} errors`} above. Press Enter to view the first failed task.`
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'scrollIntoView',
  )

  beforeEach(() => {
    document.title = ''
    // jsdom does not implement scrollIntoView; the activate handler calls it.
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // Restore the previous descriptor so future jsdom/setup implementations are
    // not deleted by this suite.
    if (originalScrollIntoView) {
      Object.defineProperty(
        Element.prototype,
        'scrollIntoView',
        originalScrollIntoView,
      )
    } else {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  // GET returns the (empty) server list; POST always 500s so every create fails.
  function stubFailingCreate() {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return okResponse([])
      }
      return new Response('', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  async function failOneCreate(text: string) {
    const user = userEvent.setup()
    const input = screen.getByPlaceholderText(CAPTURE_PLACEHOLDER)
    await user.click(input)
    await user.keyboard(text)
    await user.keyboard('{Enter}')
    return user
  }

  it('appears with "1 error above" after a failed create WITHOUT stealing focus from the input (AC 1)', async () => {
    stubFailingCreate()
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    await failOneCreate('save me')

    expect(
      await screen.findByRole('button', { name: indicatorName(1) }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 error above')).toBeInTheDocument()
    // The indicator is rendered, never auto-focused — focus stays in the input.
    expect(document.activeElement).toBe(
      screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
    )
  })

  it('is the SECOND tab stop: Tab from the input lands on the indicator (AC 2)', async () => {
    stubFailingCreate()
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    const user = await failOneCreate('tab to me')
    await screen.findByRole('button', { name: indicatorName(1) })

    // Focus is in the input after submit; one Tab moves to the indicator.
    expect(document.activeElement).toBe(
      screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
    )
    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: indicatorName(1) }),
    )
  })

  it('Enter on the focused indicator scrolls the first failed row into view and focuses its Retry (AC 2)', async () => {
    stubFailingCreate()
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    const user = await failOneCreate('navigate to me')
    const indicator = await screen.findByRole('button', {
      name: indicatorName(1),
    })

    await user.tab()
    expect(document.activeElement).toBe(indicator)

    await user.keyboard('{Enter}')

    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(retry).toHaveAttribute('data-failed-retry')
    expect(retry.scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement).toBe(retry)
  })

  it('focus-acknowledge: focusing then blurring the indicator hides it while the failed row stays (AC 3)', async () => {
    stubFailingCreate()
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    const user = await failOneCreate('acknowledge me')
    await screen.findByRole('button', { name: indicatorName(1) })

    // Tab onto the indicator (acknowledge), then Tab off it (blur → hide).
    await user.tab()
    await user.tab()

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: indicatorName(1) }),
      ).not.toBeInTheDocument(),
    )
    // The error itself is NOT dismissed — the failed row is still actionable.
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByText('acknowledge me')).toBeInTheDocument()
  })

  it('hides when the only failure is resolved via Dismiss (AC 3)', async () => {
    stubFailingCreate()
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    const user = await failOneCreate('dismiss me')
    await screen.findByRole('button', { name: indicatorName(1) })

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: indicatorName(1) }),
      ).not.toBeInTheDocument(),
    )
  })

  it('hides while the list surface is failed so activation never points at a missing failed Retry', async () => {
    let failGets = false
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return failGets ? new Response('', { status: 500 }) : okResponse([])
      }
      return new Response('', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { client } = renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    await failOneCreate('hidden while list failed')
    expect(
      await screen.findByRole('button', { name: indicatorName(1) }),
    ).toBeInTheDocument()

    failGets = true
    await client.invalidateQueries({ queryKey: ['todos'] })

    expect(
      await screen.findByText('Couldn’t load your list. Refresh to try again.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: indicatorName(1) }),
    ).not.toBeInTheDocument()
  })

  it('re-arms unread: a later failure after acknowledging the first re-shows the indicator with the new count (AC 3)', async () => {
    stubFailingCreate()
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    const user = await failOneCreate('first fail')
    await screen.findByRole('button', { name: indicatorName(1) })

    // Acknowledge the first failure (focus then blur → hidden).
    await user.tab()
    await user.tab()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: indicatorName(1) }),
      ).not.toBeInTheDocument(),
    )

    // A second, later failure (fresh id) is unread again → indicator returns,
    // now counting BOTH failures above.
    await failOneCreate('second fail')
    expect(
      await screen.findByRole('button', { name: indicatorName(2) }),
    ).toBeInTheDocument()
    expect(screen.getByText('2 errors above')).toBeInTheDocument()
  })
})
