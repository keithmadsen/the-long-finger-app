import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  DELETE_AUTO_REVERT_MS,
  DELETE_NO_COMMIT_WINDOW_MS,
  useArmedDelete,
} from './useArmedDelete'
import { type PendingClock } from './usePendingPresentation'

/*
 * The SAME deterministic injectable clock the honest-pending tests use (copied
 * from usePendingPresentation.test.ts per AC 6 — NOT vi.useFakeTimers). advance()
 * moves virtual time and fires due timers in chronological order.
 */
function makeFakeClock() {
  let current = 0
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

  function advance(ms: number) {
    current += ms
    const due = [...timers.entries()]
      .filter(([, t]) => t.fireAt <= current)
      .sort((a, b) => a[1].fireAt - b[1].fireAt)
    for (const [id, t] of due) {
      timers.delete(id)
      t.fn()
    }
  }

  return { clock, advance }
}

function setup() {
  const fake = makeFakeClock()
  const onCommit = vi.fn()
  const view = renderHook(() =>
    useArmedDelete({ onCommit, clock: fake.clock }),
  )
  return {
    result: view.result,
    onCommit,
    advance: (ms: number) => act(() => fake.advance(ms)),
    press: (id: string) => act(() => view.result.current.press(id)),
    cancel: () => act(() => view.result.current.cancel()),
  }
}

describe('useArmedDelete', () => {
  it('starts idle (armedId null)', () => {
    const { result } = setup()
    expect(result.current.armedId).toBeNull()
  })

  it('press(id) once arms the row (AC 3)', () => {
    const { result, press, onCommit } = setup()

    press('a')

    expect(result.current.armedId).toBe('a')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('a second press within the 300 ms no-commit window is ABSORBED (AC 3)', () => {
    const { result, press, advance, onCommit } = setup()

    press('a')
    advance(DELETE_NO_COMMIT_WINDOW_MS - 1) // 299 ms — still inside the window
    press('a')

    // Muscle-memory guard: does not commit, stays armed.
    expect(onCommit).not.toHaveBeenCalled()
    expect(result.current.armedId).toBe('a')
  })

  it('a second press at/after the 300 ms window COMMITS once (AC 3, 7)', () => {
    const { result, press, advance, onCommit } = setup()

    press('a')
    advance(DELETE_NO_COMMIT_WINDOW_MS) // exactly at the window edge
    press('a')

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('a')
    // Committing disarms the row.
    expect(result.current.armedId).toBeNull()
  })

  it('auto-reverts to idle after 5 s with no commit (AC 4)', () => {
    const { result, press, advance, onCommit } = setup()

    press('a')
    advance(DELETE_AUTO_REVERT_MS)

    expect(result.current.armedId).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('the 5 s auto-revert does NOT fire early (just before the floor it stays armed)', () => {
    const { result, press, advance } = setup()

    press('a')
    advance(DELETE_AUTO_REVERT_MS - 1)

    expect(result.current.armedId).toBe('a')
  })

  it('arming a different row disarms the first — single-armed invariant (AC 5)', () => {
    const { result, press, advance } = setup()

    press('a')
    advance(100)
    press('b')

    expect(result.current.armedId).toBe('b')
  })

  it('arming a second row restarts the timer so the first row cannot commit late', () => {
    const { result, press, advance, onCommit } = setup()

    press('a')
    advance(100)
    press('b') // re-arms; the old 5 s timer for 'a' is cleared

    // 'a' was armed at t=0 (would revert at t=5000); 'b' at t=100 (reverts at
    // t=5100). At t=5000 the ONLY armed row is 'b' and it must still be armed —
    // proving 'a's original timer was cleared and did not disarm 'b'.
    advance(DELETE_AUTO_REVERT_MS - 100) // t = 5000
    expect(result.current.armedId).toBe('b')

    advance(100) // t = 5100 — b's own 5 s floor
    expect(result.current.armedId).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('cancel() reverts to idle and clears the timer (no stale later revert)', () => {
    const { result, press, cancel, advance, onCommit } = setup()

    press('a')
    cancel()
    expect(result.current.armedId).toBeNull()

    // A later advance past the original 5 s must not fire a stale revert callback.
    advance(DELETE_AUTO_REVERT_MS)
    expect(result.current.armedId).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })
})
