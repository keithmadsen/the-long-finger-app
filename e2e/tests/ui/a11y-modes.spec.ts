import { test, expect, type NewTodo } from '../../support/ui-fixtures'
import type { Page } from '@playwright/test'

// Story 3.3 — responsive, forced-colors, prefers-contrast, reduced-motion and
// 200%-zoom gates in a REAL browser (@p1). Every AC here is already implemented
// in CSS (tokens.css media blocks, App.module.css breakpoint, TodoItem geometry
// reservations) — jsdom evaluates none of it (no media queries, no layout), so
// these Playwright emulation specs are the only executable lock. Gate shape is
// per-test `page.emulateMedia()` / `setViewportSize()` inside the existing
// chromium project (see playwright.config.ts) — no whole-suite emulation
// re-runs. The CI job that invokes this suite is Story 3.4.
//
// 200% zoom is emulated by viewport-halving: 200% zoom on a 1280×800 window is
// layout-equivalent to a 640×400 CSS-px viewport (WCAG 1.4.4 testing
// equivalence — Playwright has no real browser-zoom API, and CDP
// setPageScaleFactor is pinch-zoom, which does not reflow).

const CAPTURE_PLACEHOLDER = 'What do you want to do?'

// A RANDOM token per test, never Date.now(): parallel workers can share an
// epoch millisecond, which defeats description-scoped filters (3.2 precedent).
const randomToken = () => Math.random().toString(36).slice(2, 10)

// The harness runs fully parallel against ONE shared e2e DB: geometry/order
// assertions need a deterministic list, so scope GET /todos responses to this
// spec's seeded rows (3.1/3.2 precedent). Mutations still hit the real server.
async function scopeListTo(page: Page, token: string) {
  await page.route('**/todos', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const response = await route.fetch()
    const body = (await response.json()) as Array<{ description: string }>
    await route.fulfill({
      response,
      body: JSON.stringify(body.filter((t) => t.description.includes(token))),
    })
  })
}

const row = (page: Page, description: string) =>
  page.getByRole('listitem').filter({ hasText: description })

// The description <span> inside a row (class names are CSS-module-hashed, so
// locate by its exact text).
const descriptionEl = (page: Page, description: string) =>
  row(page, description).getByText(description, { exact: true })

test.describe('forced-colors gate (Story 3.3, AC 3)', () => {
  test('@p1 focus ring survives, completion cues survive, armed delete reads via its label', async ({
    page,
    seedTodos,
    apiRequest,
  }) => {
    const stamp = randomToken()
    const activeName = `fc active ${stamp}`
    const doneName = `fc done ${stamp}`
    const [active, done] = await seedTodos([
      { description: activeName },
      { description: doneName },
    ])
    if (!active || !done) throw new Error('seeding failed')
    await apiRequest({
      method: 'PATCH',
      path: `/todos/${done.id}`,
      body: { completed: true },
    })

    await page.emulateMedia({ forcedColors: 'active' })
    await scopeListTo(page, stamp)
    await page.goto('/')
    await expect(page.getByRole('listitem')).toHaveCount(2)

    // (a) The :focus-visible outline survives forced-colors (it is an
    // `outline`, which forced-colors preserves by design). Focus arrives via
    // the KEYBOARD (Tab to the row anchor, Shift+Tab back to the input) so
    // :focus-visible is guaranteed to match on both elements.
    const input = page.getByPlaceholder(CAPTURE_PLACEHOLDER)
    await page.keyboard.press('Tab')
    const anchor = row(page, activeName).locator('label')
    await expect(anchor).toBeFocused()
    const anchorOutline = await anchor.evaluate((el) => {
      const s = getComputedStyle(el)
      return { style: s.outlineStyle, width: s.outlineWidth }
    })
    expect(anchorOutline.style).not.toBe('none')
    expect(anchorOutline.width).not.toBe('0px')

    await page.keyboard.press('Shift+Tab')
    await expect(input).toBeFocused()
    const inputOutline = await input.evaluate((el) => {
      const s = getComputedStyle(el)
      return { style: s.outlineStyle, width: s.outlineWidth }
    })
    expect(inputOutline.style).not.toBe('none')
    expect(inputOutline.width).not.toBe('0px')

    // The committed forced-colors gate also requires every interactive control
    // to retain a visible boundary. Compare each border with its flattened
    // background instead of assuming a particular OS high-contrast palette.
    const borderMetrics = (el: Element) => {
      const s = getComputedStyle(el)
      return {
        style: s.borderStyle,
        width: s.borderWidth,
        color: s.borderColor,
        background: s.backgroundColor,
      }
    }
    const inputBorder = await input.evaluate(borderMetrics)
    expect(inputBorder.style).not.toBe('none')
    expect(inputBorder.width).not.toBe('0px')
    expect(inputBorder.color).not.toBe(inputBorder.background)

    // (b) Completion cues are structural, not color-only: strikethrough on the
    // text plus the checkbox's foreground ✓ glyph (a ::before with content,
    // never background-only — backgrounds flatten under forced colors).
    await expect(descriptionEl(page, doneName)).toHaveCSS(
      'text-decoration-line',
      'line-through',
    )
    const doneGlyph = await row(page, doneName)
      .getByRole('checkbox')
      .evaluate((el) => {
        const indicator = el.nextElementSibling as Element
        const s = getComputedStyle(indicator, '::before')
        return { content: s.content, opacity: s.opacity }
      })
    expect(doneGlyph.content).toBe('"✓"')
    expect(doneGlyph.opacity).toBe('1')
    // The unchecked row's glyph is transparent — checked vs unchecked stays
    // distinguishable without author colors.
    const activeGlyph = await row(page, activeName)
      .getByRole('checkbox')
      .evaluate((el) => {
        const indicator = el.nextElementSibling as Element
        return getComputedStyle(indicator, '::before').opacity
      })
    expect(activeGlyph).toBe('0')
    const checkboxBorder = await row(page, doneName)
      .getByRole('checkbox')
      .evaluate((el) => {
        const s = getComputedStyle(el.nextElementSibling as Element)
        return {
          style: s.borderStyle,
          width: s.borderWidth,
          color: s.borderColor,
          background: s.backgroundColor,
        }
      })
    expect(checkboxBorder.style).not.toBe('none')
    expect(checkboxBorder.width).not.toBe('0px')
    expect(checkboxBorder.color).not.toBe(checkboxBorder.background)

    // (c) The armed-delete signal is the visible LABEL flip (Delete→Confirm)
    // plus aria-pressed — asserting the --color-error swap here would be wrong
    // (forced-colors overrides author colors; the label IS the signal).
    const deleteButton = page.getByRole('button', {
      name: `Delete '${activeName}'`,
    })
    await deleteButton.click()
    const armedButton = row(page, activeName).getByRole('button')
    await expect(armedButton).toHaveText('Confirm')
    await expect(armedButton).toHaveAttribute('aria-pressed', 'true')
    const buttonBorder = await armedButton.evaluate(borderMetrics)
    expect(buttonBorder.style).not.toBe('none')
    expect(buttonBorder.width).not.toBe('0px')
    expect(buttonBorder.color).not.toBe(buttonBorder.background)
  })
})

