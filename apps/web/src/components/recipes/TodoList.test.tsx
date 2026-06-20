import type { Todo } from '@tlf/contracts'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TodoList } from './TodoList'

const TODOS: Todo[] = [
  {
    id: 'b',
    description: 'render me first',
    completed: false,
    createdAt: '2026-06-19T10:00:00.000Z',
    updatedAt: '2026-06-19T10:00:00.000Z',
  },
  {
    id: 'a',
    description: 'render me second',
    completed: true,
    createdAt: '2026-06-19T09:00:00.000Z',
    updatedAt: '2026-06-19T09:30:00.000Z',
  },
]

describe('TodoList', () => {
  it('exposes a list with one listitem per todo', () => {
    render(<TodoList todos={TODOS} />)

    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })

  it('renders items in the exact order received — no client re-sort (AC 8)', () => {
    render(<TodoList todos={TODOS} />)

    const rendered = screen
      .getAllByRole('listitem')
      .map((item) => within(item).getByText(/render me/).textContent)

    expect(rendered).toEqual(['render me first', 'render me second'])
  })
})
