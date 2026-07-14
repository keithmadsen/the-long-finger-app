import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { CAPTURE_PLACEHOLDER } from './test/appHelpers'
import { renderWithClient } from './test/queryClient'
import { stubTodoServer, todo } from './test/todoServer'

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

describe('first-interactive-element invariant (AC 1, 15)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('the capture input is the first interactive element in the EMPTY state', async () => {
    stubTodoServer()

    const { container } = renderWithClient(<App />)
    await screen.findByText('Your list will appear here.')

    const first = container.querySelector(INTERACTIVE_SELECTOR)
    expect(first).toBe(screen.getByPlaceholderText(CAPTURE_PLACEHOLDER))
  })

  it('the capture input precedes the row checkboxes with a SEEDED list', async () => {
    stubTodoServer({
      initial: [
        todo({ id: 'a', description: 'active' }),
        todo({ id: 'b', description: 'done', completed: true }),
      ],
    })

    const { container } = renderWithClient(<App />)
    await screen.findByRole('list')

    const interactive = container.querySelectorAll(INTERACTIVE_SELECTOR)
    expect(interactive[0]).toBe(screen.getByPlaceholderText(CAPTURE_PLACEHOLDER))
    // The assertion is meaningful only because later interactive elements (the
    // row checkboxes) exist — the input genuinely comes first, not merely alone.
    expect(interactive.length).toBeGreaterThan(1)
  })

  it('the capture input stays first and the unread-error indicator is second when a failed-create row exists (Story 1.10 AC 1)', async () => {
    // GET returns empty; POST 500s so a create fails and the indicator appears.
    stubTodoServer({ failCreates: true })

    const user = userEvent.setup()
    const { container } = renderWithClient(<App />)
    await screen.findByText('Your list will appear here.')

    const input = screen.getByPlaceholderText(CAPTURE_PLACEHOLDER)
    await user.click(input)
    await user.keyboard('save me')
    await user.keyboard('{Enter}')

    // The indicator (a button) and the failed row's Retry/Dismiss are now present.
    await screen.findByRole('button', {
      name: '1 error above. Press Enter to view the first failed task.',
    })

    const interactive = container.querySelectorAll(INTERACTIVE_SELECTOR)
    // Order: input → indicator → the failed row's Retry/Dismiss.
    expect(interactive[0]).toBe(input)
    expect(interactive[1]).toBe(
      screen.getByRole('button', {
        name: '1 error above. Press Enter to view the first failed task.',
      }),
    )
    expect(interactive.length).toBeGreaterThan(2)
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
