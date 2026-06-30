import { Button } from '../primitives'
import styles from './UnreadErrorIndicator.module.css'

export interface UnreadErrorIndicatorProps {
  /**
   * Number of failed-create rows above the list (the visible count). The caller
   * renders this component only when it should be visible; if count <= 0 the
   * component renders null defensively.
   */
  count: number
  /**
   * Activate (Enter/Space/click): scroll the first failed row into view + focus
   * its Retry. Owned by App.
   */
  onActivate: () => void
  /** Fired when the button receives focus — App marks the current failures "read" (AC 3). */
  onFocus?: () => void
  /** Fired on blur — App uses it to drop the kept-mounted-while-focused state (AC 3). */
  onBlur?: () => void
}

// The visible label (AC 1). Pluralize: 1 → "1 error above", ≥2 → "N errors above".
// Module-level helpers so the strings live in one place.
function visibleText(count: number): string {
  return count === 1 ? '1 error above' : `${count} errors above`
}

// The full accessible name (AC 4): the visible text is contained within it, so
// WCAG 2.5.3 Label-in-Name is satisfied.
function accessibleName(count: number): string {
  return `${visibleText(count)}. Press Enter to view the first failed task.`
}

/*
 * A small "N error(s) above" indicator shown right of the capture input when
 * unacknowledged failed-create rows exist (Story 1.10). Presentational: it wraps
 * the shared <Button> primitive (which owns the :focus-visible ring, forced-colors
 * border and type="button"); this recipe only adds the error-text typography and
 * the count→label/aria-label mapping. It never reaches the network and never
 * auto-focuses — App gates its visibility and owns onActivate/onFocus/onBlur.
 *
 * Native <button> activation already covers Enter, Space and mouse, so there is
 * no custom onKeyDown. The button is never pending/disabled, so the <Button>
 * click-guard never blocks onActivate.
 */
export function UnreadErrorIndicator({
  count,
  onActivate,
  onFocus,
  onBlur,
}: UnreadErrorIndicatorProps) {
  if (count <= 0) return null

  return (
    <Button
      aria-label={accessibleName(count)}
      className={styles.indicator}
      onBlur={onBlur}
      onClick={onActivate}
      onFocus={onFocus}
    >
      {visibleText(count)}
    </Button>
  )
}
