import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import {
  CAPTURE_PLACEHOLDER,
  LOAD_FAILURE_MESSAGE,
} from './test/appHelpers'
import { renderWithClient } from './test/queryClient'
import { okResponse, stubTodoServer } from './test/todoServer'

describe('App unread-error indicator (Story 1.10)', () => {
  // The indicator's accessible name carries the count + the Enter hint (AC 4).
  const indicatorName = (count: number) =>
    `${count === 1 ? '1 error' : `${count} errors`} above. Press Enter to view the first failed task.`
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'scrollIntoView',
  )

  beforeEach(() => {
    document.title = ''
    // jsdom does not implement scrollIntoView; the activate handler calls it.
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // Restore the previous descriptor so future jsdom/setup implementations are
    // not deleted by this suite.
    if (originalScrollIntoView) {
      Object.defineProperty(
        Element.prototype,
        'scrollIntoView',
        originalScrollIntoView,
      )
    } else {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  async function failOneCreate(text: string) {
    const user = userEvent.setup()
    const input = screen.getByPlaceholderText(CAPTURE_PLACEHOLDER)
    await user.click(input)
    await user.keyboard(text)
    await user.keyboard('{Enter}')
    return user
  }

  it('appears with "1 error above" after a failed create WITHOUT stealing focus from the input (AC 1)', async () => {
    stubTodoServer({ failCreates: true })
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    await failOneCreate('save me')

    expect(
      await screen.findByRole('button', { name: indicatorName(1) }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 error above')).toBeInTheDocument()
    // The indicator is rendered, never auto-focused — focus stays in the input.
    expect(document.activeElement).toBe(
      screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
    )
  })

  it('is the SECOND tab stop: Tab from the input lands on the indicator (AC 2)', async () => {
    stubTodoServer({ failCreates: true })
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    const user = await failOneCreate('tab to me')
    await screen.findByRole('button', { name: indicatorName(1) })

    // Focus is in the input after submit; one Tab moves to the indicator.
    expect(document.activeElement).toBe(
      screen.getByPlaceholderText(CAPTURE_PLACEHOLDER),
    )
    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: indicatorName(1) }),
    )
  })

  it('Enter on the focused indicator scrolls the first failed row into view and focuses its Retry (AC 2)', async () => {
    stubTodoServer({ failCreates: true })
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    const user = await failOneCreate('navigate to me')
    const indicator = await screen.findByRole('button', {
      name: indicatorName(1),
    })

    await user.tab()
    expect(document.activeElement).toBe(indicator)

    await user.keyboard('{Enter}')

    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(retry).toHaveAttribute('data-failed-retry')
    expect(retry.scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement).toBe(retry)
  })

  it('focus-acknowledge: focusing then blurring the indicator hides it while the failed row stays (AC 3)', async () => {
    stubTodoServer({ failCreates: true })
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    const user = await failOneCreate('acknowledge me')
    await screen.findByRole('button', { name: indicatorName(1) })

    // Tab onto the indicator (acknowledge), then Tab off it (blur → hide).
    await user.tab()
    await user.tab()

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: indicatorName(1) }),
      ).not.toBeInTheDocument(),
    )
    // The error itself is NOT dismissed — the failed row is still actionable.
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByText('acknowledge me')).toBeInTheDocument()
  })

  it('hides when the only failure is resolved via Dismiss (AC 3)', async () => {
    stubTodoServer({ failCreates: true })
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    const user = await failOneCreate('dismiss me')
    await screen.findByRole('button', { name: indicatorName(1) })

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: indicatorName(1) }),
      ).not.toBeInTheDocument(),
    )
  })

  it('hides while the list surface is failed so activation never points at a missing failed Retry', async () => {
    let failGets = false
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return failGets ? new Response('', { status: 500 }) : okResponse([])
      }
      return new Response('', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { client } = renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    await failOneCreate('hidden while list failed')
    expect(
      await screen.findByRole('button', { name: indicatorName(1) }),
    ).toBeInTheDocument()

    failGets = true
    await client.invalidateQueries({ queryKey: ['todos'] })

    expect(await screen.findByText(LOAD_FAILURE_MESSAGE)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: indicatorName(1) }),
    ).not.toBeInTheDocument()
  })

  it('re-arms unread: a later failure after acknowledging the first re-shows the indicator with the new count (AC 3)', async () => {
    stubTodoServer({ failCreates: true })
    renderWithClient(<App />)

    await screen.findByText('Your list will appear here.')
    const user = await failOneCreate('first fail')
    await screen.findByRole('button', { name: indicatorName(1) })

    // Acknowledge the first failure (focus then blur → hidden).
    await user.tab()
    await user.tab()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: indicatorName(1) }),
      ).not.toBeInTheDocument(),
    )

    // A second, later failure (fresh id) is unread again → indicator returns,
    // now counting BOTH failures above.
    await failOneCreate('second fail')
    expect(
      await screen.findByRole('button', { name: indicatorName(2) }),
    ).toBeInTheDocument()
    expect(screen.getByText('2 errors above')).toBeInTheDocument()
  })
})
