import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TextInput } from './TextInput'

describe('TextInput', () => {
  it('is controlled and calls onChange while typing', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    render(<TextInput aria-label="Task" value="" onChange={handleChange} />)

    const input = screen.getByRole('textbox', { name: 'Task' })
    await user.type(input, 'Buy milk')

    expect(handleChange).toHaveBeenCalled()
    // Controlled: the value prop is fixed at '', so the display never changes
    // regardless of keystrokes. Proves the value wiring is not uncontrolled.
    expect(input).toHaveValue('')
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

  it('ignores Enter while composing but submits the same value once composition ends', () => {
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

    // Enter mid-composition must not submit. fireEvent (not userEvent) is used
    // here deliberately because isComposing is a low-level native-event flag
    // that userEvent does not simulate.
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(handleSubmit).not.toHaveBeenCalled()

    // The same Enter on the same value once composition has ended must submit.
    // This proves isComposing — not some unrelated reason — is the discriminator.
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(handleSubmit).toHaveBeenCalledWith('買う')
  })

  it('does not submit when a caller onKeyDown calls preventDefault', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn()

    render(
      <TextInput
        aria-label="Task"
        onChange={vi.fn()}
        onKeyDown={(event) => {
          event.preventDefault()
        }}
        onSubmit={handleSubmit}
        value="Buy milk"
      />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Task' }), '{Enter}')

    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('can receive keyboard focus', async () => {
    const user = userEvent.setup()

    render(<TextInput aria-label="Task" value="" onChange={vi.fn()} />)

    await user.tab()

    expect(screen.getByRole('textbox', { name: 'Task' })).toHaveFocus()
  })
})
