import { test, expect } from '../../support/ui-fixtures'

// Story 3.4 — the committed @p0 delete-path regression net (closes deferred
// Epic 1 action item 6 + deferred Story 1.7 AC 10). The P0 delete interaction
// (arm→confirm→commit, tap-away / re-arm reverts, the 5 s auto-revert) and
// concurrent-submit independence had no committed browser coverage until now —
// Playwright was only an investigation aid in 2.3 AC 7.
//
// Timing discipline (epic-2 retro item 1): REAL Playwright timers +
// waitForResponse — never fake the timer under test. The precise clock races
// (absorb inside the 300 ms window, commit racing the 5 s revert, unmount
// mid-window) are deterministically owned by useArmedDelete.test.ts against the
// injectable clock; this spec asserts the real-browser behavior at honest speed.
//
// Selector contract (harness README): accessible roles only; enriched delete
// names (`Delete '…'` / `Confirm deletion of …`); toggle/row interactions via
// the row <label>, never checkbox.check().

const CAPTURE_PLACEHOLDER = 'What do you want to do?'

/** Scope GET /todos to this spec's rows (3.1/3.2 precedent): the harness runs
 * fully parallel against ONE shared e2e DB, so list-wide count assertions need
 * a filter. Mutations still hit the real server; only the READ is scoped. */
