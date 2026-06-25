import { useEffect, useRef, useState } from 'react'

/*
 * The shared honest-pending PRESENTATION seam (Story 1.7, AC 4–8). Given a single
 * mutation's `pending` boolean it derives two INDEPENDENT signals:
 *
 *   - ariaBusy:    true from t=0 while the mutation is in-flight (AC 6). The
 *                  semantic "this row is busy" never waits on the visual delay,
 *                  so a screen-reader user learns of the in-flight item at once.
 *   - showPending: the VISUAL cue, gated by the flicker threshold + a minimum-hold
 *                  floor so the muted-contrast shift never flashes-and-vanishes.
 *
 * This is the contract toggle (1.8) and delete (Epic 2) consume — it is generic,
 * not create-specific. It is PER-ITEM: each pending row owns its own timers, so
 * two rows crossing the threshold settle on their own confirmations with no
 * shared/global settle clock (AC 7).
 *
 * The timing is driven by an INJECTABLE clock (AC 4), defaulting to real timers.
 * Tests drive it deterministically by passing a fake clock (or via fake timers);
 * production never buries a bare wall-clock setTimeout in the component.
 */

// No visual pending below this (UX "~150ms"). A confirm faster than this paints
// nothing — the create reads as instant.
export const FLICKER_THRESHOLD_MS = 150
// Once the visual appears it must persist at least this long before settling, so
// it cannot flash-and-vanish (AC 5). The UX spec mandates a floor but gives no
// number; ~500ms is a calm, tunable default. Single named constant on purpose.
export const PENDING_MIN_HOLD_MS = 500

// The clock seam: a minimal { now, setTimeout, clearTimeout } the hook drives
// instead of the global timers, so timing is deterministic under test. Handles
// are opaque (number under real/jsdom timers; whatever a fake clock returns).
export interface PendingClock {
  now: () => number
  setTimeout: (handler: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const realClock: PendingClock = {
  now: () => Date.now(),
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
}

export interface PendingPresentation {
  /** True from t=0 while in-flight — never gated by the visual delay (AC 6). */
  ariaBusy: boolean
  /** The delayed/held visual cue (flicker threshold + min-hold floor). */
  showPending: boolean
}

export function usePendingPresentation(
  pending: boolean,
  clock: PendingClock = realClock,
): PendingPresentation {
  const [showPending, setShowPending] = useState(false)

  // Timer handles + visual-state mirror live in refs so the effect can read/write
  // them synchronously without re-subscribing on every render. The `clock` is a
  // stable reference (a default param is a module singleton; an injected one is
  // stable per render), so it can be an effect dependency directly.
  const thresholdHandle = useRef<unknown>(null)
  const hideHandle = useRef<unknown>(null)
  const shownRef = useRef(false)
  const visibleSinceRef = useRef(0)

  useEffect(() => {
    const clk = clock

    if (pending) {
      // Still in-flight: cancel any scheduled hide (a re-pend before the floor).
      if (hideHandle.current !== null) {
        clk.clearTimeout(hideHandle.current)
        hideHandle.current = null
      }
      // Arm the flicker threshold once. If confirm beats it, the falling-edge
      // branch clears this before it fires — so the visual is never painted.
      if (!shownRef.current && thresholdHandle.current === null) {
        thresholdHandle.current = clk.setTimeout(() => {
          thresholdHandle.current = null
          shownRef.current = true
          visibleSinceRef.current = clk.now()
          setShowPending(true)
        }, FLICKER_THRESHOLD_MS)
      }
      return
    }

    // Confirmed (or rolled back): cancel an un-fired threshold (anti-flicker).
    if (thresholdHandle.current !== null) {
      clk.clearTimeout(thresholdHandle.current)
      thresholdHandle.current = null
    }
    // If the visual is already up, honour the minimum-hold floor before settling.
    if (shownRef.current && hideHandle.current === null) {
      const elapsed = clk.now() - visibleSinceRef.current
      if (elapsed >= PENDING_MIN_HOLD_MS) {
        shownRef.current = false
        setShowPending(false)
      } else {
        hideHandle.current = clk.setTimeout(() => {
          hideHandle.current = null
          shownRef.current = false
          setShowPending(false)
        }, PENDING_MIN_HOLD_MS - elapsed)
      }
    }
  }, [pending, clock])

  // Clear any outstanding timers on unmount.
  useEffect(() => {
    return () => {
      if (thresholdHandle.current !== null) clock.clearTimeout(thresholdHandle.current)
      if (hideHandle.current !== null) clock.clearTimeout(hideHandle.current)
    }
  }, [clock])

  return { ariaBusy: pending, showPending }
}