test.describe('reduced-motion gate (Story 3.3, AC 5)', () => {
  test('@p1 motion tokens collapse to 0s; delete safety windows are NOT collapsed', async ({
    page,
    seedTodos,
  }) => {
    const stamp = randomToken()
    const name = `rm row ${stamp}`
    await seedTodos([{ description: name }])

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(row(page, name)).toHaveCount(1)

    const motionTokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      return {
        instant: root.getPropertyValue('--motion-instant').trim(),
        settle: root.getPropertyValue('--motion-settle').trim(),
        none: root.getPropertyValue('--motion-none').trim(),
      }
    })
    expect(motionTokens).toEqual({ instant: '0ms', settle: '0ms', none: '0ms' })

    // Every transition rides --motion-instant/--motion-settle, which tokens.css
    // collapses to 0ms under reduced motion (single global collapse — no
    // per-component media queries). Computed transition-duration lists one
    // value per transitioned property; all must be 0s.
    const allZero = (durations: string) =>
      durations.split(',').every((d) => d.trim() === '0s')

    expect(
      allZero(
        await descriptionEl(page, name).evaluate(
          (el) => getComputedStyle(el).transitionDuration,
        ),
      ),
    ).toBe(true)
    const deleteButton = page.getByRole('button', { name: `Delete '${name}'` })
    expect(
      allZero(
        await deleteButton.evaluate(
          (el) => getComputedStyle(el).transitionDuration,
        ),
      ),
    ).toBe(true)
    expect(
      allZero(
        await page
          .getByPlaceholder(CAPTURE_PLACEHOLDER)
          .evaluate((el) => getComputedStyle(el).transitionDuration),
      ),
    ).toBe(true)

    // The delete SAFETY windows are deliberately not motion (useArmedDelete
    // design comment): under reduced motion a second press inside the 300ms
    // muscle-memory window is still ABSORBED, and the armed state still holds
    // well before the 5s auto-revert. Both presses run in-browser with a fixed
    // same-task gap so event-loop stalls cannot accidentally cross 300ms. The
    // 5s auto-revert race
    // itself is unit-tested against the injectable clock (2.3) — asserting a
    // wall-clock 5s wait here would only buy flake.
    await deleteButton.evaluate((el) => {
      ;(el as HTMLElement).click() // arm
      ;(el as HTMLElement).click() // inside the no-commit window → absorbed
    })
    const armedButton = row(page, name).getByRole('button')
    await expect(armedButton).toHaveText('Confirm')
    await expect(row(page, name)).toHaveCount(1) // not committed

    await page.waitForTimeout(900) // ~1s after arming: still armed (< 5s revert)
    await expect(armedButton).toHaveText('Confirm')
    await expect(row(page, name)).toHaveCount(1)
  })
})

