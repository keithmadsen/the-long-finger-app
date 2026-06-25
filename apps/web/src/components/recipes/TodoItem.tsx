import type { KeyboardEvent } from 'react'
import type { Todo } from '@tlf/contracts'

import { Checkbox } from '../primitives'
import { usePendingPresentation } from '../../hooks/usePendingPresentation'
import styles from './TodoItem.module.css'

export interface TodoItemProps {
  todo: Todo
  /**
   * True while this row's create OR toggle is in-flight (honest-pending; Story
   * 1.7/1.8). While pending the row is inert: taps/keys are absorbed and it is
   * aria-disabled (AC 8).
   */
  pending?: boolean
  /** Toggle this row's completion (Story 1.8). The arg is the destination state. */
  onToggle?: (completed: boolean) => void
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
 * Story 1.8 wires the checkbox's onCheckedChange → onToggle (App's
 * useToggleTodo). A tap anywhere on the row (the wrapping <label>) toggles via
 * the single checkbox it labels. Keyboard: Space toggles natively; Enter does
 * NOT on a checkbox, so it is wired explicitly (onKeyDown, preventDefault).
 * Both paths are guarded by `!pending` so an in-flight row absorbs repeat
 * taps/keys (AC 8); the checkbox carries aria-disabled while pending so focus
 * visibility is preserved (gotcha: aria-disabled, never HTML disabled).
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
export function TodoItem({ todo, pending = false, onToggle }: TodoItemProps) {
  const { ariaBusy, showPending } = usePendingPresentation(pending)

  const className = [
    styles.item,
    todo.completed ? styles.complete : null,
    showPending ? styles.pending : null,
  ]
    .filter(Boolean)
    .join(' ')

  // Enter must toggle too (AC 2). A native checkbox toggles on Space only, so
  // Enter is wired explicitly: catch it bubbling from the focused input to the
  // row, fire the same toggle (to the destination state), and preventDefault.
  // Guarded by !pending so an in-flight row absorbs the key (AC 8). Space is
  // left to the native checkbox — handling only Enter avoids a double-toggle.
  function handleKeyDown(event: KeyboardEvent<HTMLLabelElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (pending) return
    onToggle?.(!todo.completed)
  }

  return (
    <li aria-busy={ariaBusy || undefined} role="listitem">
      {/*
       * onKeyDown on the row catches Enter bubbling from the focused checkbox and
       * re-routes it to a toggle (Space stays native). The label's only
       * interactive control is that checkbox, so this is keyboard parity, not a
       * new interactive surface.
       */}
      <label className={className} onKeyDown={handleKeyDown}>
        <Checkbox
          aria-disabled={pending || undefined}
          aria-label={todo.description}
          checked={todo.completed}
          onCheckedChange={(checked) => {
            if (!pending) onToggle?.(checked)
          }}
        />
        <span className={styles.description}>{todo.description}</span>
      </label>
    </li>
  )
}