async function scopeListTo(page: import('@playwright/test').Page, stamp: string) {
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

/** A RANDOM token, not Date.now(): parallel workers can start in the same
 * millisecond, and identical epoch stamps defeat both specs' GET scoping. */
const randomStamp = () => Math.random().toString(36).slice(2, 10)

const deleteButton = (row: import('@playwright/test').Locator, description: string) =>
  row.getByRole('button', { name: `Delete '${description}'` })
const confirmButton = (row: import('@playwright/test').Locator) =>
  row.getByRole('button', { name: /^Confirm deletion of '/ })

test.describe('delete path (Story 3.4, @p0 regression net)', () => {
  test('@p0 arm→confirm commits the delete; tap-away and arm-another-row revert without deleting', async ({
    page,
    seedTodos,
  }) => {
    const stamp = randomStamp()
    const seeded = await seedTodos([
      { description: `del path one ${stamp}` },
      { description: `del path two ${stamp}` },
      { description: `del path three ${stamp}` },
    ])
    const [rowOne, rowTwo, rowThree] = seeded.map((t) => t.description)
    if (!rowOne || !rowTwo || !rowThree) throw new Error('seeding failed')
    await scopeListTo(page, stamp)

    // Any DELETE leaving the page before the committed press is a failure.
    const deletesFired: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'DELETE') deletesFired.push(request.url())
    })

    await page.goto('/')
    await expect(page.getByRole('listitem')).toHaveCount(3)
    const row = (description: string) =>
      page.getByRole('listitem').filter({ hasText: description })

    // Arm row one: the idle affordance swaps to the enriched Confirm name.
    await deleteButton(row(rowOne), rowOne).click()
    await expect(confirmButton(row(rowOne))).toBeVisible()

    // Tap-away reverts (pointerdown outside the armed affordance): back to
    // idle, row intact, and NO DELETE ever left the browser.
    await page.getByPlaceholder(CAPTURE_PLACEHOLDER).click()
    await expect(confirmButton(row(rowOne))).toBeHidden()
    await expect(deleteButton(row(rowOne), rowOne)).toBeVisible()
    await expect(row(rowOne)).toHaveCount(1)

    // Single-armed coordination: arming row two while row one is armed reverts
    // row one — at most ONE Confirm affordance exists list-wide.
    await deleteButton(row(rowOne), rowOne).click()
    await expect(confirmButton(row(rowOne))).toBeVisible()
    await deleteButton(row(rowTwo), rowTwo).click()
    await expect(confirmButton(row(rowOne))).toBeHidden()
    await expect(confirmButton(row(rowTwo))).toBeVisible()
    await expect(
      page.getByRole('button', { name: /^Confirm deletion of '/ }),
    ).toHaveCount(1)
    expect(deletesFired).toHaveLength(0)

    // Committed press: past the 300 ms muscle-memory window, the second press
    // fires the real DELETE (204) and the refetch removes the row.
    await page.waitForTimeout(350) // cross the 300 ms no-commit window
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' && response.status() === 204,
    )
    await confirmButton(row(rowTwo)).click()
    await deleteResponse
    await expect(row(rowTwo)).toHaveCount(0)
    await expect(page.getByRole('listitem')).toHaveCount(2)
    expect(deletesFired).toHaveLength(1)
  })

  test('@p0 an armed delete auto-reverts after 5 s with no commit — real timers, no DELETE fired', async ({
    page,
    seedTodos,
  }) => {
    const stamp = randomStamp()
    const [seededRow] = await seedTodos([{ description: `del revert ${stamp}` }])
    if (!seededRow) throw new Error('seeding failed')
    const description = seededRow.description
    await scopeListTo(page, stamp)

    const deletesFired: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'DELETE') deletesFired.push(request.url())
    })

    await page.goto('/')
    const row = page.getByRole('listitem').filter({ hasText: description })
    await expect(row).toHaveCount(1)

    // Arm, then wait out the REAL 5 s safety window (epic-2 retro item 1: do
    // not fake the timer under test) — the affordance must fall back to idle
    // on its own, with the row intact and no DELETE ever fired.
    await deleteButton(row, description).click()
    await expect(confirmButton(row)).toBeVisible()
    await expect(deleteButton(row, description)).toBeVisible({ timeout: 10_000 })
    await expect(confirmButton(row)).toBeHidden()
    await expect(row).toHaveCount(1)
    expect(deletesFired).toHaveLength(0)
  })

  test('@p0 concurrent submits land independently (1.7 AC 10) and a delete commits while a create is in flight', async ({
    page,
    seedTodos,
    apiRequest,
  }) => {
    const stamp = randomStamp()
    const [seededRow] = await seedTodos([{ description: `del vs post ${stamp}` }])
    if (!seededRow) throw new Error('seeding failed')
    const seededDescription = seededRow.description

    const burst = [1, 2, 3].map((n) => `burst ${n} ${stamp}`)
    const slowCreate = `slow create ${stamp}`

    // Hold ONLY the slow-create POST behind an explicit gate until DELETE has
    // completed. This proves the two mutations overlap even on a slow runner;
    // a fixed delay could expire before the delete interaction reaches the
    // server. Registered BEFORE scopeListTo:
    // Playwright matches routes newest-first, so the GET-scoping route must be
    // the newest or its filter is bypassed for every request it doesn't
    // fulfill itself (this exact leak failed the first run of this spec —
    // interceptNetworkCall on '/todos' out-precedenced the GET scope).
    let markSlowCreateIntercepted: () => void = () => undefined
    const slowCreateIntercepted = new Promise<void>((resolve) => {
      markSlowCreateIntercepted = resolve
    })
    let releaseSlowCreate: () => void = () => undefined
    const slowCreateGate = new Promise<void>((resolve) => {
      releaseSlowCreate = resolve
    })
    await page.route('**/todos', async (route) => {
      const request = route.request()
      const isSlowCreate =
        request.method() === 'POST' &&
        (request.postDataJSON() as { description?: string })?.description ===
          slowCreate
      if (!isSlowCreate) return route.fallback()
      markSlowCreateIntercepted()
      await slowCreateGate
      await route.continue()
    })
    await scopeListTo(page, stamp)

    await page.goto('/')
    await expect(page.getByRole('listitem')).toHaveCount(1)
    const input = page.getByPlaceholder(CAPTURE_PLACEHOLDER)

    try {
      // Burst-submit (1.7 AC 10): rapid consecutive Enters — the input clears
      // synchronously on each submit, so the burst never self-overwrites. Each
      // pending item is independent and ALL of them persist server-side.
      for (const description of burst) {
        await input.fill(description)
        await input.press('Enter')
      }
      await expect(page.getByRole('listitem')).toHaveCount(4)
      for (const description of burst) {
        const row = page.getByRole('listitem').filter({ hasText: description })
        await expect(row).toHaveCount(1)
        await expect(row).not.toHaveAttribute('aria-busy', 'true')
      }

      // Concurrent arm/submit: with the slow-create POST held in flight,
      // commit a delete of ANOTHER row meanwhile — the two mutations must not
      // contaminate each other.
      const slowPostSettled = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.status() === 201 &&
          (response.request().postDataJSON() as { description?: string })
            ?.description === slowCreate,
      )
      await input.fill(slowCreate)
      await input.press('Enter')
      const pendingRow = page.getByRole('listitem').filter({ hasText: slowCreate })
      await expect(pendingRow).toHaveAttribute('aria-busy', 'true')
      await slowCreateIntercepted

      const seededRowLocator = page
        .getByRole('listitem')
        .filter({ hasText: seededDescription })
      await deleteButton(seededRowLocator, seededDescription).click()
      await expect(confirmButton(seededRowLocator)).toBeVisible()
      await page.waitForTimeout(350) // cross the 300 ms no-commit window
      const deleteResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' && response.status() === 204,
      )
      await confirmButton(seededRowLocator).click()
      await deleteResponse
      await expect(seededRowLocator).toHaveCount(0)

      // The in-flight create settles untouched by the delete: the row confirms
      // (aria-busy dropped — React removes aria-busy={false} entirely).
      releaseSlowCreate()
      await slowPostSettled
      await expect(pendingRow).toHaveCount(1)
      await expect(pendingRow).not.toHaveAttribute('aria-busy', 'true')
      await expect(page.getByRole('listitem')).toHaveCount(4)
    } finally {
      // Never leave a routed request hanging if an assertion above fails.
      releaseSlowCreate()
      // Self-cleaning: UI-created rows have unknown client-generated ids —
      // reconcile against the API and delete by description (3.2 precedent).
      const { body } = await apiRequest<Array<{ id: string; description: string }>>({
        method: 'GET',
        path: '/todos',
      })
      for (const rowRecord of body.filter((t) => t.description.includes(stamp))) {
        await apiRequest({ method: 'DELETE', path: `/todos/${rowRecord.id}` })
      }
    }
  })
})
