import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { DELETE_NO_COMMIT_WINDOW_MS } from './hooks/useArmedDelete'
import { commitDelete } from './test/appHelpers'
import { renderWithClient } from './test/queryClient'
import { stubTodoServer, todo } from './test/todoServer'

describe('App delete (Story 2.2)', () => {
  beforeEach(() => {
    document.title = ''
  })

  afterEach(() => {
    // Tests below install fake timers mid-test and restore inline; a failed
    // assertion in between would otherwise leave fake timers active and
    // cascade into every later test (waitFor never advances).
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('wires delete: committing a row issues DELETE, marks it aria-busy, and the refetch drops it (AC 8)', async () => {
    const server = stubTodoServer({
      allow: ['DELETE'],
      initial: [
        todo({ id: 'a', description: 'delete me' }),
        todo({ id: 'b', description: 'keep me' }),
      ],
    })

    renderWithClient(<App />)

    const list = await screen.findByRole('list')
    // The delete affordance is present on server rows (App → TodoList wiring).
    // Story 2.3 enriched the accessible name via aria-label (Delete '{desc}').
    expect(
      within(list).getAllByRole('button', { name: /^Delete '/ }),
    ).toHaveLength(2)

    // Arm the 'delete me' row — inline (not commitDelete) so the armed state
    // itself is asserted before the confirm click.
    const row = screen.getByText('delete me').closest('li')!
    vi.useFakeTimers()
    fireEvent.click(within(row).getByRole('button', { name: /^Delete '/ }))
    expect(
      within(row).getByRole('button', { name: /^Confirm deletion of/ }),
    ).toBeInTheDocument()

    // Cross the 300 ms muscle-memory window deterministically, then confirm.
    act(() => vi.advanceTimersByTime(DELETE_NO_COMMIT_WINDOW_MS))
    fireEvent.click(
      within(row).getByRole('button', { name: /^Confirm deletion of/ }),
    )
    vi.useRealTimers()

    // A DELETE was issued for row 'a'.
    await waitFor(() =>
      expect(
        server.fetchMock.mock.calls.some(
          ([u, i]) =>
            (i as RequestInit | undefined)?.method === 'DELETE' &&
            String(u).endsWith('/todos/a'),
        ),
      ).toBe(true),
    )

    // Honest-pending: the row stays visible marked Committing (aria-busy) until
    // the backend confirms — it is NOT optimistically removed (Story 2.1).
    await waitFor(() => expect(row).toHaveAttribute('aria-busy', 'true'))
    expect(screen.getByText('delete me')).toBeInTheDocument()

    // Release the DELETE → the settle invalidate refetch returns without the row.
    act(() => server.releaseDelete())
    await waitFor(() =>
      expect(screen.queryByText('delete me')).not.toBeInTheDocument(),
    )
    // The sibling row is untouched.
    expect(screen.getByText('keep me')).toBeInTheDocument()
  })

  it('announces "{description} deleted." via the LiveRegion when a delete commits (Story 2.3 AC 2)', async () => {
    const server = stubTodoServer({
      allow: ['DELETE'],
      initial: [todo({ id: 'a', description: 'delete me' })],
    })

    renderWithClient(<App />)

    const row = (await screen.findByText('delete me')).closest('li')!
    commitDelete(row)

    // Wait until the deferred DELETE is actually in flight (Committing) — only then
    // is releaseDelete wired — before releasing it.
    await waitFor(() => expect(row).toHaveAttribute('aria-busy', 'true'))

    // Release the DELETE so onSuccess fires and the refetch drops the row.
    act(() => server.releaseDelete())
    await waitFor(() =>
      expect(screen.queryByText('delete me')).not.toBeInTheDocument(),
    )
    // App → useDeleteTodo({ announce }) → the single LiveRegion carries the copy.
    expect(screen.getByRole('status')).toHaveTextContent('delete me deleted.')
  })

  it('announces again when a second identically named delete commits (Story 3.2 AC 5)', async () => {
    const server = stubTodoServer({
      allow: ['DELETE'],
      initial: [
        todo({ id: 'a', description: 'chores' }),
        todo({ id: 'b', description: 'chores' }),
      ],
    })

    renderWithClient(<App />)
    await screen.findByRole('list')
    const status = screen.getByRole('status')

    async function commitAndRelease(row: HTMLElement) {
      commitDelete(row)
      await waitFor(() => expect(row).toHaveAttribute('aria-busy', 'true'))
      act(() => server.releaseDelete())
    }

    await commitAndRelease(screen.getAllByText('chores')[0]!.closest('li')!)
    await waitFor(() => expect(screen.getAllByText('chores')).toHaveLength(1))
    await waitFor(() => expect(status).toHaveTextContent('chores deleted.'))
    const firstAnnouncement = status.textContent ?? ''

    await commitAndRelease(screen.getByText('chores').closest('li')!)
    await waitFor(() =>
      expect(screen.queryByText('chores')).not.toBeInTheDocument(),
    )

    // Identical copy, but the region's rendered text still mutates (nonce
    // alternation inside LiveRegion) — the DOM change is what makes AT
    // re-announce; jsdom can only observe the mutation, not the utterance.
    await waitFor(() => {
      const secondAnnouncement = status.textContent ?? ''
      expect(secondAnnouncement).not.toBe(firstAnnouncement)
      expect(secondAnnouncement.replace(/\u200B/g, '')).toBe('chores deleted.')
    })
    expect(firstAnnouncement.replace(/\u200B/g, '')).toBe('chores deleted.')
  })
})
