import type { Todo } from '@tlf/contracts'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { CAPTURE_PLACEHOLDER } from './test/appHelpers'
import { renderWithClient } from './test/queryClient'
import { okResponse, stubTodoServer, todo } from './test/todoServer'

describe('App failed-create recovery (Story 1.9)', () => {
  beforeEach(() => {
    document.title = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const FAILED_HELP_TEXT =
    'Your typed text is saved here until you retry, dismiss, or refresh.'

  it('a failed create surfaces a Failed row on an otherwise-empty list, announces once, and exposes the hidden help text (AC 1, 4, 5)', async () => {
    const user = userEvent.setup()
    stubTodoServer({ failCreates: true })
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
    stubTodoServer({ failCreates: true })
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
