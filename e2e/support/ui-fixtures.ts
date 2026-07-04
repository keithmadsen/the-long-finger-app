import { mergeTests } from '@playwright/test'
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures'
import { test as interceptFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures'
import { test as networkErrorMonitorFixture } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures'
import { createTodo, type NewTodo } from './factories/todo-factory'

// A custom `seedTodos` fixture layered on top of apiRequest: seed state through
// the API (fast, parallel-safe) before driving the UI — UI is for validation
// only, never setup (data-factories.md). Created rows are deleted in teardown so
// specs stay self-cleaning against the shared E2E database. The delete endpoint
// is idempotent (204 whether or not the row exists), so cleanup never flakes.
const seedFixture = apiRequestFixture.extend<{
  seedTodos: (todos?: Array<Partial<NewTodo>>) => Promise<NewTodo[]>
}>({
  seedTodos: async ({ apiRequest }, use) => {
    const created: NewTodo[] = []

    const seed = async (todos: Array<Partial<NewTodo>> = [{}]) => {
      const results: NewTodo[] = []
      for (const overrides of todos) {
        const todo = createTodo(overrides)
        const { status } = await apiRequest({ method: 'POST', path: '/todos', body: todo })
        if (status !== 201) {
          throw new Error(`Failed to seed todo (expected 201, got ${status})`)
        }
        created.push(todo)
        results.push(todo)
      }
      return results
    }

    await use(seed)

    for (const todo of created) {
      await apiRequest({ method: 'DELETE', path: `/todos/${todo.id}` })
    }
  },
})

// Test object for browser specs (`chromium` project). Combines:
//   - seedTodos + apiRequest (API-first setup)
//   - interceptNetworkCall (spy/stub, e.g. forced-error rollback paths)
//   - network-error-monitor (auto-fail on stray 4xx/5xx — opt out per test with
//     the `skipNetworkMonitoring` annotation for intentional-error specs)
export const test = mergeTests(seedFixture, interceptFixture, networkErrorMonitorFixture)

export { expect } from '@playwright/test'
export { createTodo, type NewTodo } from './factories/todo-factory'
