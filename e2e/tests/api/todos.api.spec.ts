import { test, expect } from '../../support/api-fixtures'
import { createTodo } from '../../support/factories/todo-factory'

// Sample pure-API specs (the `api` project — no browser). These demonstrate the
// canonical apiRequest + factory pattern from test-design-qa.md so the harness
// is proven end-to-end; Story 3.4 owns the full committed API coverage.
//
// Tag convention (@p0/@p1, @API) drives selective runs:
//   npx playwright test --grep @p0
//   npx playwright test --grep "@p0|@p1"

test.describe('POST /todos', () => {
  test('@p0 @API create persists a todo', async ({ apiRequest }) => {
    const todo = createTodo()

    const { status, body } = await apiRequest<{ id: string; completed: boolean }>({
      method: 'POST',
      path: '/todos',
      body: todo,
    })

    expect(status).toBe(201)
    expect(body.id).toBe(todo.id)
    expect(body.completed).toBe(false)

    // Self-cleaning: remove the row we created (delete is idempotent).
    await apiRequest({ method: 'DELETE', path: `/todos/${todo.id}` })
  })
})

test.describe('DELETE /todos/:id', () => {
  // R-005: DELETE is idempotent — 204 whether or not the row exists.
  test('@p1 @API delete is idempotent', async ({ apiRequest }) => {
    const { id } = createTodo()

    const first = await apiRequest({ method: 'DELETE', path: `/todos/${id}` })
    expect(first.status).toBe(204)

    const second = await apiRequest({ method: 'DELETE', path: `/todos/${id}` })
    expect(second.status).toBe(204) // idempotent — no 404
  })
})
