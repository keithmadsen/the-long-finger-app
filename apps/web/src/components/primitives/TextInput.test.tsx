import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TextInput } from './TextInput'

describe('TextInput', () => {
  it('is controlled and calls onChange while typing', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    render(<TextInput aria-label="Task" value="" onChange={handleChange} />)

    await user.type(screen.getByRole('textbox', { name: 'Task' }), 'Buy milk')

    expect(handleChange).toHaveBeenCalled()
  })

  it('forwards maxLength, placeholder, and aria-describedby', () => {
    render(
      <>
        <p id="task-help">Short task name</p>
        <TextInput
          aria-describedby="task-help"
          aria-label="Task"
          maxLength={80}
          onChange={vi.fn()}
          placeholder="Add a task"
          value=""
        />
      </>,
    )

    const input = screen.getByRole('textbox', { name: 'Task' })
    expect(input).toHaveAttribute('maxLength', '80')
    expect(input).toHaveAttribute('placeholder', 'Add a task')
    expect(input).toHaveAccessibleDescription('Short task name')
  })

  it('submits the trimmed value on Enter', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn()

    render(
      <TextInput
        aria-label="Task"
        onChange={vi.fn()}
        onSubmit={handleSubmit}
        value="  Buy milk  "
      />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Task' }), '{Enter}')

    expect(handleSubmit).toHaveBeenCalledWith('Buy milk')
  })

  it('does not submit empty or whitespace-only values', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn()

    render(
      <TextInput
        aria-label="Task"
        onChange={vi.fn()}
        onSubmit={handleSubmit}
        value="   "
      />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Task' }), '{Enter}')

    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('ignores Enter while IME composition is active', () => {
    const handleSubmit = vi.fn()

    render(
      <TextInput
        aria-label="Task"
        onChange={vi.fn()}
        onSubmit={handleSubmit}
        value="買う"
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Task' })
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        isComposing: true,
      }),
    )

    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('can receive keyboard focus', async () => {
    const user = userEvent.setup()

    render(<TextInput aria-label="Task" value="" onChange={vi.fn()} />)

    await user.tab()

    expect(screen.getByRole('textbox', { name: 'Task' })).toHaveFocus()
  })
})
