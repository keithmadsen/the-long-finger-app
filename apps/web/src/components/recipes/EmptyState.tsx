import { Button } from '../primitives'
import styles from './EmptyState.module.css'

export type EmptyStateVariant = 'empty' | 'loading' | 'failed'

export interface EmptyStateProps {
  variant: EmptyStateVariant
  /** Retry handler — used by the `failed` variant only (→ refetch). */
  onRetry?: () => void
}

/*
 * The three layout-stable non-list surfaces (FR-8). This recipe owns the
 * layout-stability rules so <App> just picks a variant.
 *
 * empty   (AC 5): "Your list will appear here." (muted) + a single dashed
 *                 divider. The state line reserves min-height so the layout does
 *                 not jump when the list empties. NO instruction line here —
 *                 "Type a task and press Enter…" arrives with Story 1.7's input.
 * loading (AC 1): "Loading…" (muted). No divider, no aria-live (it would
 *                 announce on every load — UX-DR25). No layout shift on arrival.
 * failed  (AC 6): "Couldn't load your list. Refresh to try again." (error
 *                 color) + a Retry button (→ onRetry). The single LiveRegion
 *                 announcement is fired by <App>, NOT here.
 */
export function EmptyState({ variant, onRetry }: EmptyStateProps) {
  if (variant === 'loading') {
    return (
      <div className={styles.root}>
        <p className={styles.line}>Loading…</p>
      </div>
    )
  }

  if (variant === 'failed') {
    return (
      <div className={styles.root}>
        <p className={[styles.line, styles.error].join(' ')}>
          Couldn&rsquo;t load your list. Refresh to try again.
        </p>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    )
  }

  // empty
  return (
    <div className={styles.root}>
      <p className={[styles.line, styles.reserved].join(' ')}>
        Your list will appear here.
      </p>
      <div aria-hidden="true" className={styles.divider} />
    </div>
  )
}
