import { useEffect, useRef } from 'react'

import { LiveRegion } from './components/primitives'
import type { LiveRegionHandle } from './components/primitives'
import { EmptyState } from './components/recipes/EmptyState'
import { TodoList } from './components/recipes/TodoList'
import { useTodos } from './hooks/useTodos'
import styles from './App.module.css'

// The polite announcement copy for a failed initial load (AC 6, UX-DR19). Kept
// as a constant so the test can assert the exact text and the EmptyState copy
// stays the single visible source — they intentionally read the same.
const LOAD_FAILURE_MESSAGE = 'Couldn’t load your list. Refresh to try again.'

/*
 * The single screen. Owns three app-level concerns and nothing data-shaped
 * beyond them (architecture component boundary):
 *   1. Layout — --color-surface to the viewport edges, content centered in a
 *      640px column (UX-DR7/UX-DR23). No header/wordmark chrome (UX-DR20).
 *   2. The single page-wide <LiveRegion> (UX-DR6/UX-DR7) — the ONLY one in the
 *      app — announcing the load failure exactly once (AC 6).
 *   3. The reactive <title> (AC 7, UX-DR20).
 * Then it branches the query state into the four layout-stable surfaces (FR-8).
 *
 * Explicitly NOT here (later stories): the capture input / instruction line
 * (1.7), toggle/mutation wiring (1.8), beforeunload (1.9), the unread-error
 * indicator (1.10), delete (Epic 2). Do not stub them.
 */
function App() {
  const { data, isPending, isError, refetch } = useTodos()
  const liveRegionRef = useRef<LiveRegionHandle>(null)
  // Guards the announce-once rule: announce when the query enters isError, and
  // never re-announce the same error. Reset on recovery so a *later* failure
  // (e.g. a focus-refetch after a successful load) announces again (UX-DR19).
  const errorAnnouncedRef = useRef(false)

  // Reactive <title> (AC 7): "the long finger (N active)", count omitted at
  // zero. N counts todos where completed === false. Cheap effect, re-runs only
  // when the (structurally shared) todo list reference changes.
  useEffect(() => {
    const activeCount = data?.filter((todo) => !todo.completed).length ?? 0
    document.title =
      activeCount > 0
        ? `the long finger (${activeCount} active)`
        : 'the long finger'
  }, [data])

  // Announce the load failure once via the polite LiveRegion (AC 6).
  useEffect(() => {
    if (isError) {
      if (!errorAnnouncedRef.current) {
        liveRegionRef.current?.announce(LOAD_FAILURE_MESSAGE)
        errorAnnouncedRef.current = true
      }
    } else {
      errorAnnouncedRef.current = false
    }
  }, [isError])

  return (
    <main className={styles.app}>
      <LiveRegion ref={liveRegionRef} />
      <div className={styles.column}>{renderSurface()}</div>
    </main>
  )

  function renderSurface() {
    if (isPending) {
      return <EmptyState variant="loading" />
    }
    if (isError) {
      return <EmptyState variant="failed" onRetry={() => void refetch()} />
    }
    if (!data || data.length === 0) {
      return <EmptyState variant="empty" />
    }
    return <TodoList todos={data} />
  }
}

export default App
