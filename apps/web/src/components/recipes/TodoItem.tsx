import type { Todo } from '@tlf/contracts'

import { Checkbox } from '../primitives'
import styles from './TodoItem.module.css'

export interface TodoItemProps {
  todo: Todo
}

/*
 * A single task row. role="listitem" inside <TodoList>'s role="list".
 *
 * Whole-row tap-target DOM contract (epics Notes #11, UX-DR13): the row is a
 * wrapping <label> holding the <Checkbox> primitive + the description text, so
 * tapping anywhere on the row targets the checkbox. THIS MARKUP IS THE CONTRACT
 * later stories build on — Story 1.8 only adds onCheckedChange behavior; Epic 2
 * only ADDS a sibling delete <button> with stopPropagation. Do not rewrite it.
 *
 * The checkbox is PRESENTATIONAL in 1.6: it reflects todo.completed but has no
 * onCheckedChange, so clicking is inert (the primitive still attaches a native
 * onChange, so React keeps it controlled with no missing-handler warning, and
 * no app state changes). Story 1.8 wires onCheckedChange → useToggleTodo.
 *
 * Two display variants only (AC 3):
 *   Active   → full-contrast text, unchecked box.
 *   Complete → ALL THREE non-color cues: strikethrough + checked box + muted
 *              text. A colorblind user distinguishes complete from active via
 *              strikethrough + checkbox alone (never the color shift alone).
 * Row height is stable per state (UX-DR22): toggling only changes color and
 * strikethrough, never layout.
 */
export function TodoItem({ todo }: TodoItemProps) {
  const className = [styles.item, todo.completed ? styles.complete : null]
    .filter(Boolean)
    .join(' ')

  return (
    <li role="listitem">
      <label className={className}>
        <Checkbox aria-label={todo.description} checked={todo.completed} />
        <span className={styles.description}>{todo.description}</span>
      </label>
    </li>
  )
}
