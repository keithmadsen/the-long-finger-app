import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from '../../support/ui-fixtures'

// Story 3.4 — the real-browser axe gate (AC 1/2, NFR3-E2E-002). Scans the same
// six app states as the jsdom gate (apps/web/src/App.axe.test.tsx) but in a
// real render tree, with `color-contrast` ENABLED — this is the ONLY gate where
// that rule can truly run (jsdom computes no layout/color, so the jsdom gate
// keeps it disabled; the token-math contrast:check remains the primary contrast
// gate). Asserts 0 violations at serious/critical (AC 1).
//
// Tags are NOT cumulative in axe: `wcag22aa` alone matches only rules
// introduced in 2.2 — the full array below is what "WCAG 2.2 AA" means.
const WCAG_22_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const CAPTURE_PLACEHOLDER = 'What do you want to do?'

/** A RANDOM token, not Date.now() (3.2 landmine — parallel workers collide). */
const randomStamp = () => Math.random().toString(36).slice(2, 10)

/** Scope GET /todos to rows containing `stamp` (3.1/3.2 precedent) — needed
 * where the STATE under scan depends on list-wide content (e.g. empty). */
async function scopeListTo(page: Page, stamp: string) {
  await page.route('**/todos', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const response = await route.fetch()
    const body = (await response.json()) as Array<{ description: string }>
    await route.fulfill({
      response,
      body: JSON.stringify(body.filter((t) => t.description.includes(stamp))),
    })
  })
}

/** Run the WCAG 2.2 AA scan and fail with the full violation detail if any
 * serious/critical violation exists. */
async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_22_AA_TAGS)
    .analyze()
  const gating = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(
    gating,
    gating
      .map(
        (violation) =>
          `[${violation.impact}] ${violation.id}: ${violation.help} → ${violation.nodes
            .map((node) => node.target.join(' '))
            .join(', ')}`,
      )
      .join('\n'),
  ).toEqual([])
}

test.describe('real-browser axe gate — WCAG 2.2 AA, serious/critical (Story 3.4)', () => {
  test('@p1 populated list (active + completed rows)', async ({
    page,
    seedTodos,
    apiRequest,
  }) => {
    const stamp = randomStamp()
    const seeded = await seedTodos([
      { description: `axe active ${stamp}` },
      { description: `axe completed ${stamp}` },
    ])
    const completedRow = seeded[1]
    if (seeded.length !== 2 || !completedRow) throw new Error('seeding failed')
    // The POST body is a closed schema (id + description only) — completion is
    // a PATCH, so flip the second row through the real API before the scan.
    const { status } = await apiRequest({
      method: 'PATCH',
      path: `/todos/${completedRow.id}`,
      body: { completed: true },
    })
    if (status !== 200) throw new Error('completed-row setup failed')

    await page.goto('/')
    await expect(
      page.getByRole('listitem').filter({ hasText: `axe active ${stamp}` }),
    ).toBeVisible()
    await expect(
      page.getByRole('checkbox', { name: `axe completed ${stamp}` }),
    ).toBeChecked()

    await expectNoSeriousViolations(page)
  })

  test('@p1 empty state', async ({ page }) => {
    // Scope the list to a stamp nothing matches: a real GET round-trip that
    // renders the genuine empty surface even on the shared parallel DB.
    await scopeListTo(page, randomStamp())
    await page.goto('/')
    await expect(page.getByText('Your list will appear here.')).toBeVisible()

    await expectNoSeriousViolations(page)
  })

  test(
    '@p1 failed-load state (Retry surface)',
    { annotation: [{ type: 'skipNetworkMonitoring' }] },
    async ({ page }) => {
      // Every GET /todos 500s (initial + the client's single quiet retry), so
      // the load-failed EmptyState with the Retry button renders.
      await page.route('**/todos', async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
          }),
        })
      })
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible({
        timeout: 10_000,
      })

      await expectNoSeriousViolations(page)
    },
  )

  test(
    '@p1 failed-create row (Retry/Dismiss + help text)',
    { annotation: [{ type: 'skipNetworkMonitoring' }] },
    async ({ page }) => {
      const stamp = randomStamp()
      await page.route('**/todos', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
          }),
        })
      })

      await page.goto('/')
      const input = page.getByPlaceholder(CAPTURE_PLACEHOLDER)
      await input.fill(`axe failed create ${stamp}`)
      await input.press('Enter')
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()

      await expectNoSeriousViolations(page)
    },
  )

  test('@p1 armed-delete row', async ({ page, seedTodos }) => {
    const stamp = randomStamp()
    const [seededRow] = await seedTodos([{ description: `axe armed ${stamp}` }])
    if (!seededRow) throw new Error('seeding failed')

    await page.goto('/')
    await page
      .getByRole('button', { name: `Delete '${seededRow.description}'` })
      .click()
    const confirm = page.getByRole('button', { name: /^Confirm deletion of '/ })
    await expect(confirm).toBeVisible()

    // The idle→armed colour settles via --motion-settle: scan only after the
    // computed color lands on the resolved --color-error, or axe measures a
    // mid-transition blend (the first run of this spec caught exactly that —
    // a transient 4.26:1 reading on colours that are 6.6:1 at rest).
    await expect
      .poll(() =>
        confirm.evaluate((el) => {
          const probe = document.createElement('span')
          probe.style.color = 'var(--color-error)'
          document.body.append(probe)
          const settled = getComputedStyle(el).color === getComputedStyle(probe).color
          probe.remove()
          return settled
        }),
      )
      .toBe(true)

    await expectNoSeriousViolations(page)
  })

  test('@p1 pending-create row (aria-busy)', async ({ page }) => {
    const stamp = randomStamp()
    // Hold the POST forever (never fulfilled) so the optimistic pending row —
    // the muted pending presentation — stays in the tree for the scan.
    await page.route('**/todos', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      // deliberately never resolve
    })

    await page.goto('/')
    const input = page.getByPlaceholder(CAPTURE_PLACEHOLDER)
    await input.fill(`axe pending ${stamp}`)
    await input.press('Enter')
    const pendingRow = page
      .getByRole('listitem')
      .filter({ hasText: `axe pending ${stamp}` })
    await expect(pendingRow).toHaveAttribute('aria-busy', 'true')

    await expectNoSeriousViolations(page)
  })
})
