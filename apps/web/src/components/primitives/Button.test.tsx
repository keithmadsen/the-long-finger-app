import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'

describe('Button', () => {
  it('renders a native button and defaults to type button', () => {
    render(<Button>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'button')
  })

  it('forwards ARIA state attributes', () => {
    render(
      <Button aria-busy="true" aria-disabled="true" aria-pressed="true">
        Syncing
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Syncing' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('blocks clicks when natively disabled', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>,
    )

    await user.click(screen.getByRole('button', { name: 'Disabled' }))

    expect(handleClick).not.toHaveBeenCalled()
  })

  it('blocks clicks while pending without native disabled', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <Button pending onClick={handleClick}>
        Saving
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('data-pending', 'true')

    await user.click(button)

    expect(handleClick).not.toHaveBeenCalled()
  })

  it('blocks clicks when aria-disabled without native disabled', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <Button aria-disabled="true" onClick={handleClick}>
        Unavailable
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Unavailable' })
    expect(button).not.toBeDisabled()

    await user.click(button)

    expect(handleClick).not.toHaveBeenCalled()
  })

  it('can receive keyboard focus', async () => {
    const user = userEvent.setup()

    render(<Button>Focusable</Button>)

    await user.tab()

    expect(screen.getByRole('button', { name: 'Focusable' })).toHaveFocus()
  })
})
