// TTI slow-3G sign-off measurement (Story 3.4, Task 8 — evidence, not a gate).
// Drives the BUILT app served by the production container through Chromium
// with CDP Network.emulateNetworkConditions at the DevTools Slow-3G preset
// (~400 ms latency, ~400 Kbps ≈ 50 KB/s down/up). "Usable list" = the capture
// input is visible AND the list surface (empty-state line here — fresh DB) has
// rendered, i.e. the user can both read their list state and start typing.
import { chromium } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002'
const RUNS = 3

const results = []
for (let i = 0; i < RUNS; i++) {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: 50_000,
    uploadThroughput: 50_000,
  })

  const start = Date.now()
  await page.goto(BASE_URL, { waitUntil: 'commit', timeout: 60_000 })
  await Promise.all([
    page.getByPlaceholder('What do you want to do?').waitFor({ state: 'visible', timeout: 60_000 }),
    page.getByText('Your list will appear here.').waitFor({ state: 'visible', timeout: 60_000 }),
  ])
  const usable = Date.now() - start

  const paint = await page.evaluate(() =>
    JSON.stringify({
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      nav: performance.getEntriesByType('navigation')[0]?.duration,
    }),
  )
  results.push({ run: i + 1, usableMs: usable, paint: JSON.parse(paint) })
  await browser.close()
}

for (const r of results) {
  console.log(
    `run ${r.run}: time-to-usable-list ${r.usableMs} ms (FCP ${Math.round(r.paint.fcp ?? -1)} ms)`,
  )
}
const sorted = results.map((r) => r.usableMs).sort((a, b) => a - b)
console.log(`median time-to-usable-list: ${sorted[Math.floor(RUNS / 2)]} ms`)
