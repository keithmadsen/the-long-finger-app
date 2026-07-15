import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { CAPTURE_PLACEHOLDER, commitDelete } from './test/appHelpers'
import { renderWithClient } from './test/queryClient'
import { stubTodoServer, todo } from './test/todoServer'

describe('App list-wide keyboard navigation (Story 3.1)', () => {
  beforeEach(() => {
    document.title = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // The row anchor is the wrapping <label> (the committed anchor since 1.6→2.3).
  function rowAnchor(description: string): HTMLLabelElement {
    const label = screen.getByText(description).closest('label')
    if (!label) throw new Error(`row anchor for "${description}" not found`)
    return label
  }

  it('Tab from the input lands on the first row anchor; Shift+Tab returns to the input (AC 2)', async () => {
    stubTodoServer({
      initial: [
        todo({ id: 'a', description: 'first row' }),
        todo({ id: 'b', description: 'second row' }),
      ],
    })
    const user = userEvent.setup()
    renderWithClient(<App />)
    await screen.findByRole('list')
    const input = screen.getByPlaceholderText(CAPTURE_PLACEHOLDER)

    input.focus()
    await user.tab()
    // The second row contributes NO tab stop — one Tab reaches row 1 directly.
    expect(rowAnchor('first row')).toHaveFocus()

    await user.tab({ shift: true })
    expect(input).toHaveFocus()
  })

  it('Tab lands on the FIRST row even after creates prepend rows above the anchor (AC 2)', async () => {
    // The stateful double: each POST prepends, the refetch returns the new list —
    // the flow a real capture burst produces (focus never enters the list).
    stubTodoServer({ allow: ['POST'] })
    const user = userEvent.setup()
    renderWithClient(<App />)
    await screen.findByText('Your list will appear here.')

    const input = screen.getByPlaceholderText(CAPTURE_PLACEHOLDER)
    await user.click(input)
    await user.keyboard('older task{Enter}')
    await screen.findByRole('checkbox', { name: 'older task' })
    await user.keyboard('newest task{Enter}')
    await screen.findByRole('checkbox', { name: 'newest task' })

    // The newest task renders FIRST; Tab must land there, not on the row the
    // anchor was first initialized to.
    await user.tab()
    expect(rowAnchor('newest task')).toHaveFocus()
  })

  it('an EMPTY list contributes no tab stops — the input is the only interactive element (AC 2)', async () => {
    stubTodoServer()
    const { container } = renderWithClient(<App />)
    await screen.findByText('Your list will appear here.')

    // Nothing carries the roving 0, and the input is the sole tabbable element,
    // so Tab exits straight to the next page element (real Tab-exit is e2e-only).
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(0)
    const interactive = container.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    expect(interactive).toHaveLength(1)
    expect(interactive[0]).toBe(
      screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
    )
  })

  it('with failures present the Tab order is input → indicator → Retry → Dismiss → first normal-row anchor (AC 2)', async () => {
    // GET returns one normal row; POST 500s so a failed row pins above it.
    stubTodoServer({
      initial: [todo({ id: 'a', description: 'normal row' })],
      failCreates: true,
    })
    const user = userEvent.setup()
    renderWithClient(<App />)
    await screen.findByRole('list')

    const input = screen.getByPlaceholderText(CAPTURE_PLACEHOLDER)
    await user.click(input)
    await user.keyboard('doomed create')
    await user.keyboard('{Enter}')
    const indicator = await screen.findByRole('button', {
      name: '1 error above. Press Enter to view the first failed task.',
    })

    input.focus()
    await user.tab()
    expect(indicator).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveFocus()
    await user.tab()
    expect(rowAnchor('normal row')).toHaveFocus()
  })

  it('Escape on a row anchor returns focus to the capture input (AC 5)', async () => {
    stubTodoServer({
      initial: [
        todo({ id: 'a', description: 'first row' }),
        todo({ id: 'b', description: 'second row' }),
      ],
    })
    const user = userEvent.setup()
    renderWithClient(<App />)
    await screen.findByRole('list')

    rowAnchor('second row').focus()
    await user.keyboard('{Escape}')

    expect(screen.getByPlaceholderText(CAPTURE_PLACEHOLDER)).toHaveFocus()
  })

  it('Cmd/Ctrl+Z is a no-op: no app handler claims it and no mutation fires (AC 6, Task D1)', async () => {
    const { fetchMock } = stubTodoServer({
      initial: [
        todo({ id: 'a', description: 'first row' }),
        todo({ id: 'b', description: 'second row' }),
      ],
    })
    renderWithClient(<App />)
    const list = await screen.findByRole('list')

    // Focus IN THE LIST: undo combos pass the modifier guard untouched.
    const anchor = rowAnchor('first row')
    anchor.focus()
    // fireEvent returns false when any handler called preventDefault — no app
    // handler may claim the browser/OS undo combination (NG-6).
    expect(fireEvent.keyDown(anchor, { key: 'z', metaKey: true })).toBe(true)
    expect(fireEvent.keyDown(anchor, { key: 'z', ctrlKey: true })).toBe(true)

    // Focus IN THE INPUT with a draft: browser-default text undo stays the
    // browser's (jsdom cannot execute it — we assert nothing preventDefaults it).
    const input = screen.getByPlaceholderText(
      CAPTURE_PLACEHOLDER,
    ) as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'draft text' } })
    expect(fireEvent.keyDown(input, { key: 'z', metaKey: true })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'z', ctrlKey: true })).toBe(true)
    expect(input.value).toBe('draft text')

    // No app-level state changed: no mutation was issued, the list is intact.
    expect(
      fetchMock.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET'),
    ).toBe(true)
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })

  describe('adjacent-row focus-follow after a delete removal (AC 7)', () => {
    it('focus moves to the NEXT row anchor when the refetch removes the focused row', async () => {
      const server = stubTodoServer({
        allow: ['DELETE'],
        initial: [
          todo({ id: 'a', description: 'first row' }),
          todo({ id: 'b', description: 'second row' }),
          todo({ id: 'c', description: 'third row' }),
        ],
      })
      renderWithClient(<App />)
      await screen.findByRole('list')

      // Keyboard-parity commit: focus the row's delete affordance, arm, cross
      // the 300 ms muscle-memory window deterministically, confirm.
      const row = screen.getByText('first row').closest('li')!
      commitDelete(row, { focusDeleteButton: true })

      // 2.3's reclaim parks focus on the committing row's anchor first.
      await waitFor(() => expect(row).toHaveAttribute('aria-busy', 'true'))
      expect(rowAnchor('first row')).toHaveFocus()

      // The refetch drops the row → its anchor unmounts → focus and the roving
      // anchor follow to the adjacent (next) row — never stranded on <body>.
      act(() => server.releaseDelete())
      await waitFor(() =>
        expect(screen.queryByText('first row')).not.toBeInTheDocument(),
      )
      expect(rowAnchor('second row')).toHaveFocus()
      expect(rowAnchor('second row')).toHaveAttribute('tabindex', '0')
      expect(document.activeElement).not.toBe(document.body)
    })

    it('deleting the ONLY row returns focus to the capture input (list emptied)', async () => {
      const server = stubTodoServer({
        allow: ['DELETE'],
        initial: [todo({ id: 'a', description: 'last row standing' })],
      })
      renderWithClient(<App />)
      await screen.findByRole('list')

      const row = screen.getByText('last row standing').closest('li')!
      commitDelete(row, { focusDeleteButton: true })
      await waitFor(() => expect(row).toHaveAttribute('aria-busy', 'true'))

      act(() => server.releaseDelete())
      await waitFor(() =>
        expect(
          screen.queryByText('last row standing'),
        ).not.toBeInTheDocument(),
      )
      await waitFor(() =>
        expect(
          screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
        ).toHaveFocus(),
      )
    })

    it('never steals focus the user parked elsewhere while a delete settles (stranded-guard)', async () => {
      const server = stubTodoServer({
        allow: ['DELETE'],
        initial: [
          todo({ id: 'a', description: 'first row' }),
          todo({ id: 'b', description: 'second row' }),
        ],
      })
      renderWithClient(<App />)
      await screen.findByRole('list')

      const row = screen.getByText('first row').closest('li')!
      commitDelete(row, { focusDeleteButton: true })
      await waitFor(() => expect(row).toHaveAttribute('aria-busy', 'true'))

      // The user moves on (e.g. back to typing) before the DELETE settles.
      const input = screen.getByPlaceholderText(CAPTURE_PLACEHOLDER)
      input.focus()

      act(() => server.releaseDelete())
      await waitFor(() =>
        expect(screen.queryByText('first row')).not.toBeInTheDocument(),
      )
      // Focus is untouched; the roving anchor still fell back to a live row.
      expect(input).toHaveFocus()
      expect(rowAnchor('second row')).toHaveAttribute('tabindex', '0')
    })
  })
})
