import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('exposes the checkbox role with its accessible name', () => {
    render(<Checkbox aria-label="Done" checked={false} />)

    expect(screen.getByRole('checkbox', { name: 'Done' })).toBeInTheDocument()
  })

  it('reflects the checked prop (checked and unchecked)', () => {
    const { rerender } = render(<Checkbox aria-label="Done" checked />)
    expect(screen.getByRole('checkbox', { name: 'Done' })).toBeChecked()

    rerender(<Checkbox aria-label="Done" checked={false} />)
    expect(screen.getByRole('checkbox', { name: 'Done' })).not.toBeChecked()
  })

  it('calls onCheckedChange with the new boolean when toggled', async () => {
    const user = userEvent.setup()
    const handleCheckedChange = vi.fn()

    // Start unchecked: a click yields `true`.
    const { rerender } = render(
      <Checkbox
        aria-label="Done"
        checked={false}
        onCheckedChange={handleCheckedChange}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Done' }))
    expect(handleCheckedChange).toHaveBeenLastCalledWith(true)

    // Re-render checked (controlled): a click now yields `false`. Proves the
    // callback reports the input's resulting state, not a fixed value.
    rerender(
      <Checkbox
        aria-label="Done"
        checked
        onCheckedChange={handleCheckedChange}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Done' }))
    expect(handleCheckedChange).toHaveBeenLastCalledWith(false)
  })

  it('toggles via the keyboard Space key', async () => {
    const user = userEvent.setup()
    const handleCheckedChange = vi.fn()

    render(
      <Checkbox
        aria-label="Done"
        checked={false}
        onCheckedChange={handleCheckedChange}
      />,
    )

    await user.tab()
    expect(screen.getByRole('checkbox', { name: 'Done' })).toHaveFocus()

    await user.keyboard(' ')
    expect(handleCheckedChange).toHaveBeenCalledWith(true)
  })

  it('forwards disabled and does not fire onCheckedChange while disabled', async () => {
    const user = userEvent.setup()
    const handleCheckedChange = vi.fn()

    render(
      <Checkbox
        aria-label="Done"
        checked={false}
        disabled
        onCheckedChange={handleCheckedChange}
      />,
    )

    const checkbox = screen.getByRole('checkbox', { name: 'Done' })
    expect(checkbox).toBeDisabled()

    await user.click(checkbox)
    expect(handleCheckedChange).not.toHaveBeenCalled()
  })

  it('forwards a ref to the native input', () => {
    const ref = { current: null as HTMLInputElement | null }

    render(<Checkbox ref={ref} aria-label="Done" checked={false} />)

    expect(ref.current).toBeInstanceOf(HTMLInputElement)
    expect(ref.current?.type).toBe('checkbox')
  })
})
