import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  FLICKER_THRESHOLD_MS,
  PENDING_MIN_HOLD_MS,
  usePendingPresentation,
  type PendingClock,
} from './usePendingPresentation'

/*
 * A deterministic, injectable clock (the production seam, not vi.useFakeTimers).
 * advance() moves virtual time and fires any due timers in chronological order.
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

function setup(initialPending: boolean) {
  const fake = makeFakeClock()
  const view = renderHook(
    ({ pending }) => usePendingPresentation(pending, fake.clock),
    { initialProps: { pending: initialPending } },
  )
  return { ...view, advance: (ms: number) => act(() => fake.advance(ms)) }
}

describe('usePendingPresentation', () => {
  it('sets ariaBusy from t=0 but does NOT paint showPending before the flicker threshold (AC 6)', () => {
    const { result } = setup(true)

    // t=0: busy immediately, no visual yet.
    expect(result.current.ariaBusy).toBe(true)
    expect(result.current.showPending).toBe(false)
  })

  it('confirm BEFORE the threshold never paints a pending visual (anti-flicker, AC 4)', () => {
    const { result, rerender, advance } = setup(true)

    advance(FLICKER_THRESHOLD_MS - 1) // 149ms — just shy of the threshold
    expect(result.current.showPending).toBe(false)

    // Confirm arrives before the threshold fires.
    act(() => rerender({ pending: false }))

    // The threshold timer is cancelled — the visual is never painted.
    advance(FLICKER_THRESHOLD_MS) // let any stray timer fire
    expect(result.current.showPending).toBe(false)
    // No longer in-flight → not busy.
    expect(result.current.ariaBusy).toBe(false)
  })

  it('confirm AFTER the threshold paints the pending visual; ariaBusy true throughout (AC 4, 6)', () => {
    const { result, advance } = setup(true)

    expect(result.current.ariaBusy).toBe(true)
    advance(FLICKER_THRESHOLD_MS) // threshold fires
    expect(result.current.showPending).toBe(true)
    expect(result.current.ariaBusy).toBe(true)
  })

  it('holds showPending for the minimum-hold floor even if confirm arrives early (AC 5)', () => {
    const { result, rerender, advance } = setup(true)

    advance(FLICKER_THRESHOLD_MS) // becomes visible at t=150
    expect(result.current.showPending).toBe(true)

    // Confirm immediately after becoming visible (elapsed ≈ 0).
    act(() => rerender({ pending: false }))
    expect(result.current.showPending).toBe(true) // held, not flashed-away
    expect(result.current.ariaBusy).toBe(false) // but no longer busy

    advance(PENDING_MIN_HOLD_MS - 1) // just before the floor
    expect(result.current.showPending).toBe(true)

    advance(1) // cross the floor
    expect(result.current.showPending).toBe(false)
  })

  it('hides immediately if confirm arrives after the min-hold floor already elapsed', () => {
    const { result, rerender, advance } = setup(true)

    advance(FLICKER_THRESHOLD_MS) // visible at t=150
    advance(PENDING_MIN_HOLD_MS) // floor already elapsed while still pending
    expect(result.current.showPending).toBe(true)

    act(() => rerender({ pending: false }))
    expect(result.current.showPending).toBe(false) // no extra hold needed
  })

  it('is per-instance: two hooks do not share threshold/hold state (AC 7)', () => {
    const a = setup(true)
    const b = setup(true)

    // Cross the threshold only for instance A.
    a.advance(FLICKER_THRESHOLD_MS)
    expect(a.result.current.showPending).toBe(true)
    expect(b.result.current.showPending).toBe(false)
  })
})
