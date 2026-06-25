import type { Todo } from '@tlf/contracts'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TodoItem } from './TodoItem'
import { FLICKER_THRESHOLD_MS } from '../../hooks/usePendingPresentation'

// NOTE: CSS-Module class names are scoped/hashed (e.g. `_complete_ab12`), so we
// assert on the local name as a substring of className — proving the modifier /
// clamp class is applied without computing layout (jsdom cannot lay out).
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

    it('Space toggles once (native checkbox) (AC 2)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(<TodoItem onToggle={onToggle} todo={makeTodo({ completed: false })} />)

      screen.getByRole('checkbox', { name: 'Buy milk' }).focus()
      await user.keyboard(' ')

      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onToggle).toHaveBeenCalledWith(true)
    })

    it('Enter toggles once via the explicit handler (AC 2)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(<TodoItem onToggle={onToggle} todo={makeTodo({ completed: false })} />)

      screen.getByRole('checkbox', { name: 'Buy milk' }).focus()
      await user.keyboard('{Enter}')

      expect(onToggle).toHaveBeenCalledTimes(1)
      // Enter targets the destination state (active → complete).
      expect(onToggle).toHaveBeenCalledWith(true)
    })

    it('Enter on a COMPLETE row toggles to active (destination state)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(<TodoItem onToggle={onToggle} todo={makeTodo({ completed: true })} />)

      screen.getByRole('checkbox', { name: 'Buy milk' }).focus()
      await user.keyboard('{Enter}')

      expect(onToggle).toHaveBeenCalledWith(false)
    })

    it('a pending row is aria-disabled and absorbs clicks and keys without calling onToggle (AC 8)', async () => {
      const user = userEvent.setup()
      const onToggle = vi.fn()
      render(<TodoItem pending onToggle={onToggle} todo={makeTodo()} />)

      const checkbox = screen.getByRole('checkbox', { name: 'Buy milk' })
      expect(checkbox).toHaveAttribute('aria-disabled', 'true')

      await user.click(checkbox)
      checkbox.focus()
      await user.keyboard('{Enter}')
      await user.keyboard(' ')

      expect(onToggle).not.toHaveBeenCalled()
    })
  })

  it('applies the 2-line line-clamp markup to a long description (AC 4)', () => {
    const longText =
      'This is a deliberately very long task description that would wrap well past two lines if it were not clamped at the boundary'
    render(<TodoItem todo={makeTodo({ description: longText })} />)

    // The clamp lives on the `description` class; asserting its presence proves
    // the truncation markup is applied (jsdom cannot lay out, so we do not
    // assert rendered pixel height — story Task 7).
    expect(classNameOf(screen.getByText(longText))).toMatch(/description/)
  })
})
