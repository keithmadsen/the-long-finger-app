import { test, expect } from '../../support/ui-fixtures'
import { randomStamp, scopeListTo } from '../../support/list-scoping'

// Story 3.1 — list-wide keyboard navigation in a REAL browser (@p1, the
// NFR3-E2E-001 slice: keyboard-only create/toggle/delete reachable & operable).
// jsdom simulates tab order but not true browser Tab traversal, which is why
// this spec exists. The FULL committed suite (thresholds, more @p0/@p1 specs,
// the CI e2e job) remains Story 3.4.
//
// Selector contract (harness README): accessible roles only; the row anchor is
// the wrapping <label> inside each listitem; toggling is driven via the anchor
// keys, never checkbox.check() (the real input hides behind a styled indicator).

const CAPTURE_PLACEHOLDER = 'What do you want to do?'

test.describe('list-wide keyboard navigation (Story 3.1)', () => {
  test('@p1 keyboard-only: roving anchors, arrows, toggle, escape, delete with focus-follow', async ({
    page,
    seedTodos,
  }) => {
    // Distinct, non-substring descriptions so hasText filters stay unambiguous.
    const stamp = randomStamp()
    const seeded = await seedTodos([
      { description: `kb nav row one ${stamp}` },
      { description: `kb nav row two ${stamp}` },
      { description: `kb nav row three ${stamp}` },
    ])
    const [rowOne, rowTwo, rowThree] = seeded.map((t) => t.description)
    if (!rowOne || !rowTwo || !rowThree) throw new Error('seeding failed')

    // Keyboard navigation is about list-wide ORDER and ADJACENCY, so unlike the
    // per-row smoke assertions this spec needs a deterministic list — scope the
    // READ to this spec's seeded rows against the shared parallel e2e DB.
    await scopeListTo(page, stamp)

    // Canonical order is completed ASC, updated_at DESC — the LAST seeded row
    // renders FIRST: [three, two, one].
    const anchor = (description: string) =>
      page
        .getByRole('listitem')
        .filter({ hasText: description })
        .locator('label')

    await page.goto('/')
    const input = page.getByPlaceholder(CAPTURE_PLACEHOLDER)
    await expect(input).toBeFocused() // capture is sacred — autofocused
    await expect(page.getByRole('listitem')).toHaveCount(3)

    // AC 1 — exactly ONE roving anchor carries tabindex="0".
    const rovingAnchors = page.locator('ul[role="list"] label[tabindex="0"]')
    await expect(rovingAnchors).toHaveCount(1)

    // AC 2 — Tab from the input lands on the FIRST row anchor (one stop, not 3×rows).
    await page.keyboard.press('Tab')
    await expect(anchor(rowThree)).toBeFocused()

    // AC 3 — ArrowDown ×2 walks to the last row; no wrap past the boundary.
    await page.keyboard.press('ArrowDown')
    await expect(anchor(rowTwo)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(anchor(rowOne)).toBeFocused()
    await page.keyboard.press('ArrowDown') // clamp — still the last row
    await expect(anchor(rowOne)).toBeFocused()

    // AC 3 — ArrowUp, Home, End.
    await page.keyboard.press('ArrowUp')
    await expect(anchor(rowTwo)).toBeFocused()
    await page.keyboard.press('Home')
    await expect(anchor(rowThree)).toBeFocused()
    await page.keyboard.press('End')
    await expect(anchor(rowOne)).toBeFocused()

    // AC 4 — Space on the anchor toggles completion; focus survives the
    // re-sort because the anchor is id-keyed (the completed row stays last here).
    await page.keyboard.press('Space')
    await expect(page.getByRole('checkbox', { name: rowOne })).toBeChecked()
    await expect(anchor(rowOne)).toBeFocused()

    // AC 5 — Escape on a row anchor returns focus to the capture input.
    await page.keyboard.press('Escape')
    await expect(input).toBeFocused()

    // AC 2 — the roving anchor reset to the FIRST row on list exit.
    await page.keyboard.press('Tab')
    await expect(anchor(rowThree)).toBeFocused()

    // AC 7 + delete reachability — keyboard-only delete: Tab reaches the
    // anchored row's Delete, Enter arms, a second Enter past the 300 ms
    // muscle-memory window commits.
    await page.keyboard.press('Tab')
    const deleteButton = page.getByRole('button', {
      name: `Delete '${rowThree}'`,
    })
    await expect(deleteButton).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('button', { name: new RegExp(`^Confirm deletion of '`) }),
    ).toBeVisible()
    await page.waitForTimeout(350) // cross the 300 ms no-commit window
    await page.keyboard.press('Enter')

    // The refetch removes the row; focus and the roving anchor follow to the
    // adjacent row — never stranded on <body> (AC 7).
    await expect(page.getByRole('listitem')).toHaveCount(2)
    await expect(
      page.getByRole('listitem').filter({ hasText: rowThree }),
    ).toHaveCount(0)
    await expect(anchor(rowTwo)).toBeFocused()
    await expect(rovingAnchors).toHaveCount(1)
  })
})
