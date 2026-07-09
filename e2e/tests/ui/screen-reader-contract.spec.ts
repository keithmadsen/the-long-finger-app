import { test, expect } from '../../support/ui-fixtures'

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
    // A RANDOM token, not Date.now(): two parallel specs can start in the same
    // millisecond, and identical epoch stamps would defeat both specs' GET
    // scoping filters (each would see the other's rows).
    const stamp = Math.random().toString(36).slice(2, 10)
    const dupName = `sr dup ${stamp}`
    const toggleName = `sr toggle target ${stamp}`
    await seedTodos([
      { description: dupName },
      { description: dupName }, // identical pair for the AC 5 re-announce check
      { description: toggleName },
    ])

    // The harness runs fully parallel against ONE shared e2e DB (3.1
    // precedent): scope GET /todos responses to this spec's rows so the
    // list-wide count assertions hold; every mutation still hits the real
    // server and the real refetch cycle drives the UI.
    await page.route('**/todos', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const response = await route.fetch()
      const body = (await response.json()) as Array<{ description: string }>
      await route.fulfill({
        response,
        body: JSON.stringify(
          body.filter((t) => t.description.includes(`${stamp}`)),
        ),
      })
    })

    await page.goto('/')
    await expect(page.getByRole('listitem')).toHaveCount(3)

    // AC 1 — exactly ONE [aria-live] element app-wide: the polite status region.
    const region = page.getByRole('status')
    await expect(region).toHaveCount(1)
    await expect(page.locator('[aria-live]')).toHaveCount(1)
    await expect(region).toHaveAttribute('aria-live', 'polite')

    // AC 2 — create confirm lands "{description} added." in the region.
    const createdName = `sr created ${stamp}`
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

    // Self-cleaning: the UI-created row's client-generated id is unknown, so
    // reconcile against the API and delete by description (smoke-spec pattern).
    const { body } = await apiRequest<Array<{ id: string; description: string }>>({
      method: 'GET',
      path: '/todos',
    })
    for (const row of body.filter((t) => t.description === createdName)) {
      await apiRequest({ method: 'DELETE', path: `/todos/${row.id}` })
    }
  })
})
