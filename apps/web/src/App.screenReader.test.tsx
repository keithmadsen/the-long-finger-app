import type { Todo } from '@tlf/contracts'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { CAPTURE_PLACEHOLDER } from './test/appHelpers'
import { renderWithClient } from './test/queryClient'
import { okResponse, todo } from './test/todoServer'

describe('App screen-reader contract locks (Story 3.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // GET returns one server row; POST branches on the submitted description so a
  // single render can hold a pending row ('pend me' never resolves) AND a
  // failed row ('fail me' 500s) alongside the server list.
  function stubMixedServer() {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return okResponse([todo({ id: 'a', description: 'server row' })])
      }
      const body = JSON.parse(init.body as string) as { description: string }
      if (body.description === 'fail me') {
        return new Response('', { status: 500 })
      }
      return new Promise<Response>(() => {})
    })
    vi.stubGlobal('fetch', fetchMock)
  }

  it('exactly one live region exists app-wide, even with populated + pending + failed rows (AC 1)', async () => {
    const user = userEvent.setup()
    stubMixedServer()
    renderWithClient(<App />)

    await screen.findByText('server row')
    const input = screen.getByPlaceholderText(CAPTURE_PLACEHOLDER)

    // A failed create row (Retry/Dismiss surface).
    await user.type(input, 'fail me')
    await user.keyboard('{Enter}')
    await screen.findByRole('button', { name: 'Retry' })

    // A pending create row (POST never resolves; aria-busy from t=0).
    await user.type(input, 'pend me')
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(screen.getByText('pend me').closest('li')).toHaveAttribute(
        'aria-busy',
        'true',
      ),
    )

    // The single-region invariant: one [aria-live], one role="status", polite,
    // and nothing assertive anywhere in the document.
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1)
    const regions = screen.getAllByRole('status')
    expect(regions).toHaveLength(1)
    expect(regions[0]).toHaveAttribute('aria-live', 'polite')
    expect(
      document.querySelectorAll('[aria-live="assertive"], [role="alert"]'),
    ).toHaveLength(0)
  })

  it('the landmark/role structure is exactly the documented set (AC 1)', async () => {
    const user = userEvent.setup()
    stubMixedServer()
    renderWithClient(<App />)

    await screen.findByText('server row')
    const input = screen.getByPlaceholderText(CAPTURE_PLACEHOLDER)
    await user.type(input, 'fail me')
    await user.keyboard('{Enter}')
    await screen.findByRole('button', { name: 'Retry' })

    // Exactly one <main> landmark; no other landmark elements or roles.
    expect(screen.getAllByRole('main')).toHaveLength(1)
    for (const role of [
      'navigation',
      'banner',
      'contentinfo',
      'complementary',
      'region',
    ]) {
      expect(screen.queryAllByRole(role)).toHaveLength(0)
    }
    expect(
      document.querySelectorAll('nav, aside, header, footer, section'),
    ).toHaveLength(0)

    // Explicit role attributes are ONLY the documented trio: the status region
    // plus the list/listitem structure (ux-design-specification.md "Screen
    // Reader Support — Consolidated Contract": no additional ARIA roles or
    // landmarks). Failed rows are listitems too.
    const explicitRoles = [...document.querySelectorAll('[role]')].map((el) =>
      el.getAttribute('role'),
    )
    expect(new Set(explicitRoles)).toEqual(
      new Set(['status', 'list', 'listitem']),
    )
    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(2)
  })

  it('burst capture: each create announces once as it confirms, replacing the region — never concatenating (AC 2)', async () => {
    const user = userEvent.setup()
    let serverTodos: Todo[] = []
    // POSTs resolve only when released, per description — so three creates can
    // be in flight at once and land in a controlled order.
    const releaseByDescription = new Map<string, () => void>()
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return okResponse(serverTodos)
      }
      const body = JSON.parse(init.body as string) as {
        id: string
        description: string
      }
      return new Promise<Response>((resolve) => {
        releaseByDescription.set(body.description, () => {
          const created: Todo = {
            id: body.id,
            description: body.description,
            completed: false,
            createdAt: '2026-07-08T09:00:00.000Z',
            updatedAt: '2026-07-08T09:00:00.000Z',
          }
          serverTodos = [created, ...serverTodos]
          resolve(new Response(JSON.stringify(created), { status: 201 }))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithClient(<App />)
    await screen.findByText('Your list will appear here.')
    const input = screen.getByPlaceholderText(CAPTURE_PLACEHOLDER)
    const status = screen.getByRole('status')

    for (const description of ['one', 'two', 'three']) {
      await user.type(input, description)
      await user.keyboard('{Enter}')
    }
    // Announce on backend confirm, never on submit: three pending rows, silence.
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect((status.textContent ?? '').replace(/\u200B/g, '')).toBe('')

    // Each confirm lands as its own announcement, REPLACING the region text
    // (replace-not-queue semantics — no storm, no concatenation).
    for (const description of ['one', 'two', 'three']) {
      act(() => releaseByDescription.get(description)?.())
      await waitFor(() =>
        expect(status).toHaveTextContent(`${description} added.`),
      )
      expect((status.textContent ?? '').replace(/\u200B/g, '')).toBe(
        `${description} added.`,
      )
    }
  })

  it('silent by design: initial load announces nothing; Dismiss announces nothing (AC 2)', async () => {
    const user = userEvent.setup()
    stubMixedServer()
    renderWithClient(<App />)

    // The on-load canonical (re)order announces NOTHING (UX Decision 1).
    await screen.findByText('server row')
    const status = screen.getByRole('status')
    expect((status.textContent ?? '').replace(/\u200B/g, '')).toBe('')

    // A failed create announces its failure once...
    await user.type(screen.getByPlaceholderText(CAPTURE_PLACEHOLDER), 'fail me')
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(status).toHaveTextContent(
        'Couldn’t save ‘fail me’. Use Retry to try again.',
      ),
    )
    const afterFailure = status.textContent ?? ''

    // ...but Dismiss is deliberately silent: no committed string exists, so the
    // region text must be byte-identical after the row clears (no new announce
    // event — not even a nonce mutation).
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() =>
      expect(screen.queryByText('fail me')).not.toBeInTheDocument(),
    )
    expect(status.textContent ?? '').toBe(afterFailure)
  })
})
