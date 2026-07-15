import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import {
  instructionWrap,
  LOAD_FAILURE_MESSAGE,
} from './test/appHelpers'
import { renderWithClient } from './test/queryClient'
import { okResponse, stubTodoServer, todo } from './test/todoServer'

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
    stubTodoServer({
      initial: [
        todo({ id: 'a', description: 'active one', completed: false }),
        todo({ id: 'b', description: 'active two', completed: false }),
        todo({ id: 'c', description: 'done one', completed: true }),
      ],
    })

    renderWithClient(<App />)

    const list = await screen.findByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    await waitFor(() =>
      expect(document.title).toBe('the long finger (2 active)'),
    )
    expect(instructionWrap()).toHaveAttribute('aria-hidden', 'true')
  })

  it('omits the count from the title when zero tasks are active (AC 7)', async () => {
    stubTodoServer({ initial: [todo({ completed: true })] })

    renderWithClient(<App />)

    // The list still renders (a completed task exists) but the title has no count.
    await screen.findByRole('list')
    await waitFor(() => expect(document.title).toBe('the long finger'))
  })

  it('shows the empty surface and bare title when there are no todos (AC 5, 7)', async () => {
    stubTodoServer()

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
