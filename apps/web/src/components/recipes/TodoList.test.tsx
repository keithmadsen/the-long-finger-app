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
      expect(onDelete).toHaveBeenCalledWith('b', 'render me first')
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

  describe('roving tabindex (Story 3.1)', () => {
    // The row anchor is the wrapping <label> (the committed anchor since 1.6→2.3).
    function anchors(): HTMLLabelElement[] {
      return screen
        .getAllByRole('listitem')
        .map((item) => item.querySelector('label'))
        .filter((label): label is HTMLLabelElement => label !== null)
    }

    const THREE: Todo[] = [
      ...TODOS,
      {
        id: 'c',
        description: 'render me third',
        completed: false,
        createdAt: '2026-06-19T08:00:00.000Z',
        updatedAt: '2026-06-19T08:00:00.000Z',
      },
    ]

    it('exactly ONE row anchor is tabindex="0" (the first row), the rest -1 (AC 1)', () => {
      render(<TodoList todos={THREE} />)

      expect(anchors().map((a) => a.tabIndex)).toEqual([0, -1, -1])
    })

    it('ArrowDown / ArrowUp move focus between anchors and clamp at the ends (AC 3)', async () => {
      const user = userEvent.setup()
      render(<TodoList todos={THREE} />)
      const [first, second, third] = anchors()

      first!.focus()
      await user.keyboard('{ArrowUp}') // clamp at the top — no wrap
      expect(first).toHaveFocus()

      await user.keyboard('{ArrowDown}')
      expect(second).toHaveFocus()
      expect(anchors().map((a) => a.tabIndex)).toEqual([-1, 0, -1])

      await user.keyboard('{ArrowDown}')
      expect(third).toHaveFocus()
      await user.keyboard('{ArrowDown}') // clamp at the bottom — no wrap
      expect(third).toHaveFocus()

      await user.keyboard('{ArrowUp}')
      expect(second).toHaveFocus()
    })

    it('Home / End move focus to the first / last anchor (AC 3)', async () => {
      const user = userEvent.setup()
      render(<TodoList todos={THREE} />)
      const [first, , third] = anchors()

      first!.focus()
      await user.keyboard('{End}')
      expect(third).toHaveFocus()

      await user.keyboard('{Home}')
      expect(first).toHaveFocus()
    })

    it('a toggle-reorder keeps focus and the anchor on the SAME row (id-keyed, AC 4)', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<TodoList todos={TODOS} />)

      // Move the anchor to row 'a' (rendered second).
      anchors()[0]!.focus()
      await user.keyboard('{ArrowDown}')
      const anchorOfA = anchors()[1]!
      expect(anchorOfA).toHaveFocus()

      // The canonical order re-sorts: 'a' now renders FIRST. key={todo.id}
      // preserves the DOM node, so focus and the roving 0 travel with it.
      rerender(<TodoList todos={[TODOS[1]!, TODOS[0]!]} />)

      expect(anchorOfA).toHaveFocus()
      expect(anchorOfA).toBe(anchors()[0])
      expect(anchors().map((a) => a.tabIndex)).toEqual([0, -1])
    })

    it('checkbox inputs are OUT of the tab sequence; delete is tabbable only on the anchor row (B3)', () => {
      render(<TodoList onDelete={vi.fn()} todos={TODOS} />)

      for (const checkbox of screen.getAllByRole('checkbox')) {
        expect(checkbox).toHaveAttribute('tabindex', '-1')
      }
      const deleteButtons = screen.getAllByRole('button', { name: /^Delete '/ })
      expect(deleteButtons.map((b) => b.tabIndex)).toEqual([0, -1])
    })

    it('modified arrows (Cmd/Ctrl/Alt) do not move the anchor — shortcuts pass through (AC 6)', async () => {
      const user = userEvent.setup()
      render(<TodoList todos={TODOS} />)
      const [first] = anchors()

      first!.focus()
      await user.keyboard('{Meta>}{ArrowDown}{/Meta}')
      await user.keyboard('{Control>}{ArrowDown}{/Control}')
      await user.keyboard('{Alt>}{ArrowDown}{/Alt}')

      expect(first).toHaveFocus()
      expect(anchors().map((a) => a.tabIndex)).toEqual([0, -1])
    })
  })
})
