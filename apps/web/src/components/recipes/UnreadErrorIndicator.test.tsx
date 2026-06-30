import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { UnreadErrorIndicator } from './UnreadErrorIndicator'

describe('UnreadErrorIndicator', () => {
  it('renders the singular label for count={1} (AC 1, 4)', () => {
    render(<UnreadErrorIndicator count={1} onActivate={vi.fn()} />)

    expect(
      screen.getByRole('button', {
        name: '1 error above. Press Enter to view the first failed task.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 error above')).toBeInTheDocument()
  })

  it('renders the plural label and exact accessible name for count={3} (AC 1, 4)', () => {
    render(<UnreadErrorIndicator count={3} onActivate={vi.fn()} />)

    const button = screen.getByRole('button', {
      name: '3 errors above. Press Enter to view the first failed task.',
    })
    expect(button).toBeInTheDocument()
    // The visible text is contained within the accessible name (WCAG 2.5.3).
    expect(button).toHaveTextContent('3 errors above')
  })

  it('fires onActivate on click and on Enter/Space via native button (AC 2)', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    render(<UnreadErrorIndicator count={2} onActivate={onActivate} />)

    const button = screen.getByRole('button')
    await user.click(button)
    expect(onActivate).toHaveBeenCalledTimes(1)

    button.focus()
    await user.keyboard('{Enter}')
    expect(onActivate).toHaveBeenCalledTimes(2)

    await user.keyboard(' ')
    expect(onActivate).toHaveBeenCalledTimes(3)
  })

  it('fires onFocus and onBlur (AC 3)', async () => {
    const user = userEvent.setup()
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    render(
      <UnreadErrorIndicator
        count={1}
        onActivate={vi.fn()}
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    )

    await user.tab()
    expect(onFocus).toHaveBeenCalledTimes(1)
    await user.tab()
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('renders null when count <= 0 (defensive)', () => {
    const { container } = render(
      <UnreadErrorIndicator count={0} onActivate={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
