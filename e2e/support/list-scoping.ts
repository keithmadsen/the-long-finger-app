import type { Page } from '@playwright/test'

// Parallel-safety helpers for UI specs reading the ONE shared e2e database.
// Single source of truth for the stamp + GET-scoping pattern the 3.1–3.4
// specs each carried a private copy of.

/**
 * A RANDOM stamp, never Date.now(): parallel workers can start in the same
 * epoch millisecond, and identical stamps defeat both specs' GET-scoping
 * filters (each would see the other's rows) — the 3.2 landmine.
 */
export const randomStamp = () => Math.random().toString(36).slice(2, 10)

/**
 * Scope GET /todos responses to rows whose description contains `stamp`.
 *
 * The harness runs fully parallel against one shared e2e DB, so list-wide
 * count/order assertions need a deterministic list. Only the READ is scoped:
 * every mutation (POST/PATCH/DELETE) still hits the real server and the real
 * refetch cycle drives the UI.
 *
 * ROUTE-ORDERING CAVEAT: Playwright matches routes newest-first. Any other
 * route on '/todos' (e.g. a delaying interceptor) must be registered BEFORE
 * this one so the GET scope stays newest — otherwise the filter is bypassed
 * for every request the other route doesn't fulfill itself (this exact leak
 * failed the first run of delete-path.spec.ts).
 */
export async function scopeListTo(page: Page, stamp: string) {
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
