import type { PendingClock } from '../hooks/usePendingPresentation'

/*
 * The deterministic injectable clock for tests that drive the production
 * PendingClock seam (NOT vi.useFakeTimers — the seam is the point).
 *
 * - advance(ms): move virtual time and fire due timers in chronological order.
 * - jump(ms):    move virtual time WITHOUT firing — a backgrounded tab or
 *                laptop sleep, where the browser throttles/suspends setTimeout.
 * - runDue():    fire every timer whose deadline has been reached (pair with
 *                jump() when a test wakes the timers manually).
 */
export function makeFakeClock(start = 0) {
  let current = start
  let nextId = 1
  const timers = new Map<number, { fireAt: number; fn: () => void }>()

  const clock: PendingClock = {
    now: () => current,
    setTimeout: (fn, ms) => {
      const id = nextId++
      timers.set(id, { fireAt: current + ms, fn })
      return id
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number)
    },
  }

  function runDue() {
    const due = [...timers.entries()]
      .filter(([, t]) => t.fireAt <= current)
      .sort((a, b) => a[1].fireAt - b[1].fireAt)
    for (const [id, t] of due) {
      timers.delete(id)
      t.fn()
    }
  }

  function jump(ms: number) {
    current += ms
  }

  function advance(ms: number) {
    jump(ms)
    runDue()
  }

  return { clock, advance, jump, runDue }
}
