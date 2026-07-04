import { mergeTests } from '@playwright/test'
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures'
import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures'

// Test object for pure API / service specs (**/*.api.spec.ts, `api` project).
// Deliberately browserless — no page/network-error-monitor fixtures — so these
// run fast without launching Chromium. `apiRequest` resolves paths against the
// Playwright baseURL (the Vite proxy → Fastify); `recurse` polls for eventual
// consistency where needed. See overview.md / api-request.md.
export const test = mergeTests(apiRequestFixture, recurseFixture)

export { expect } from '@playwright/test'