test.describe('responsive + 200%-zoom + reflow gates (Story 3.3, AC 1, 2, 6)', () => {
  const noHorizontalScroll = (page: Page) =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    )

  test('@p1 200% zoom (1280×800 ≡ 640×400 viewport): no horizontal scroll, everything operable', async ({
    page,
    seedTodos,
  }) => {
    const stamp = randomToken()
    const shortName = `zoom short ${stamp}`
    // Worst case for overflow: the contract-max 200-char description with a
    // long unbroken tail (no wrap opportunities — the 2-line clamp must clip).
    const longName = `zoom long ${stamp} ${'x'.repeat(200)}`.slice(0, 200)
    await seedTodos([{ description: shortName }, { description: longName }])

    await page.setViewportSize({ width: 640, height: 400 })
    await scopeListTo(page, stamp)
    await page.goto('/')
    await expect(page.getByRole('listitem')).toHaveCount(2)

    expect(await noHorizontalScroll(page)).toBe(true)

    // Capture input, row toggle, and delete affordance all remain visible and
    // clickable at this size.
    const input = page.getByPlaceholder(CAPTURE_PLACEHOLDER)
    await expect(input).toBeVisible()
    await input.fill(`zoom capture ${stamp}`)
    await expect(input).toHaveValue(`zoom capture ${stamp}`)
    await row(page, shortName).locator('label').click()
    await expect(
      page.getByRole('checkbox', { name: shortName }),
    ).toBeChecked()
    const deleteButton = page.getByRole('button', {
      name: `Delete '${longName}'`,
    })
    await deleteButton.click()
    await expect(row(page, longName).getByRole('button')).toHaveText('Confirm')
    expect(await noHorizontalScroll(page)).toBe(true)
  })

  test('@p1 mobile floor 320×568: no horizontal scroll, 16px padding, ≥48px touch targets', async ({
    page,
    seedTodos,
  }) => {
    const stamp = randomToken()
    const name = `mobile row ${stamp}`
    await seedTodos([{ description: name }])

    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/')
    await expect(row(page, name)).toHaveCount(1)

    expect(await noHorizontalScroll(page)).toBe(true)

    // Below the 640px breakpoint the column fills the width with 16px padding.
    const column = page.locator('main > div:not([aria-live])')
    await expect(column).toHaveCSS('padding-left', '16px')
    await expect(column).toHaveCSS('padding-right', '16px')

    // Touch targets: the row anchor and the capture input are ≥48px tall.
    const rowBox = await row(page, name).locator('label').boundingBox()
    expect(rowBox).not.toBeNull()
    expect(rowBox!.height).toBeGreaterThanOrEqual(48)
    const inputBox = await page
      .getByPlaceholder(CAPTURE_PLACEHOLDER)
      .boundingBox()
    expect(inputBox).not.toBeNull()
    expect(inputBox!.height).toBeGreaterThanOrEqual(48)
    const deleteBox = await page
      .getByRole('button', { name: `Delete '${name}'` })
      .boundingBox()
    expect(deleteBox).not.toBeNull()
    expect(deleteBox!.height).toBeGreaterThanOrEqual(48)
  })

  test('@p1 desktop 1280×800: column caps at 640px with 32px padding, paper to the edges', async ({
    page,
    seedTodos,
  }) => {
    const stamp = randomToken()
    const name = `desktop row ${stamp}`
    await seedTodos([{ description: name }])

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const desktopRow = row(page, name)
    await expect(desktopRow).toHaveCount(1)

    // ≥640px: content centred in a 640px column (border-box: max-width 40rem
    // caps the whole border box) with 32px padding.
    const column = page.locator('main > div:not([aria-live])')
    const columnBox = await column.boundingBox()
    expect(columnBox).not.toBeNull()
    expect(columnBox!.width).toBe(640)
    expect(columnBox!.x).toBe((1280 - 640) / 2) // centred
    await expect(column).toHaveCSS('padding-left', '32px')
    await expect(column).toHaveCSS('padding-right', '32px')

    // Paper to the edges: the surface background is carried by <body> (painted
    // over the full viewport) while <main> spans the full width around the
    // centred column. No literal colors — assert the body actually paints.
    const mainBox = await page.locator('main').boundingBox()
    expect(mainBox).not.toBeNull()
    expect(mainBox!.width).toBe(1280)
    const edgeColors = await page.evaluate(() => {
      const probe = document.createElement('span')
      probe.style.background = 'var(--color-surface)'
      document.body.append(probe)
      const colors = {
        body: getComputedStyle(document.body).backgroundColor,
        surface: getComputedStyle(probe).backgroundColor,
      }
      probe.remove()
      return colors
    })
    expect(edgeColors.body).toBe(edgeColors.surface)

    // Desktop Chrome is hover-capable: the pointer-only media rule reveals the
    // delete affordance and applies the row hover treatment.
    expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(
      true,
    )
    const deleteButton = page.getByRole('button', { name: `Delete '${name}'` })
    await expect(deleteButton).toHaveCSS('opacity', '0')
    const rowAnchor = desktopRow.locator('label')
    const idleBackground = await rowAnchor.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    await rowAnchor.hover()
    await expect(deleteButton).toHaveCSS('opacity', '1')
    await expect(rowAnchor).not.toHaveCSS('background-color', idleBackground)
  })

  test('@p1 reflow lock: toggle and arm-delete change zero geometry', async ({
    page,
    seedTodos,
  }) => {
    const stamp = randomToken()
    const seeded = await seedTodos([
      { description: `reflow one ${stamp}` },
      { description: `reflow two ${stamp}` },
      { description: `reflow three ${stamp}` },
    ])
    const names = seeded.map((t: NewTodo) => t.description)

    await scopeListTo(page, stamp)
    await page.goto('/')
    await expect(page.getByRole('listitem')).toHaveCount(3)

    const boxes = async () => {
      const out: Record<string, { x: number; y: number; width: number; height: number }> = {}
      for (const name of names) {
        const box = await row(page, name).boundingBox()
        if (!box) throw new Error(`row '${name}' has no bounding box`)
        out[name] = box
      }
      return out
    }
    const before = await boxes()

    // Toggle the LAST rendered row (= first seeded — canonical order is
    // completed ASC, updated_at DESC) so the completed-rows-sink-last re-sort
    // is an identity move: any geometry change left is real reflow.
    const toggleName = names[0]
    if (!toggleName) throw new Error('seeding failed')
    await row(page, toggleName).locator('label').click()
    await expect(page.getByRole('checkbox', { name: toggleName })).toBeChecked()
    // Settled: pending has cleared and the refetch has landed.
    await expect(row(page, toggleName)).not.toHaveAttribute('aria-busy', 'true')

    expect(await boxes()).toEqual(before) // no row moved or resized

    // Idle→armed delete is geometry-identical too (the ::after width
    // reservation pre-books the wider Confirm label).
    const armName = names[1]
    if (!armName) throw new Error('seeding failed')
    const deleteButton = page.getByRole('button', {
      name: `Delete '${armName}'`,
    })
    const buttonBefore = await deleteButton.boundingBox()
    await deleteButton.click()
    await expect(row(page, armName).getByRole('button')).toHaveText('Confirm')

    expect(await boxes()).toEqual(before)
    expect(
      await row(page, armName).getByRole('button').boundingBox(),
    ).toEqual(buttonBefore)
  })
})

