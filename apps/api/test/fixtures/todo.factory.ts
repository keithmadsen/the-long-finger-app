export interface TodoFixture {
  id: string;
  description: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export function todoFixture(overrides: Partial<TodoFixture> = {}): TodoFixture {
  const suffix = overrides.id ?? 'todo-001';

  return {
    id: suffix,
    description: 'Write an acceptance test',
    completed: false,
    createdAt: '2026-06-17T09:00:00.000Z',
    updatedAt: '2026-06-17T09:00:00.000Z',
    ...overrides,
  };
}

export function createTodoBody(overrides: { id?: string; description?: string } = {}) {
  return {
    id: overrides.id ?? 'todo-create-001',
    description: overrides.description ?? 'Create a durable todo',
  };
}
