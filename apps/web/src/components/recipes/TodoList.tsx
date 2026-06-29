import type { Todo } from '@tlf/contracts'

import { TodoItem } from './TodoItem'
import styles from './TodoList.module.css'

export interface TodoListProps {
  todos: Todo[]
  /** Ids whose create is in-flight — each maps to a Pending <TodoItem> (1.7). */
  pendingIds?: ReadonlySet<string>
  /** Pending toggle destination by id, used for checkbox-only optimistic feedback. */
  togglingCompletedById?: Readonly<Record<string, boolean>>
  /** Toggle a row's completion (1.8). Wired by App to useToggleTodo. */
  onToggle?: (id: string, completed: boolean) => void
  /** Ids in the Failed-create state — each maps to a Failed <TodoItem> (1.9). */
  failedIds?: ReadonlySet<string>
  /** Re-attempt a failed create by id (1.9). */
  onRetry?: (id: string) => void
  /** Dismiss a failed row by id (1.9). */
  onDismiss?: (id: string) => void
  /** Id of the shared hidden help text every failed row references (AC 5). */
  describedById?: string
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
  togglingCompletedById,
  onToggle,
  failedIds,
  onRetry,
  onDismiss,
  describedById,
}: TodoListProps) {
  return (
    <ul className={styles.list} role="list">
      {todos.map((todo) => {
        // A failed row is rendered as the Failed variant and is NEVER also
        // treated as pending/toggling (it has no in-flight create or server item).
        const isFailed = failedIds?.has(todo.id) ?? false
        return (
          <TodoItem
            key={todo.id}
            describedById={describedById}
            failed={isFailed}
            onDismiss={() => onDismiss?.(todo.id)}
            onRetry={() => onRetry?.(todo.id)}
            onToggle={(completed) => onToggle?.(todo.id, completed)}
            pendingCompleted={isFailed ? undefined : togglingCompletedById?.[todo.id]}
            pending={
              !isFailed &&
              ((pendingIds?.has(todo.id) ?? false) ||
                togglingCompletedById?.[todo.id] !== undefined)
            }
            todo={todo}
          />
        )
      })}
    </ul>
  )
}
