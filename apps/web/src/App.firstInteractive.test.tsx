import type { Todo } from '@tlf/contracts'
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { renderWithClient } from './test/queryClient'

/*
 * The "capture is sacred" invariant (AC 1, 15): the capture input MUST be the
 * first interactive element in DOM order, in every non-loading state. This test
 * is the enforced CI assertion — any future change that adds an interactive
 * element above the input must keep it green. It runs in the existing
 * `npm run test --workspace apps/web` step (already in CI); no new CI step needed.
 */

// Anything a keyboard user can tab to, in document order.
const INTERACTIVE_SELECTOR =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
const CAPTURE_PLACEHOLDER = 'What do you want to do?'

function okResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 })
}

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    description: 'A task',
    completed: false,
    createdAt: '2026-06-20T09:00:00.000Z',
    updatedAt: '2026-06-20T09:00:00.000Z',
    ...overrides,
  }
}

describe('first-interactive-element invariant (AC 1, 15)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('the capture input is the first interactive element in the EMPTY state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([])),
    )

    const { container } = renderWithClient(<App />)
    await screen.findByText('Your list will appear here.')

    const first = container.querySelector(INTERACTIVE_SELECTOR)
    expect(first).toBe(screen.getByPlaceholderText(CAPTURE_PLACEHOLDER))
  })

  it('the capture input precedes the row checkboxes with a SEEDED list', async () => {
    const todos = [
      todo({ id: 'a', description: 'active' }),
      todo({ id: 'b', description: 'done', completed: true }),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse(todos)),
    )

    const { container } = renderWithClient(<App />)
    await screen.findByRole('list')

    const interactive = container.querySelectorAll(INTERACTIVE_SELECTOR)
    expect(interactive[0]).toBe(screen.getByPlaceholderText(CAPTURE_PLACEHOLDER))
    // The assertion is meaningful only because later interactive elements (the
    // row checkboxes) exist — the input genuinely comes first, not merely alone.
    expect(interactive.length).toBeGreaterThan(1)
  })

  it('the capture input is the first interactive element in the FAILED state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )

    const { container } = renderWithClient(<App />)
    // The Retry button is interactive but must come AFTER the input.
    await screen.findByRole('button', { name: 'Retry' })

    const first = container.querySelector(INTERACTIVE_SELECTOR)
    expect(first).toBe(screen.getByPlaceholderText(CAPTURE_PLACEHOLDER))
  })
})