test.describe('prefers-contrast gate (Story 3.3, AC 4)', () => {
  test('@p1 contrast: more collapses muted completed text to full contrast', async ({
    page,
    seedTodos,
    apiRequest,
  }) => {
    const stamp = randomToken()
    const activeName = `pc active ${stamp}`
    const doneName = `pc done ${stamp}`
    const [, done] = await seedTodos([
      { description: activeName },
      { description: doneName },
    ])
    if (!done) throw new Error('seeding failed')
    await apiRequest({
      method: 'PATCH',
      path: `/todos/${done.id}`,
      body: { completed: true },
    })

    await page.goto('/')
    await expect(row(page, doneName)).toHaveCount(1)

    const textColor = (description: string) =>
      descriptionEl(page, description).evaluate(
        (el) => getComputedStyle(el).color,
      )

    // Baseline (no preference): completed text is the muted token — visibly
    // distinct from active text. This guards that the emulation below is what
    // flips the assertion, not a broken selector.
    await page.emulateMedia({ contrast: 'no-preference' })
    const activeColor = await textColor(activeName)
    expect(await textColor(doneName)).not.toBe(activeColor)

    // prefers-contrast: more → --color-on-surface-muted resolves to the full
    // --color-on-surface. Compare against the live active row's color rather
    // than any literal (no hardcoded rgb — the token file stays the single
    // source of color truth). toHaveCSS retries: flipping the emulation live
    // animates the color via --motion-settle, so a one-shot read races it.
    await page.emulateMedia({ contrast: 'more' })
    await expect(descriptionEl(page, doneName)).toHaveCSS('color', activeColor)
  })
})
