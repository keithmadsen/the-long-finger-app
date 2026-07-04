import { test, expect, createTodo } from '../../support/ui-fixtures'

// Sample browser smoke (the `chromium` project). Demonstrates the harness
// end-to-end: API-first seeding, role-based selectors matching the app's
// accessibility contract, and network-error-monitor guarding against stray
// backend errors. Story 3.4 owns the full committed E2E suite (roving-tabindex,
// delete arm→confirm→revert, forced-colors/reduced-motion gates).

const CAPTURE_PLACEHOLDER = 'What do you want to do?'

test.describe('core loop smoke', () => {
  test('@p0 seeded todo renders and can be completed', async ({ page, seedTodos }) => {
    // Seed via the API (fast, self-cleaning) — the UI is for validation only.
    const [todo] = await seedTodos([{}])
    if (!todo) throw new Error('seedTodos did not return a todo')

    await page.goto('/')

    // The list container carries role="list"; each row exposes a checkbox whose
    // accessible name is the todo description (TodoItem aria-label={description}).
    const checkbox = page.getByRole('checkbox', { name: todo.description })
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()

    // Toggle the way a user does: the whole row is a <label> tap-target (Story 1.8),
    // and the real <input> sits behind a styled indicator that intercepts pointer
    // events — so drive the visible label, not checkbox.check() on the hidden input.
    await page.getByText(todo.description).click()
    await expect(checkbox).toBeChecked()
  })

  test('@p0 capture input adds a task', async ({ page, apiRequest }) => {
    const { description } = createTodo()

    await page.goto('/')

    const input = page.getByPlaceholder(CAPTURE_PLACEHOLDER)
    await expect(input).toBeFocused() // capture is sacred — first interactive element, autofocused
    await input.fill(description)
    await input.press('Enter')

    // The new row appears (honest-pending settles once the backend confirms).
    await expect(page.getByRole('checkbox', { name: description })).toBeVisible()

    // Self-cleaning: this row was created through the UI with a client-owned id
    // we don't hold, so reconcile against the API and delete by description.
    const { body } = await apiRequest<Array<{ id: string; description: string }>>({
      method: 'GET',
      path: '/todos',
    })
    for (const row of body.filter((t) => t.description === description)) {
      await apiRequest({ method: 'DELETE', path: `/todos/${row.id}` })
    }
  })
})
