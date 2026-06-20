import type { Todo } from '@tlf/contracts'
import { screen, waitForElementToBeRemoved } from '@testing-library/react'
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
})
