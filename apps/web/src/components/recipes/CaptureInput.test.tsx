import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CaptureInput } from './CaptureInput'
import type { CaptureInputHandle } from './CaptureInput'

const PLACEHOLDER = 'What do you want to do?'

function getInput() {
  return screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement
}

describe('CaptureInput', () => {
  it('renders the calm placeholder, autofocused, capped at maxLength 200 (AC 1, 3)', () => {
    render(<CaptureInput onSubmit={vi.fn()} />)
    const input = getInput()

    expect(input).toHaveAttribute('maxLength', '200')
    // autoFocus lands focus on the field on mount (capture is sacred).
    expect(document.activeElement).toBe(input)
  })

  it('Enter on a non-empty value submits the trimmed text and clears+refocuses immediately (AC 2)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<CaptureInput onSubmit={onSubmit} />)
    const input = getInput()

    await user.type(input, '  Buy milk  ')
    await user.keyboard('{Enter}')

    // Trimmed text dispatched...
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('Buy milk')
    // ...and the field is cleared + still focused, ready for the next task —
    // synchronously on submit (onSubmit is a no-op here, nothing has "resolved").
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
  })

  it('suppresses empty / whitespace-only submits (AC 3)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<CaptureInput onSubmit={onSubmit} />)
    const input = getInput()

    // Pure whitespace, then Enter.
    await user.type(input, '    ')
    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()

    // Empty, then Enter.
    await user.clear(input)
    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Escape with text clears the draft, keeps focus, and does NOT submit (Story 3.1 AC 5)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<CaptureInput onSubmit={onSubmit} />)
    const input = getInput()

    await user.type(input, 'half-typed thought')
    await user.keyboard('{Escape}')

    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Escape on an EMPTY input is a no-op — the event passes through unprevented (Story 3.1 AC 5)', () => {
    render(<CaptureInput onSubmit={vi.fn()} />)
    const input = getInput()

    // fireEvent returns false when a handler called preventDefault — the empty
    // field must let Escape pass untouched (no app handler claims it).
    const passedThrough = fireEvent.keyDown(input, { key: 'Escape' })

    expect(passedThrough).toBe(true)
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
  })

  it('Escape during IME composition preserves the draft and passes through', () => {
    render(<CaptureInput onSubmit={vi.fn()} />)
    const input = getInput()
    fireEvent.change(input, { target: { value: 'composing draft' } })

    const passedThrough = fireEvent.keyDown(input, {
      key: 'Escape',
      isComposing: true,
    })

    expect(passedThrough).toBe(true)
    expect(input.value).toBe('composing draft')
    expect(document.activeElement).toBe(input)
  })

  it('exposes a focus() handle that focuses the input (Story 3.1, row-Escape return path)', () => {
    const ref = createRef<CaptureInputHandle>()
    render(<CaptureInput onSubmit={vi.fn()} ref={ref} />)
    const input = getInput()

    input.blur()
    expect(document.activeElement).not.toBe(input)

    ref.current?.focus()
    expect(document.activeElement).toBe(input)
  })

  it('hides the counter below 180 chars and shows N/200 at/above the threshold (AC 3)', () => {
    render(<CaptureInput onSubmit={vi.fn()} />)
    const input = getInput()

    // 179 chars — hidden.
    fireEvent.change(input, { target: { value: 'x'.repeat(179) } })
    expect(screen.queryByText('179/200')).not.toBeInTheDocument()

    // 180 chars — appears.
    fireEvent.change(input, { target: { value: 'x'.repeat(180) } })
    expect(screen.getByText('180/200')).toBeInTheDocument()

    // 200 chars — at the cap.
    fireEvent.change(input, { target: { value: 'x'.repeat(200) } })
    expect(screen.getByText('200/200')).toBeInTheDocument()
  })
})
