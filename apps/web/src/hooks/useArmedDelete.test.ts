import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makeFakeClock } from '../test/fakeClock'
import {
  DELETE_AUTO_REVERT_MS,
  DELETE_NO_COMMIT_WINDOW_MS,
  useArmedDelete,
} from './useArmedDelete'

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
    unmount: () => act(() => view.unmount()),
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

  // Story 3.4 (delete-path coverage gate): the tap-away listener's two
  // branches at the hook level — TodoList exercises the revert path through
  // the component, but the [data-armed-delete] guard (don't revert when the
  // pointer lands INSIDE the armed affordance) had no direct test.
  describe('tap-away pointerdown (AC 5)', () => {
    it('a pointerdown INSIDE the armed affordance does NOT revert ([data-armed-delete] guard)', () => {
      const { result, press } = setup()
      const affordance = document.createElement('button')
      affordance.setAttribute('data-armed-delete', '')
      document.body.append(affordance)

      press('a')
      act(() => {
        affordance.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      })
      expect(result.current.armedId).toBe('a')

      affordance.remove()
    })

    it('a pointerdown anywhere else reverts to idle', () => {
      const { result, press } = setup()

      press('a')
      act(() => {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      })
      expect(result.current.armedId).toBeNull()
    })
  })

  // Story 2.3 (AC 6): the three named delete state-machine races, driven
  // deterministically by the injectable clock (never vi.useFakeTimers).
  describe('state-race hardening (Story 2.3 AC 6)', () => {
    it('Race 1 — a delete fired during the 300 ms no-commit window is absorbed, and the row stays committable after', () => {
      const { result, press, advance, onCommit } = setup()

      press('a') // t=0, arm
      advance(DELETE_NO_COMMIT_WINDOW_MS - 1) // t=299, still inside the window
      press('a') // absorbed (muscle memory), NOT committed

      expect(onCommit).not.toHaveBeenCalled()
      expect(result.current.armedId).toBe('a') // arm survives the absorbed press

      // Advancing the rest of the window does not lose the arm (still < 5 s).
      advance(1) // t=300
      expect(result.current.armedId).toBe('a')

      // A later press now past the window commits exactly once.
      press('a')
      expect(onCommit).toHaveBeenCalledTimes(1)
      expect(onCommit).toHaveBeenCalledWith('a')
      expect(result.current.armedId).toBeNull()
    })

    it('Race 2a — a commit just under the 5 s revert commits once and clears the revert (no stale double-action)', () => {
      const { result, press, advance, onCommit } = setup()

      press('a') // t=0
      advance(DELETE_AUTO_REVERT_MS - 1) // t=4999, past 300 ms, just under revert
      press('a') // commits

      expect(onCommit).toHaveBeenCalledTimes(1)
      expect(result.current.armedId).toBeNull()

      // Advancing past the original 5 s must NOT fire a stale revert (the commit
      // cleared the timer) — no double action, armedId stays null.
      advance(DELETE_AUTO_REVERT_MS)
      expect(onCommit).toHaveBeenCalledTimes(1)
      expect(result.current.armedId).toBeNull()
    })

    it('Race 2b — if the 5 s revert wins, the row reverts and a later press RE-ARMS (does not commit)', () => {
      const { result, press, advance, onCommit } = setup()

      press('a') // t=0
      advance(DELETE_AUTO_REVERT_MS) // t=5000 — revert fires first
      expect(result.current.armedId).toBeNull()
      expect(onCommit).not.toHaveBeenCalled()

      // A subsequent press re-arms from idle rather than committing — the boundary
      // is unambiguous.
      press('a')
      expect(result.current.armedId).toBe('a')
      expect(onCommit).not.toHaveBeenCalled()
    })

    it('Race 3 — a refresh/navigation mid-window (unmount while armed) commits nothing and fires no stray revert', () => {
      const { result, press, advance, unmount, onCommit } = setup()

      press('a') // arm, before the 5 s revert
      expect(result.current.armedId).toBe('a')

      // Unmount is the deterministic proxy for the tab refreshing/navigating away
      // while a row is armed. The cleanup effect clears the outstanding revert timer.
      unmount()

      // Advancing past the original revert floor fires no stray callback: no commit,
      // and (crucially) no leaked timer resurrecting a revert on an unmounted hook.
      advance(DELETE_AUTO_REVERT_MS)
      expect(onCommit).not.toHaveBeenCalled()
    })
  })
})
