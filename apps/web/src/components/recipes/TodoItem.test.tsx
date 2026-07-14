import type { Todo } from '@tlf/contracts'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TodoItem } from './TodoItem'
import { FLICKER_THRESHOLD_MS } from '../../hooks/usePendingPresentation'

// NOTE: CSS-Module class names are scoped/hashed (e.g. `_complete_ab12`), so we
// assert on the local name as a substring of className — proving the modifier /
// state class is applied without computing layout (jsdom cannot lay out).
function classNameOf(element: Element | null): string {
  return element?.className ?? ''
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    description: 'Buy milk',
    completed: false,
    createdAt: '2026-06-19T09:00:00.000Z',
    updatedAt: '2026-06-19T09:00:00.000Z',
    ...overrides,
  }
}

describe('TodoItem', () => {
  it('is a listitem composing the description text', () => {
    render(<TodoItem todo={makeTodo()} />)

    expect(screen.getByRole('listitem')).toBeInTheDocument()
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
  })

  it('renders the Active variant: full-contrast, unchecked, no strikethrough', () => {
    render(<TodoItem todo={makeTodo({ completed: false })} />)

    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).not.toBeChecked()
    // No completion modifier on the row → no strikethrough/muted treatment.
    expect(classNameOf(screen.getByText('Buy milk').closest('label'))).not.toMatch(
      /complete/,
    )
  })

  it('renders the Complete variant with all three non-color cues', () => {
    render(<TodoItem todo={makeTodo({ completed: true })} />)

    // Cue 2 — checked checkbox (real DOM state).
    expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeChecked()
    // Cues 1 & 3 — strikethrough + muted ride the `complete` modifier class, so
    // completion is distinguishable without relying on the color shift (AC 3).
    expect(classNameOf(screen.getByText('Buy milk').closest('label'))).toMatch(
      /complete/,
    )
  })

  describe('Pending variant (Story 1.7)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('sets aria-busy from t=0 but does not paint the pending colour before the threshold (AC 6)', () => {
      render(<TodoItem pending todo={makeTodo()} />)

      const row = screen.getByRole('listitem')
      // Busy immediately — the semantic never waits on the visual delay.
      expect(row).toHaveAttribute('aria-busy', 'true')
      // Visual pending class is NOT applied yet (anti-flicker).
      expect(classNameOf(screen.getByText('Buy milk').closest('label'))).not.toMatch(
        /pending/,
      )
    })

    it('paints the pending colour class once the flicker threshold elapses (AC 6)', () => {
      render(<TodoItem pending todo={makeTodo()} />)

      act(() => vi.advanceTimersByTime(FLICKER_THRESHOLD_MS))

      expect(classNameOf(screen.getByText('Buy milk').closest('label'))).toMatch(
        /pending/,
      )
      // Still busy.
      expect(screen.getByRole('listitem')).toHaveAttribute('aria-busy', 'true')
    })

    it('a non-pending row carries no aria-busy and no pending class (negative path)', () => {
      render(<TodoItem todo={makeTodo()} />)

      act(() => vi.advanceTimersByTime(FLICKER_THRESHOLD_MS))

      expect(screen.getByRole('listitem')).not.toHaveAttribute('aria-busy')
      expect(classNameOf(screen.getByText('Buy milk').closest('label'))).not.toMatch(
        /pending/,
      )
    })

    it('renders NO spinner/status markup while pending — contrast shift only (AC 6)', () => {
      render(<TodoItem pending todo={makeTodo()} />)
      act(() => vi.advanceTimersByTime(FLICKER_THRESHOLD_MS))

      // The honest-pending treatment is colour only: no progressbar/status node
      // is introduced inside the row.
      const row = screen.getByRole('listitem')
      expect(row.querySelector('[role="progressbar"]')).toBeNull()
      expect(row.querySelector('[role="status"]')).toBeNull()
    })

  })

  describe('Toggle wiring (Story 1.8)', () => {
    it('a single row click fires exactly ONE onToggle (guards the nested-<label> double-fire)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(<TodoItem onToggle={onToggle} todo={makeTodo({ completed: false })} />)

      // Click the description text — part of the row <label>, which forwards to
      // the single checkbox it labels. The nested Checkbox label must NOT cause
      // a second toggle.
      await user.click(screen.getByText('Buy milk'))

      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onToggle).toHaveBeenCalledWith(true)
    })

    it('clicking the checkbox itself fires exactly ONE onToggle', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(<TodoItem onToggle={onToggle} todo={makeTodo({ completed: false })} />)

      await user.click(screen.getByRole('checkbox', { name: 'Buy milk' }))

      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onToggle).toHaveBeenCalledWith(true)
    })

    it('Space toggles once from the row focus anchor (AC 2)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(<TodoItem onToggle={onToggle} todo={makeTodo({ completed: false })} />)

      screen.getByText('Buy milk').closest('label')?.focus()
      await user.keyboard(' ')

      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onToggle).toHaveBeenCalledWith(true)
    })

    it('Enter toggles once via the explicit handler (AC 2)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(<TodoItem onToggle={onToggle} todo={makeTodo({ completed: false })} />)

      screen.getByText('Buy milk').closest('label')?.focus()
      await user.keyboard('{Enter}')

      expect(onToggle).toHaveBeenCalledTimes(1)
      // Enter targets the destination state (active → complete).
      expect(onToggle).toHaveBeenCalledWith(true)
    })

    it('Enter on a COMPLETE row toggles to active (destination state)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(<TodoItem onToggle={onToggle} todo={makeTodo({ completed: true })} />)

      screen.getByText('Buy milk').closest('label')?.focus()
      await user.keyboard('{Enter}')

      expect(onToggle).toHaveBeenCalledWith(false)
    })

    it('a pending row is aria-disabled and absorbs clicks and keys without calling onToggle (AC 8)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(<TodoItem pending onToggle={onToggle} todo={makeTodo()} />)

      const checkbox = screen.getByRole('checkbox', { name: 'Buy milk' })
      const row = screen.getByText('Buy milk').closest('label')
      expect(row).toHaveAttribute('aria-disabled', 'true')
      expect(checkbox).toHaveAttribute('aria-disabled', 'true')

      await user.click(checkbox)
      row?.focus()
      await user.keyboard('{Enter}')
      await user.keyboard(' ')

      expect(onToggle).not.toHaveBeenCalled()
    })

    it('pending destination checks the box without applying settled completion styling early', () => {
      render(
        <TodoItem
          pending
          pendingCompleted
          todo={makeTodo({ completed: false })}
        />,
      )

      expect(screen.getByRole('checkbox', { name: 'Buy milk' })).toBeChecked()
      expect(classNameOf(screen.getByText('Buy milk').closest('label'))).not.toMatch(
        /complete/,
      )
    })

    it('uses the row as the single label source when toggle wiring is active', () => {
      render(<TodoItem onToggle={vi.fn()} todo={makeTodo()} />)

      const row = screen.getByText('Buy milk').closest('label')
      expect(row).toBeInTheDocument()
      expect(row?.querySelector('label')).toBeNull()
    })

    it('no rendered variant nests a <label> inside the row label (Story 3.1 Task E1 — fixed since 1.8 via rootAsLabel={false})', () => {
      // Every variant that renders the row <label>: Active, Complete, Pending,
      // ArmedDelete, Committing. (Failed renders a <div> with no checkbox at all.)
      const variants: Array<Parameters<typeof TodoItem>[0]> = [
        { todo: makeTodo({ completed: false }) },
        { todo: makeTodo({ completed: true }) },
        { todo: makeTodo(), pending: true },
        { todo: makeTodo(), armed: true, onDeletePress: vi.fn() },
        { todo: makeTodo(), deleting: true },
      ]

      for (const props of variants) {
        const { unmount } = render(<TodoItem {...props} />)
        const row = screen.getByText('Buy milk').closest('label')
        expect(row).toBeInTheDocument()
        expect(row?.querySelector('label')).toBeNull()
        unmount()
      }
    })
  })

  describe('roving anchor wiring (Story 3.1)', () => {
    it('the row anchor tabIndex is prop-driven: 0 when anchored, -1 otherwise, default 0 (AC 1)', () => {
      const { rerender } = render(
        <TodoItem anchorTabIndex={0} todo={makeTodo()} />,
      )
      const row = () => screen.getByText('Buy milk').closest('label')
      expect(row()).toHaveAttribute('tabindex', '0')

      rerender(<TodoItem anchorTabIndex={-1} todo={makeTodo()} />)
      expect(row()).toHaveAttribute('tabindex', '-1')

      // Standalone default keeps the row keyboard-reachable.
      rerender(<TodoItem todo={makeTodo()} />)
      expect(row()).toHaveAttribute('tabindex', '0')
    })

    it('the checkbox input is always out of the page Tab sequence but stays click-operable (B3)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(
        <TodoItem anchorTabIndex={-1} onToggle={onToggle} todo={makeTodo()} />,
      )

      const checkbox = screen.getByRole('checkbox', { name: 'Buy milk' })
      expect(checkbox).toHaveAttribute('tabindex', '-1')

      await user.click(checkbox)
      expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('the delete affordance is tabbable ONLY on the anchored row (B3)', () => {
      const { rerender } = render(
        <TodoItem anchorTabIndex={0} onDeletePress={vi.fn()} todo={makeTodo()} />,
      )
      expect(screen.getByRole('button', { name: /^Delete '/ })).toHaveAttribute(
        'tabindex',
        '0',
      )

      rerender(
        <TodoItem
          anchorTabIndex={-1}
          onDeletePress={vi.fn()}
          todo={makeTodo()}
        />,
      )
      expect(screen.getByRole('button', { name: /^Delete '/ })).toHaveAttribute(
        'tabindex',
        '-1',
      )
    })

    it('focus arriving anywhere in the row fires onAnchorFocus (click-sync path)', () => {
      const onAnchorFocus = vi.fn()
      render(
        <TodoItem
          onAnchorFocus={onAnchorFocus}
          onDeletePress={vi.fn()}
          todo={makeTodo()}
        />,
      )

      // Direct anchor focus…
      screen.getByText('Buy milk').closest('label')?.focus()
      expect(onAnchorFocus).toHaveBeenCalledTimes(1)

      // …and focus on an inner control bubbles to the label (focusin).
      screen.getByRole('button', { name: /^Delete '/ }).focus()
      expect(onAnchorFocus).toHaveBeenCalledTimes(2)
    })

    it('registerAnchor receives the row anchor node (list focus-target map)', () => {
      const registerAnchor = vi.fn()
      const { unmount } = render(
        <TodoItem registerAnchor={registerAnchor} todo={makeTodo()} />,
      )

      expect(registerAnchor).toHaveBeenCalledWith(
        screen.getByText('Buy milk').closest('label'),
      )

      unmount()
      expect(registerAnchor).toHaveBeenLastCalledWith(null)
    })
  })

  describe('Failed variant (Story 1.9)', () => {
    it('renders the failed variant: left-border class, full-contrast text, empty checkbox slot, aria-describedby, aria-busy false', () => {
      render(
        <TodoItem
          describedById="help-1"
          failed
          onDismiss={vi.fn()}
          onRetry={vi.fn()}
          todo={makeTodo()}
        />,
      )

      const container = screen.getByText('Buy milk').closest('div')
      // The .failed left-border marker, and NO pending/complete colour rule.
      expect(classNameOf(container)).toMatch(/failed/)
      expect(classNameOf(container)).not.toMatch(/pending/)
      expect(classNameOf(container)).not.toMatch(/complete/)
      // References the shared hidden help text (AC 5).
      expect(container).toHaveAttribute('aria-describedby', 'help-1')
      // No server item to toggle → empty checkbox slot (no checkbox control).
      expect(screen.queryByRole('checkbox')).toBeNull()
      // Not busy, not a toggle row.
      expect(screen.getByRole('listitem')).not.toHaveAttribute('aria-busy')
      // Retry + Dismiss affordances.
      expect(
        screen.getByRole('button', { name: 'Retry' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Dismiss' }),
      ).toBeInTheDocument()
    })

    it('Retry calls onRetry, Dismiss calls onDismiss, and neither path toggles', async () => {
      const user = userEvent.setup()
      const onRetry = vi.fn()
      const onDismiss = vi.fn()
      const onToggle = vi.fn()
      render(
        <TodoItem
          failed
          onDismiss={onDismiss}
          onRetry={onRetry}
          onToggle={onToggle}
          todo={makeTodo()}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Retry' }))
      await user.click(screen.getByRole('button', { name: 'Dismiss' }))

      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onDismiss).toHaveBeenCalledTimes(1)
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('clicking the row text does not toggle — the failed row is inert (UX line 999)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(
        <TodoItem
          failed
          onDismiss={vi.fn()}
          onRetry={vi.fn()}
          onToggle={onToggle}
          todo={makeTodo()}
        />,
      )

      await user.click(screen.getByText('Buy milk'))

      expect(onToggle).not.toHaveBeenCalled()
    })
  })

  describe('Delete affordance (Story 2.2 + 2.3 a11y)', () => {
    // Story 2.3 enriched the accessible name via aria-label (the visible text stays
    // Delete/Confirm). These are the AT-facing names the button now exposes.
    const IDLE_NAME = "Delete 'Buy milk'"
    const ARMED_NAME =
      "Confirm deletion of 'Buy milk', press again within 5 seconds to delete"

    it('idle affordance: enriched accessible name + aria-pressed="false" (AC 1)', () => {
      render(<TodoItem onDeletePress={vi.fn()} todo={makeTodo()} />)

      // aria-label overrides the accessible name; the visible text is still Delete.
      const button = screen.getByRole('button', { name: IDLE_NAME })
      expect(button).toBeInTheDocument()
      expect(button).toHaveTextContent('Delete')
      expect(button).toHaveAttribute('aria-pressed', 'false')
    })

    it('armed affordance: enriched Confirm accessible name + aria-pressed="true" (AC 1)', () => {
      render(<TodoItem armed onDeletePress={vi.fn()} todo={makeTodo()} />)

      const confirm = screen.getByRole('button', { name: ARMED_NAME })
      expect(confirm).toBeInTheDocument()
      expect(confirm).toHaveTextContent('Confirm')
      expect(confirm).toHaveAttribute('aria-pressed', 'true')
      // The idle enriched name is gone once armed.
      expect(screen.queryByRole('button', { name: IDLE_NAME })).toBeNull()
      expect(classNameOf(confirm)).toMatch(/armed/)
    })

    it('tapping Delete fires onDeletePress and does NOT toggle (pointer stopPropagation, AC 1)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      const onDeletePress = vi.fn()
      render(
        <TodoItem
          onDeletePress={onDeletePress}
          onToggle={onToggle}
          todo={makeTodo()}
        />,
      )

      await user.click(screen.getByRole('button', { name: IDLE_NAME }))

      expect(onDeletePress).toHaveBeenCalledTimes(1)
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('Enter on the Delete button does NOT toggle (keyboard stopPropagation, AC 1)', async () => {
      // The regression-prone case: the label's handleKeyDown toggles on Enter for
      // ANY target, so without the button's onKeyDown stopPropagation, Enter would
      // BOTH activate delete AND toggle completion. Story 2.3's added Escape branch
      // must not regress this.
      const user = userEvent.setup()
      const onToggle = vi.fn()
      const onDeletePress = vi.fn()
      render(
        <TodoItem
          onDeletePress={onDeletePress}
          onToggle={onToggle}
          todo={makeTodo()}
        />,
      )

      screen.getByRole('button', { name: IDLE_NAME }).focus()
      await user.keyboard('{Enter}')

      // Native button activation still fires the delete press…
      expect(onDeletePress).toHaveBeenCalledTimes(1)
      // …but the toggle must NOT fire.
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('Escape reverts the armed affordance and returns focus to the row anchor (AC 3, Task C1)', async () => {
      const user = userEvent.setup()
      const onDeleteCancel = vi.fn()
      render(
        <TodoItem
          armed
          onDeleteCancel={onDeleteCancel}
          onDeletePress={vi.fn()}
          todo={makeTodo()}
        />,
      )

      const confirm = screen.getByRole('button', { name: ARMED_NAME })
      confirm.focus()
      expect(document.activeElement).toBe(confirm)

      await user.keyboard('{Escape}')

      // Escape reverts to idle AND lands focus on the row anchor, not out of the list.
      expect(onDeleteCancel).toHaveBeenCalled()
      expect(document.activeElement).toBe(
        screen.getByText('Buy milk').closest('label'),
      )
    })

    it('a committed delete never strands focus on the unmounting Confirm button (AC 3, Task C2)', () => {
      const { rerender } = render(
        <TodoItem
          armed
          onDeleteCancel={vi.fn()}
          onDeletePress={vi.fn()}
          todo={makeTodo()}
        />,
      )

      // Focus the armed Confirm button as a keyboard commit would.
      const confirm = screen.getByRole('button', { name: ARMED_NAME })
      confirm.focus()
      expect(document.activeElement).toBe(confirm)

      // Commit flips the row to deleting → the Confirm button unmounts; focus would
      // fall to <body>. The useLayoutEffect relocates it to the still-mounted anchor.
      rerender(
        <TodoItem
          deleting
          onDeleteCancel={vi.fn()}
          onDeletePress={vi.fn()}
          todo={makeTodo()}
        />,
      )

      expect(screen.queryByRole('button', { name: ARMED_NAME })).toBeNull()
      expect(document.activeElement).toBe(
        screen.getByText('Buy milk').closest('label'),
      )
      expect(document.activeElement).not.toBe(document.body)
    })

    it('the armed cue is the visible label change (Delete→Confirm) with NO icon — forced-colors fallback (AC 4, Task E1)', () => {
      const { rerender } = render(
        <TodoItem onDeletePress={vi.fn()} todo={makeTodo()} />,
      )

      // Idle: the only content is the text "Delete" — no <svg>/icon element that a
      // forced-colors override could blank out; the label change alone carries the cue.
      const idle = screen.getByRole('button', { name: IDLE_NAME })
      expect(idle).toHaveTextContent('Delete')
      expect(idle.querySelector('svg')).toBeNull()

      rerender(<TodoItem armed onDeletePress={vi.fn()} todo={makeTodo()} />)

      // Armed: the cue is the text flip to "Confirm" (survives forced-colors where
      // --color-error is overridden) — again with no icon.
      const armed = screen.getByRole('button', { name: ARMED_NAME })
      expect(armed).toHaveTextContent('Confirm')
      expect(armed.querySelector('svg')).toBeNull()
    })

    it('a deleting (Committing) row is aria-busy from t=0 and invites no delete press (AC 8)', () => {
      render(<TodoItem deleting onDeletePress={vi.fn()} todo={makeTodo()} />)

      // Busy immediately — the semantic never waits on the visual delay.
      expect(screen.getByRole('listitem')).toHaveAttribute('aria-busy', 'true')
      // The affordance is inert while the DELETE is in flight (no button at all).
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('a Committing row is inert to the toggle path (AC 6, Task D1)', async () => {
      // The 2.2 gap: a row with a DELETE in flight (deleting, not pending) was
      // aria-busy but still toggle-live. 2.3 makes pending||deleting the inert
      // condition so a keyboard Enter or checkbox change cannot race a PATCH.
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(
        <TodoItem
          deleting
          onDeletePress={vi.fn()}
          onToggle={onToggle}
          todo={makeTodo()}
        />,
      )

      const label = screen.getByText('Buy milk').closest('label')
      const checkbox = screen.getByRole('checkbox', { name: 'Buy milk' })
      // The toggle surfaces carry aria-disabled while committing.
      expect(label).toHaveAttribute('aria-disabled', 'true')
      expect(checkbox).toHaveAttribute('aria-disabled', 'true')

      label?.focus()
      await user.keyboard('{Enter}')
      await user.keyboard(' ')
      await user.click(checkbox)

      expect(onToggle).not.toHaveBeenCalled()
    })

    it('renders no delete affordance on a pending row (not yet a stable server row)', () => {
      render(<TodoItem onDeletePress={vi.fn()} pending todo={makeTodo()} />)

      expect(screen.queryByRole('button', { name: IDLE_NAME })).toBeNull()
    })

    it('renders no delete affordance on a failed row (Retry/Dismiss only)', () => {
      render(
        <TodoItem
          failed
          onDeletePress={vi.fn()}
          onDismiss={vi.fn()}
          onRetry={vi.fn()}
          todo={makeTodo()}
        />,
      )

      expect(screen.queryByRole('button', { name: IDLE_NAME })).toBeNull()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    })
  })

  it('renders the complete long description for responsive text wrapping', () => {
    const longText =
      'This is a deliberately very long task description that would wrap well past two lines if it were not clamped at the boundary'
    render(<TodoItem todo={makeTodo({ description: longText })} />)

    expect(screen.getByText(longText)).toHaveTextContent(longText)
  })
})
