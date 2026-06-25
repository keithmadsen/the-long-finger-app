import type { Todo } from '@tlf/contracts'

import { TodoItem } from './TodoItem'
import styles from './TodoList.module.css'

export interface TodoListProps {
  todos: Todo[]
  /** Ids whose create is in-flight — each maps to a Pending <TodoItem> (1.7). */
  pendingIds?: ReadonlySet<string>
  /** Ids whose completion toggle is in-flight — also renders Pending (1.8). */
  togglingIds?: ReadonlySet<string>
  /** Toggle a row's completion (1.8). Wired by App to useToggleTodo. */
  onToggle?: (id: string, completed: boolean) => void
}

/*
 * The ordered list of tasks (UX-DR12). Renders one <TodoItem> per todo IN THE
 * ORDER RECEIVED — the backend (completed ASC, updated_at DESC) is the single
 * canonical-order authority and the frontend never re-sorts (AC 8).
 *
 * Deliberately a plain ordered render for now: no roving-tabindex (Epic 3 /
 * UX-DR24) and no armed-delete coordination (Epic 2). The hybrid in-place vs.
 * reorder session rule (UX-DR17) is NOT exercised here — there is no toggle in
 * 1.6 — so Story 1.8 can add in-place behavior without surprise.
 *
 * <ul> already carries the list role; the explicit role="list" guards against
 * the list-role being stripped when list-style is removed in some browsers.
 */
export function TodoList({
  todos,
  pendingIds,
  togglingIds,
  onToggle,
}: TodoListProps) {
  return (
    <ul className={styles.list} role="list">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          onToggle={(completed) => onToggle?.(todo.id, completed)}
          pending={
            (pendingIds?.has(todo.id) ?? false) ||
            (togglingIds?.has(todo.id) ?? false)
          }
          todo={todo}
        />
      ))}
    </ul>
  )
}
