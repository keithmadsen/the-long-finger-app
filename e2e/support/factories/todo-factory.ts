import { faker } from '@faker-js/faker'
import { v7 as uuidv7 } from 'uuid'

// The wire shape for POST /todos (`createTodoBody` in @tlf/contracts): the
// client owns identity via UUIDv7 before the server confirms (epics.md Note A.5),
// so the factory always mints an id. Faker keeps descriptions unique to avoid
// collisions across parallel workers (data-factories.md).
export type NewTodo = {
  id: string
  description: string
}

export const createTodo = (overrides: Partial<NewTodo> = {}): NewTodo => ({
  id: uuidv7(),
  description: faker.lorem.words({ min: 2, max: 5 }),
  ...overrides,
})
