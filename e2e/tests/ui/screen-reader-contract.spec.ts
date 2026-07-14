import { test, expect } from '../../support/ui-fixtures'
import { randomStamp, scopeListTo } from '../../support/list-scoping'

// Story 3.2 — the consolidated screen-reader contract in a REAL browser (@p1).
// jsdom can assert the DOM mechanics of announcements but not a real render
// tree; this spec verifies the region behavior AT the browser level: committed
// announcement strings landing in the single polite region, aria-busy spanning
// a slowed mutation, and the identical-consecutive re-announce fix (AC 5)
// producing an observable second DOM mutation. Actual utterances are only
// verifiable on real AT — docs/screen-reader-smoke-test.md is that gate. The
// FULL committed e2e suite remains Story 3.4.

const CAPTURE_PLACEHOLDER = 'What do you want to do?'
// LiveRegion's re-announce nonce (invisible, unspoken) — stripped when
// asserting the exact message text.
const ZERO_WIDTH_NONCE = /\u200B/g

test.describe('screen-reader contract (Story 3.2)', () => {
  test('@p1 single polite region carries create/toggle/delete announcements; aria-busy spans pending; identical deletes re-announce', async ({
    page,
    seedTodos,
    interceptNetworkCall,
    apiRequest,
  }) => {
    // Distinct, non-substring descriptions so hasText filters stay unambiguous.
    const stamp = randomStamp()
    const dupName = `sr dup ${stamp}`
    const toggleName = `sr toggle target ${stamp}`
    await seedTodos([
      { description: dupName },
      { description: dupName }, // identical pair for the AC 5 re-announce check
      { description: toggleName },
    ])

    // List-wide count assertions need a deterministic list — scope the READ
    // to this spec's rows against the shared parallel e2e DB.
    await scopeListTo(page, stamp)

    await page.goto('/')
    await expect(page.getByRole('listitem')).toHaveCount(3)

    // AC 1 — exactly ONE [aria-live] element app-wide: the polite status region.
    const region = page.getByRole('status')
    await expect(region).toHaveCount(1)
    await expect(page.locator('[aria-live]')).toHaveCount(1)
    await expect(region).toHaveAttribute('aria-live', 'polite')

    // AC 2 — create confirm lands "{description} added." in the region. The
    // row is UI-created, so from here cleanup must run even on a failed
    // assertion (delete-path precedent): try/finally, not inline at the end.
    const createdName = `sr created ${stamp}`
    try {
      const input = page.getByPlaceholder(CAPTURE_PLACEHOLDER)
      await input.fill(createdName)
      await input.press('Enter')
      await expect(region).toContainText(`${createdName} added.`)

      // AC 1/2 — a slowed PATCH holds the row aria-busy until settle; the toggle
      // announcement fires on backend confirm, never on submit.
      const delayedPatch = interceptNetworkCall({
        method: 'PATCH',
        url: '/todos/*',
        handler: async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 800))
          await route.continue()
        },
      })
      const toggleRow = page.getByRole('listitem').filter({ hasText: toggleName })
      // Drive the visible label — the real input hides behind a styled indicator.
      await toggleRow.locator('label').click()
      await expect(toggleRow).toHaveAttribute('aria-busy', 'true')
      // Pending is silent: the region still holds the create confirmation.
      expect(await region.textContent()).not.toContain('marked complete.')
      await delayedPatch
      await expect(region).toContainText(`${toggleName} marked complete.`)
      // Settled: React removes aria-busy={false} from the DOM entirely.
      await expect(toggleRow).not.toHaveAttribute('aria-busy', 'true')

      // AC 2/5 — two identical consecutive deletes: the second announcement is a
      // fresh, observable DOM mutation (nonce alternation) with the same copy.
      const dupRows = page.getByRole('listitem').filter({ hasText: dupName })
      const armAndConfirmFirstDup = async () => {
        await dupRows
          .first()
          .getByRole('button', { name: `Delete '${dupName}'` })
          .click()
        await page.waitForTimeout(350) // cross the 300 ms no-commit window
        await dupRows
          .first()
          .getByRole('button', { name: /^Confirm deletion of/ })
          .click()
      }

      await armAndConfirmFirstDup()
      await expect(region).toContainText(`${dupName} deleted.`)
      await expect(dupRows).toHaveCount(1)
      const firstAnnouncement = await region.textContent()

      await armAndConfirmFirstDup()
      await expect(dupRows).toHaveCount(0)
      await expect
        .poll(() => region.textContent(), { timeout: 10_000 })
        .not.toBe(firstAnnouncement)
      expect(((await region.textContent()) ?? '').replace(ZERO_WIDTH_NONCE, '')).toBe(
        `${dupName} deleted.`,
      )
    } finally {
      // Self-cleaning: the UI-created row's client-generated id is unknown, so
      // reconcile against the API and delete by description (smoke-spec pattern).
      const { body } = await apiRequest<Array<{ id: string; description: string }>>({
        method: 'GET',
        path: '/todos',
      })
      for (const row of body.filter((t) => t.description === createdName)) {
        await apiRequest({ method: 'DELETE', path: `/todos/${row.id}` })
      }
    }
  })
})
