import { useCallback, useEffect, useRef, useState } from 'react'

import { realClock, type PendingClock } from './usePendingPresentation'

/*
 * useArmedDelete — the inline two-step (arm-then-confirm) delete STATE MACHINE
 * (Story 2.2). It owns the single-armed coordination + the two safety timers and
 * is consumed by <TodoList> (epics AC 5: "coordination owned by <TodoList>";
 * arch line 303: per-row arbitration lives in the frontend hooks + <TodoItem>).
 *
 * It holds NO server/cache state — only which row is armed and the timers. The
 * DELETE mutation itself is useDeleteTodo (Story 2.1); this hook calls back via
 * onCommit(id) when a confirmed press should actually delete.
 *
 * Invariants:
 *   • At most ONE row armed at a time — enforced by storing a single armedId +
 *     a single revert timer (AC 5). Arming a new row auto-reverts the old one.
 *   • 300 ms no-commit window (AC 3): a second press within this window is
 *     ABSORBED (muscle-memory protection), NOT committed.
 *   • 5 s auto-revert (AC 4): an armed row with no commit reverts to idle. This
 *     is a SAFETY window (SR-announcement timing), NOT motion — it is unchanged
 *     under prefers-reduced-motion (only the CSS --motion-settle transition
 *     collapses; this JS timer does not).
 *
 * The timers are driven by the SAME injectable PendingClock as the honest-pending
 * thresholds (AC 6) — reused, not re-derived — so Story 2.3's race tests are
 * deterministic instead of wall-clock-flaky. Do NOT swap in a bare
 * window.setTimeout. [Source: usePendingPresentation.ts; epics.md Story 2.2 AC 6]
 */

// Second-tap-within guard (AC 3): a confirm press faster than this is muscle
// memory from the arm tap, so it is absorbed rather than committing.
export const DELETE_NO_COMMIT_WINDOW_MS = 300
// An armed row with no commit reverts after this (AC 4). The 5 s floor is derived
// from screen-reader announcement timing (~4 s to read the armed announcement);
// it is a safety window, so it is NOT collapsed under reduced motion.
export const DELETE_AUTO_REVERT_MS = 5000

export interface UseArmedDeleteOptions {
  /** Called with the row id when a confirmed press should actually delete. */
  onCommit: (id: string) => void
  /** Injectable clock (AC 6) — the SAME seam usePendingPresentation exposes. */
  clock?: PendingClock
}

export interface ArmedDelete {
  /** The id of the currently armed row, or null when none is armed. */
  armedId: string | null
  /** The single affordance handler: idle→armed, or armed→(absorb|commit). */
  press: (id: string) => void
  /** Revert to idle + clear the timer. Called on tap-away, blur, unmount. */
  cancel: () => void
}

export function useArmedDelete({
  onCommit,
  clock = realClock,
}: UseArmedDeleteOptions): ArmedDelete {
  const [armedId, setArmedId] = useState<string | null>(null)

  // Mirror armedId + the arm timestamp + the revert timer handle in refs so the
  // handlers/timer read them synchronously and stay stable across renders (mirror
  // usePendingPresentation's ref discipline).
  const armedIdRef = useRef<string | null>(null)
  const armedAtRef = useRef(0)
  const revertHandleRef = useRef<unknown>(null)

  const setArmed = useCallback((id: string | null) => {
    armedIdRef.current = id
    setArmedId(id)
  }, [])

  const clearRevertTimer = useCallback(() => {
    if (revertHandleRef.current !== null) {
      clock.clearTimeout(revertHandleRef.current)
      revertHandleRef.current = null
    }
  }, [clock])

  const cancel = useCallback(() => {
    clearRevertTimer()
    if (armedIdRef.current !== null) setArmed(null)
  }, [clearRevertTimer, setArmed])

  const press = useCallback(
    (id: string) => {
      // Second press on the ALREADY-armed row: absorb (muscle-memory) or commit.
      if (armedIdRef.current === id) {
        const elapsed = clock.now() - armedAtRef.current
        if (elapsed < DELETE_NO_COMMIT_WINDOW_MS) return // absorbed (AC 3)
        // Committed press (AC 3/7): a second tap after the window deletes — never
        // cancels (cancel paths are wait-5 s / tap-away / blur / arm-another-row).
        clearRevertTimer()
        setArmed(null)
        onCommit(id)
        return
      }

      // Idle, or a DIFFERENT row is armed → arm THIS row. Restarting the single
      // timer + overwriting the single armedId auto-reverts the previous row
      // (AC 5, "arm a different row").
      clearRevertTimer()
      armedAtRef.current = clock.now()
      setArmed(id)
      revertHandleRef.current = clock.setTimeout(() => {
        revertHandleRef.current = null
        setArmed(null)
      }, DELETE_AUTO_REVERT_MS)
    },
    [clock, clearRevertTimer, setArmed, onCommit],
  )

  // Tap-away reverts (AC 5): while a row is armed, a pointerdown anywhere that is
  // NOT inside the armed affordance reverts to idle. Capture phase + pointerdown
  // (not click) so tapping elsewhere reverts BEFORE that element's own click
  // resolves. Gated on armedId so it is only attached while armed.
  useEffect(() => {
    if (armedId === null) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (
        target instanceof Element &&
        target.closest('[data-armed-delete]')
      ) {
        return
      }
      cancel()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [armedId, cancel])

  // Clear any outstanding revert timer on unmount.
  useEffect(() => {
    return () => clearRevertTimer()
  }, [clearRevertTimer])

  return { armedId, press, cancel }
}
