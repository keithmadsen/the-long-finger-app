import type { Todo } from '@tlf/contracts'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TodoList } from './TodoList'
import { DELETE_NO_COMMIT_WINDOW_MS } from '../../hooks/useArmedDelete'

const TODOS: Todo[] = [
  {
    id: 'b',
    description: 'render me first',
    completed: false,
    createdAt: '2026-06-19T10:00:00.000Z',
    updatedAt: '2026-06-19T10:00:00.000Z',
  },
  {
    id: 'a',
    description: 'render me second',
    completed: true,
    createdAt: '2026-06-19T09:00:00.000Z',
    updatedAt: '2026-06-19T09:30:00.000Z',
  },
]

describe('TodoList', () => {
  it('exposes a list with one listitem per todo', () => {
    render(<TodoList todos={TODOS} />)

    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })

  it('renders items in the exact order received — no client re-sort (AC 8)', () => {
    render(<TodoList todos={TODOS} />)

    const rendered = screen
      .getAllByRole('listitem')
      .map((item) => within(item).getByText(/render me/).textContent)

    expect(rendered).toEqual(['render me first', 'render me second'])
  })

  it('does not render delete affordances without a delete handler', () => {
    render(<TodoList todos={TODOS} />)

    expect(screen.queryByRole('button', { name: /^Delete '/ })).toBeNull()
  })

  describe('armed-delete coordination (Story 2.2)', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('arming one row shows Confirm on it and Delete on the other (idle default)', async () => {
      const user = userEvent.setup()
      render(<TodoList onDelete={vi.fn()} todos={TODOS} />)

      // Both rows start idle with a Delete affordance.
      expect(screen.getAllByRole('button', { name: /^Delete '/ })).toHaveLength(2)

      await user.click(screen.getAllByRole('button', { name: /^Delete '/ })[0]!)

      // Exactly one row is armed (Confirm); the other stays idle (Delete).
      expect(screen.getByRole('button', { name: /^Confirm deletion of/ })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /^Delete '/ })).toHaveLength(1)
    })

    it('arming a second row reverts the first — single-armed invariant (AC 5)', async () => {
      const user = userEvent.setup()
      render(<TodoList onDelete={vi.fn()} todos={TODOS} />)

      // Arm the first row.
      await user.click(screen.getAllByRole('button', { name: /^Delete '/ })[0]!)
      expect(screen.getByRole('button', { name: /^Confirm deletion of/ })).toBeInTheDocument()

      // Arm the (now only) other idle row → the first must revert to Delete.
      await user.click(screen.getByRole('button', { name: /^Delete '/ }))

      expect(screen.getAllByRole('button', { name: /^Confirm deletion of/ })).toHaveLength(1)
      expect(screen.getAllByRole('button', { name: /^Delete '/ })).toHaveLength(1)
    })

    it('a confirm press after the no-commit window calls onDelete once with the id (AC 7)', () => {
      // Timing driven deterministically: realClock reads Date.now(), which fake
      // timers control. Exhaustive timing lives in useArmedDelete.test.ts; this
      // proves the TodoList → onCommit → onDelete wiring across the window.
      vi.useFakeTimers()
      const onDelete = vi.fn()
      render(<TodoList onDelete={onDelete} todos={TODOS} />)

      // Arm the first row ('b'). fireEvent (not userEvent) so it composes with
      // fake timers and does not dispatch the tap-away pointerdown.
      fireEvent.click(screen.getAllByRole('button', { name: /^Delete '/ })[0]!)
      expect(screen.getByRole('button', { name: /^Confirm deletion of/ })).toBeInTheDocument()

      // Cross the 300 ms muscle-memory window, then confirm.
      act(() => vi.advanceTimersByTime(DELETE_NO_COMMIT_WINDOW_MS))
      fireEvent.click(screen.getByRole('button', { name: /^Confirm deletion of/ }))

      expect(onDelete).toHaveBeenCalledTimes(1)
      expect(onDelete).toHaveBeenCalledWith('b')
    })

    it('a pointerdown outside any armed affordance reverts to idle (AC 5)', async () => {
      const user = userEvent.setup()
      render(
        <div>
          <TodoList onDelete={vi.fn()} todos={TODOS} />
          <button type="button">outside</button>
        </div>,
      )

      await user.click(screen.getAllByRole('button', { name: /^Delete '/ })[0]!)
      expect(screen.getByRole('button', { name: /^Confirm deletion of/ })).toBeInTheDocument()

      // Tapping anywhere outside the armed affordance reverts it.
      await user.click(screen.getByRole('button', { name: 'outside' }))

      expect(screen.queryByRole('button', { name: /^Confirm deletion of/ })).toBeNull()
      expect(screen.getAllByRole('button', { name: /^Delete '/ })).toHaveLength(2)
    })

    it('tabbing away from an armed affordance reverts it to idle (AC 5)', async () => {
      const user = userEvent.setup()
      render(<TodoList onDelete={vi.fn()} todos={TODOS} />)

      await user.click(screen.getAllByRole('button', { name: /^Delete '/ })[0]!)
      expect(screen.getByRole('button', { name: /^Confirm deletion of/ })).toHaveFocus()

      await user.tab()

      expect(screen.queryByRole('button', { name: /^Confirm deletion of/ })).toBeNull()
      expect(screen.getAllByRole('button', { name: /^Delete '/ })).toHaveLength(2)
    })
  })
})
