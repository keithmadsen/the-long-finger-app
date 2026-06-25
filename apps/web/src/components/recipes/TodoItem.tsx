import type { Todo } from '@tlf/contracts'

import { Checkbox } from '../primitives'
import { usePendingPresentation } from '../../hooks/usePendingPresentation'
import styles from './TodoItem.module.css'

export interface TodoItemProps {
  todo: Todo
  /** True while this row's create is in-flight (honest-pending; Story 1.7). */
  pending?: boolean
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
 * Display variants:
 *   Active   → full-contrast text, unchecked box.
 *   Complete → ALL THREE non-color cues: strikethrough + checked box + muted
 *              text. A colorblind user distinguishes complete from active via
 *              strikethrough + checkbox alone (never the color shift alone).
 *   Pending  → (Story 1.7, create in-flight) a muted-contrast shift ONLY:
 *              text → --color-pending. NO spinner, shimmer, italic, position
 *              shift, size or font-weight change (AC 6). Row height stays stable
 *              (UX-DR22). aria-busy is set from t=0 (not gated by the visual
 *              delay); the colour shift is gated by the honest-pending threshold
 *              + min-hold so it never flashes (usePendingPresentation).
 * Row height is stable per state (UX-DR22): variants change colour/strikethrough
 * only, never layout.
 *
 * The checkbox stays presentational/inert while pending (toggle is Story 1.8).
 */
export function TodoItem({ todo, pending = false }: TodoItemProps) {
  const { ariaBusy, showPending } = usePendingPresentation(pending)

  const className = [
    styles.item,
    todo.completed ? styles.complete : null,
    showPending ? styles.pending : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li aria-busy={ariaBusy || undefined} role="listitem">
      <label className={className}>
        <Checkbox aria-label={todo.description} checked={todo.completed} />
        <span className={styles.description}>{todo.description}</span>
      </label>
    </li>
  )
}
