import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('empty: shows the state line + dashed divider, but NOT the instruction line', () => {
    const { container } = render(<EmptyState variant="empty" />)

    expect(screen.getByText('Your list will appear here.')).toBeInTheDocument()
    // The dashed divider element is present (decorative, aria-hidden).
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    // The capture-input instruction line belongs to Story 1.7 — must be absent.
    expect(screen.queryByText(/Type a task/i)).not.toBeInTheDocument()
  })

  it('loading: shows only the loading line (no divider, no retry)', () => {
    const { container } = render(<EmptyState variant="loading" />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('failed: shows the error line and a working Retry that calls onRetry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<EmptyState variant="failed" onRetry={onRetry} />)

    expect(
      screen.getByText(/Couldn’t load your list\. Refresh to try again\./),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
