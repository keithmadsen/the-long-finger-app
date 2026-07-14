import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { renderWithClient } from './test/queryClient'
import { okResponse, stubTodoServer, todo } from './test/todoServer'

describe('App toggle (Story 1.8)', () => {
  beforeEach(() => {
    document.title = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('toggling a row issues a PATCH, settles IN PLACE, announces, and updates the title active count (AC 1, 3, 4, 6)', async () => {
    const user = userEvent.setup()
    const { fetchMock } = stubTodoServer({
      allow: ['PATCH'],
      initial: [
        todo({ id: 'a', description: 'active one', completed: false }),
        todo({ id: 'b', description: 'active two', completed: false }),
      ],
    })

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
        'Couldn’t update ‘Buy milk’. The list refreshed to current state.',
      ),
    )

    // Reconciled: the row is active again (the failed toggle did not persist).
    await waitFor(() =>
      expect(within(list).getAllByRole('checkbox')[0]!).not.toBeChecked(),
    )
  })
})
