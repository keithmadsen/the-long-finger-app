import { useMemo } from 'react'
import type { Todo } from '@tlf/contracts'

import { TodoItem } from './TodoItem'
import { useArmedDelete } from '../../hooks/useArmedDelete'
import { useRovingTabindex } from '../../hooks/useRovingTabindex'
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
  /** Commit a confirmed delete by id (2.2). Wired by App to useDeleteTodo. */
  onDelete?: (id: string) => void
  /** Ids whose DELETE is in flight — each maps to a Committing <TodoItem> (2.1). */
  deletingIds?: ReadonlySet<string>
  /**
   * Return focus to the capture input (Story 3.1): Escape on a row anchor, and
   * the stranded-focus fallback when a delete empties the list. Wired by App to
   * the CaptureInput focus() handle.
   */
  onListEscape?: () => void
}

/*
 * The ordered list of tasks (UX-DR12). Renders one <TodoItem> per todo IN THE
 * ORDER RECEIVED — the backend (completed ASC, updated_at DESC) is the single
 * canonical-order authority and the frontend never re-sorts (AC 8).
 *
 * Roving tabindex (Story 3.1 / UX-DR24): useRovingTabindex keeps exactly one
 * row anchor in the page tab sequence and moves focus on Arrow/Home/End via the
 * container keydown attached to the <ul>. Only NORMAL rows are navigable —
 * failed rows have no anchor and keep their natively-tabbable Retry/Dismiss
 * (UX line 1390). Armed-delete coordination (Epic 2 / UX-DR-delete) lives HERE
 * (epics AC 5, "coordination owned by <TodoList>"): the useArmedDelete state
 * machine enforces the single-armed invariant across rows and drives each row's
 * `armed` prop. The hybrid in-place vs. reorder session rule (UX-DR17) is
 * unchanged.
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
  onDelete,
  deletingIds,
  onListEscape,
}: TodoListProps) {
  // The single-armed arm-then-confirm state machine (AC 5). A confirmed press
  // calls back into App's delete mutation. The 300 ms / 5 s timers run on the
  // default realClock in production; Story 2.3 injects a fake clock for races.
  const { armedId, press, cancel } = useArmedDelete({
    onCommit: (id) => onDelete?.(id),
  })

  // The navigable ids, in render order (derivative of query order — never
  // re-sorted). Failed rows are excluded: they render no row anchor (Story 3.1).
  const navigableIds = useMemo(
    () =>
      todos
        .filter((todo) => !(failedIds?.has(todo.id) ?? false))
        .map((todo) => todo.id),
    [todos, failedIds],
  )

  // List-wide keyboard navigation (Story 3.1): the roving-anchor coordinator.
  // Its container keydown binds NOTHING with a modifier — Cmd/Ctrl+Z and every
  // other browser/OS shortcut pass through untouched (AC 6 / NG-6; see the undo
  // contract comment inside useRovingTabindex).
  const { getAnchorProps, containerProps } = useRovingTabindex({
    ids: navigableIds,
    onEscape: onListEscape,
  })

  return (
    <ul className={styles.list} role="list" {...containerProps}>
      {todos.map((todo) => {
        // A failed row is rendered as the Failed variant and is NEVER also
        // treated as pending/toggling (it has no in-flight create or server item).
        const isFailed = failedIds?.has(todo.id) ?? false
        const canDelete = !isFailed && onDelete !== undefined
        const roving = isFailed ? undefined : getAnchorProps(todo.id)
        return (
          <TodoItem
            key={todo.id}
            anchorTabIndex={roving?.tabIndex}
            armed={armedId === todo.id}
            deleting={deletingIds?.has(todo.id) ?? false}
            describedById={describedById}
            failed={isFailed}
            onAnchorFocus={roving?.onFocus}
            onDeleteCancel={cancel}
            onDeletePress={canDelete ? () => press(todo.id) : undefined}
            onDismiss={() => onDismiss?.(todo.id)}
            onRetry={() => onRetry?.(todo.id)}
            onToggle={(completed) => onToggle?.(todo.id, completed)}
            pendingCompleted={isFailed ? undefined : togglingCompletedById?.[todo.id]}
            pending={
              !isFailed &&
              ((pendingIds?.has(todo.id) ?? false) ||
                togglingCompletedById?.[todo.id] !== undefined)
            }
            registerAnchor={roving?.ref}
            todo={todo}
          />
        )
      })}
    </ul>
  )
}
