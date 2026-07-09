import type { Todo } from '@tlf/contracts'
import { screen, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import * as axeMatchers from 'vitest-axe/matchers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { renderWithClient } from './test/queryClient'

expect.extend(axeMatchers)

// vitest-axe ships its type augmentation against the legacy `Vi.Assertion`
// namespace; Vitest 4 resolves custom matchers via the `Matchers` interface in
// `declare module 'vitest'`. Augment that so toHaveNoViolations type-checks
// under `tsc -b`. The `any` default mirrors Vitest's own Matchers<T = any> — it
// must match exactly or TS rejects the augmentation.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Matchers<T = any> {
    toHaveNoViolations(): T
  }
}

// Seed both polarities so the rendered tree exercises Active AND Complete rows.
const TODOS: Todo[] = [
  {
    id: 'a',
    description: 'an active task',
    completed: false,
    createdAt: '2026-06-19T10:00:00.000Z',
    updatedAt: '2026-06-19T10:00:00.000Z',
  },
  {
    id: 'b',
    description: 'a completed task',
    completed: true,
    createdAt: '2026-06-19T09:00:00.000Z',
    updatedAt: '2026-06-19T09:30:00.000Z',
  },
]

describe('App accessibility (axe-core)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has no serious/critical violations with a populated list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(TODOS), { status: 200 })),
    )

    const { container } = renderWithClient(<App />)
    await screen.findByRole('list')

    // color-contrast is DISABLED here: jsdom cannot compute layout/color, so the
    // rule cannot run meaningfully. Contrast is covered by the dedicated
    // check-contrast.mjs gate — the two gates are complementary, not redundant.
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results).toHaveNoViolations()
  })

  it('has no serious/critical violations in the empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
    )

    const { container } = renderWithClient(<App />)
    // Wait for the loading line to be replaced by the empty surface.
    await waitForElementToBeRemoved(() => screen.queryByText('Loading…'))

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results).toHaveNoViolations()
  })

  it('has no serious/critical violations in the failed-load state (Story 1.7)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )

    const { container } = renderWithClient(<App />)
    await screen.findByRole('button', { name: 'Retry' })

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results).toHaveNoViolations()
  })

  it('has no serious/critical violations with a FAILED create row present (Story 3.2)', async () => {
    const user = userEvent.setup()
    // POST 500s so the create lands in the Failed state (Retry/Dismiss +
    // aria-describedby help text in the tree during the scan).
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      return new Response('', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = renderWithClient(<App />)
    await screen.findByText('Your list will appear here.')

    await user.type(
      screen.getByPlaceholderText('What do you want to do?'),
      'a failed task',
    )
    await user.keyboard('{Enter}')
    await screen.findByRole('button', { name: 'Retry' })

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results).toHaveNoViolations()
  })

  it('has no serious/critical violations with an ARMED delete row (Story 3.2)', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(TODOS), { status: 200 })),
    )

    const { container } = renderWithClient(<App />)
    await screen.findByRole('list')

    // Arm (but do not confirm) the first row's delete.
    const [firstDelete] = screen.getAllByRole('button', { name: /^Delete '/ })
    if (!firstDelete) throw new Error('no delete affordance found')
    await user.click(firstDelete)
    await screen.findByRole('button', { name: /^Confirm deletion of/ })

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results).toHaveNoViolations()
  })

  it('has no serious/critical violations with a PENDING create row (aria-busy) (Story 1.7)', async () => {
    const user = userEvent.setup()
    // Never-resolving POST so the row stays pending (aria-busy) during the scan.
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined || init.method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      return new Promise<Response>(() => {})
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = renderWithClient(<App />)
    await screen.findByText('Your list will appear here.')

    await user.type(
      screen.getByPlaceholderText('What do you want to do?'),
      'A pending task',
    )
    await user.keyboard('{Enter}')

    // The optimistic pending row (aria-busy from t=0) is now in the tree.
    await screen.findByRole('listitem')

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })

    expect(results).toHaveNoViolations()
  })
})
