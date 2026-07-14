import type { Todo } from '@tlf/contracts'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { CAPTURE_PLACEHOLDER, instructionWrap } from './test/appHelpers'
import { renderWithClient } from './test/queryClient'
import { stubTodoServer } from './test/todoServer'

describe('App capture-and-confirm (Story 1.7)', () => {
  beforeEach(() => {
    document.title = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the instruction line on first open, retires it after the first task, and announces "{description} added." once (AC 1, 9, 14)', async () => {
    const user = userEvent.setup()
    stubTodoServer({ allow: ['POST'] })
    renderWithClient(<App />)

    // First open (never created): the instruction line is visible (not retired).
    await screen.findByText('Your list will appear here.')
    expect(instructionWrap()).not.toHaveAttribute('aria-hidden', 'true')

    // Capture a task.
    await user.type(
      screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
      'Walk the dog',
    )
    await user.keyboard('{Enter}')

    // The instruction line retires (it stays mounted but goes aria-hidden).
    await waitFor(() =>
      expect(instructionWrap()).toHaveAttribute('aria-hidden', 'true'),
    )

    // The confirmation is announced exactly once via the single LiveRegion.
    const status = screen.getByRole('status')
    await waitFor(() => expect(status).toHaveTextContent('Walk the dog added.'))
  })

  it('does NOT bring the instruction line back when the list later empties (AC 14)', async () => {
    const user = userEvent.setup()
    stubTodoServer({ allow: ['POST'] })
    const { client } = renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    await user.type(screen.getByPlaceholderText(CAPTURE_PLACEHOLDER), 'A task')
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(instructionWrap()).toHaveAttribute('aria-hidden', 'true'),
    )

    // Simulate the list returning to empty (e.g. a future delete). The
    // instruction line must NOT reappear — only the persistent empty-state line.
    act(() => client.setQueryData<Todo[]>(['todos'], []))

    expect(
      await screen.findByText('Your list will appear here.'),
    ).toBeInTheDocument()
    expect(instructionWrap()).toHaveAttribute('aria-hidden', 'true')
  })
})
