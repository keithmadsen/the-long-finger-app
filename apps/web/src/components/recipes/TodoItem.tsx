import type { KeyboardEvent } from 'react'
import type { Todo } from '@tlf/contracts'

import { Button, Checkbox } from '../primitives'
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
  /** Pending toggle destination. Lets the checkbox move before confirmed styling. */
  pendingCompleted?: boolean
  /** Toggle this row's completion (Story 1.8). The arg is the destination state. */
  onToggle?: (completed: boolean) => void
  /**
   * Failed-create variant (Story 1.9). When true the row is NOT a toggle <label>
   * (there is no server item to toggle, UX line 999): an empty checkbox slot,
   * full-contrast text, a left-border marker, and Retry + Dismiss affordances.
   */
  failed?: boolean
  /** Re-attempt the failed create with the same id (Story 1.9). */
  onRetry?: () => void
  /** Remove the failed row + abort any in-flight request (Story 1.9). */
  onDismiss?: () => void
  /** Id of the shared hidden help text a failed row references (AC 5). */
  describedById?: string
  /**
   * Armed state of the inline delete affordance (Story 2.2). When true the
   * affordance reads `Confirm` in --color-error; otherwise idle `Delete`. Single-
   * armed coordination is owned by <TodoList> via useArmedDelete.
   */
  armed?: boolean
  /** True while this row's DELETE is in flight (Committing; Story 2.1 deletingIds). */
  deleting?: boolean
  /** The single delete affordance handler (idle→armed, or armed→absorb|commit). */
  onDeletePress?: () => void
  /** Revert the armed affordance to idle (wired to the button's blur). */
  onDeleteCancel?: () => void
}

/*
 * A single task row. role="listitem" inside <TodoList>'s role="list".
 *
 * Whole-row tap-target DOM contract (epics Notes #11, UX-DR13): the row is a
 * wrapping <label> holding the <Checkbox> primitive + the description text, so
 * tapping anywhere on the row targets the checkbox. THIS MARKUP IS THE CONTRACT
 * later stories build on — Story 1.8 only adds onCheckedChange behavior; Epic 2
 * (Story 2.2) only ADDS a delete <button> as the LAST child inside the label with
 * stopPropagation (pointer AND keyboard). Do not rewrite the label markup.
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
export function TodoItem({
  todo,
  pending = false,
  pendingCompleted,
  onToggle,
  failed = false,
  onRetry,
  onDismiss,
  describedById,
  armed = false,
  deleting = false,
  onDeletePress,
  onDeleteCancel,
}: TodoItemProps) {
  // The delete row is another honest-pending consumer (Story 2.2): a Committing
  // (deleting) row is busy from t=0 and dims once past the flicker threshold, the
  // SAME seam create/toggle use. Feed pending||deleting so ariaBusy + showPending
  // already behave for delete.
  const { ariaBusy, showPending } = usePendingPresentation(pending || deleting)
  const checked = pendingCompleted ?? todo.completed
  // The affordance is inert while the row is create/toggle-pending (not yet a
  // stable server row) or already deleting (a second DELETE must not be invited).
  const showDeleteAffordance = Boolean(onDeletePress) && !pending && !deleting

  /*
   * Failed variant (Story 1.9). A DISTINCT internal branch (sanctioned by UX line
   * 815) — NOT the Active/Complete/Pending <label> row (the 1.8 contract, left
   * untouched). It is inert for toggle (no onToggle, no wrapping <label>): only
   * Retry/Dismiss are interactive. aria-busy is false; the row is not
   * aria-disabled. An empty checkbox slot preserves the row height (UX-DR22).
   */
  if (failed) {
    return (
      <li role="listitem">
        <div
          aria-describedby={describedById}
          className={[styles.item, styles.failed].filter(Boolean).join(' ')}
        >
          <span aria-hidden="true" className={styles.slot} />
          <span className={styles.description}>{todo.description}</span>
          <div className={styles.affordances}>
            {/*
             * data-failed-retry lets App find the FIRST failed row's Retry by a
             * stable selector (failed rows are pinned at the top, so document
             * order makes the first match the first failed row) to scroll + focus
             * it from the unread-error indicator (Story 1.10 AC 2). The <Button>
             * primitive spreads unknown props onto the native <button>, so the
             * attribute lands on the DOM node.
             */}
            <Button
              className={styles.retry}
              data-failed-retry
              onClick={onRetry}
            >
              Retry
            </Button>
            <Button className={styles.dismiss} onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      </li>
    )
  }

  const className = [
    styles.item,
    todo.completed ? styles.complete : null,
    // A committing (deleting) row is also honest-pending, so it keeps the .pending
    // muted-description treatment; .committing adds the opacity dim (AC 8). Both
    // are gated by showPending (flicker threshold) like the pending onset.
    showPending ? styles.pending : null,
    showPending && deleting ? styles.committing : null,
  ]
    .filter(Boolean)
    .join(' ')

  // Enter must toggle too (AC 2). The row label is also focusable as the row
  // anchor this story establishes; Space on that row anchor toggles as well.
  // Space bubbling from the native checkbox is ignored so it cannot double-fire.
  function handleKeyDown(event: KeyboardEvent<HTMLLabelElement>) {
    const rowHasFocus = event.target === event.currentTarget
    if (event.key !== 'Enter' && !(event.key === ' ' && rowHasFocus)) return
    event.preventDefault()
    if (pending) return
    onToggle?.(!checked)
  }

  return (
    <li aria-busy={ariaBusy || undefined} role="listitem">
      {/*
       * onKeyDown on the row catches Enter bubbling from the focused checkbox and
       * re-routes it to a toggle (Space stays native). The label's only
       * interactive control is that checkbox, so this is keyboard parity, not a
       * new interactive surface.
       */}
      <label
        aria-disabled={pending || undefined}
        className={className}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <Checkbox
          aria-disabled={pending || undefined}
          aria-label={todo.description}
          checked={checked}
          onCheckedChange={(checked) => {
            if (!pending) onToggle?.(checked)
          }}
          rootAsLabel={false}
        />
        <span className={styles.description}>{todo.description}</span>
        {showDeleteAffordance && (
          /*
           * The inline two-step delete affordance (Story 2.2). It is the LAST
           * child INSIDE the label (epics Notes #11) — an ADDED child, not a
           * rewrite of the 1.8 whole-row tap-target contract.
           *
           * stopPropagation is load-bearing on BOTH pointer and keyboard:
           *   • onClick: stop, then arm/confirm — the click must never reach the
           *     label→checkbox toggle path (AC 1).
           *   • onKeyDown: stop — the label's handleKeyDown toggles on Enter for
           *     ANY target, so Enter on this button would BOTH delete and toggle
           *     without this stop. (Space is already gated by target===currentTarget.)
           * data-armed-delete is present only on the currently armed affordance, so
           * a pointerdown on another row's idle Delete is treated as tap-away before
           * that row's click arms it. Blur reverts an armed row (Tab-away). The
           * visible text IS the accessible name this story (Story 2.3 enriches it
           * with aria-label + aria-pressed).
           */
          <Button
            className={[styles.delete, armed ? styles.armed : null]
              .filter(Boolean)
              .join(' ')}
            data-armed-delete={armed ? true : undefined}
            onBlur={onDeleteCancel}
            onClick={(event) => {
              event.stopPropagation()
              onDeletePress?.()
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {armed ? 'Confirm' : 'Delete'}
          </Button>
        )}
      </label>
    </li>
  )
}
