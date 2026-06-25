import styles from './CharCounter.module.css'

export interface CharCounterProps {
  /** Current input length. */
  length: number
  /** Cap (the input's maxLength). Shown as the denominator. */
  max: number
  /** Length at/above which the counter appears (calm until you near the cap). */
  threshold: number
  /** id so the input can reference it via aria-describedby while visible. */
  id?: string
}

/*
 * The `N/200` character counter (AC 3). Stays hidden until the input nears the
 * cap (threshold, 180), then appears in the micro type scale + muted color. It
 * is purely supplementary — the maxLength cap is the real enforcement — so when
 * length < threshold it renders nothing at all.
 */
export function CharCounter({ length, max, threshold, id }: CharCounterProps) {
  if (length < threshold) {
    return null
  }

  return (
    <span className={styles.counter} id={id}>
      {length}/{max}
    </span>
  )
}
