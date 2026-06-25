import { useCallback, useEffect, useRef, useState } from 'react'

import { LiveRegion } from './components/primitives'
import type { LiveRegionHandle } from './components/primitives'
import { CaptureInput } from './components/recipes/CaptureInput'
import { EmptyState } from './components/recipes/EmptyState'
import { TodoList } from './components/recipes/TodoList'
import { useCreateTodo } from './hooks/useCreateTodo'
import { useToggleTodo } from './hooks/useToggleTodo'
import { useTodos } from './hooks/useTodos'
import styles from './App.module.css'

// The polite announcement copy for a failed initial load (AC 6, UX-DR19). Kept
// as a constant so the test can assert the exact text and the EmptyState copy
// stays the single visible source — they intentionally read the same.
const LOAD_FAILURE_MESSAGE = 'Couldn’t load your list. Refresh to try again.'

// Shown above the input ONLY before the user's first task (Story 1.7 AC 1).
const INSTRUCTION_LINE = 'Type a task and press Enter to add it to your list.'

/*
 * The single screen. Owns the app-level concerns (architecture component
 * boundary):
 *   1. Layout — --color-surface to the viewport edges, content in a 640px column.
 *   2. The single page-wide <LiveRegion> (UX-DR6/7) — load failure (AC 6) AND the
 *      create-confirmation "{description} added." (Story 1.7 AC 9).
 *   3. The reactive <title> (AC 7).
 *   4. The CAPTURE INPUT as the first interactive element (Story 1.7 AC 1), the
 *      create mutation (useCreateTodo — owned here so its pending state reaches
 *      the list), and the instruction-line lifecycle.
 * Then it branches the query state into the four layout-stable surfaces (FR-8).
 *
 * Explicitly NOT here (later stories): Failed-create recovery / beforeunload
 * (1.9), the unread-error indicator (1.10), delete (Epic 2). Do not stub them.
 */
function App() {
  const { data, isPending, isError, refetch } = useTodos()
  const liveRegionRef = useRef<LiveRegionHandle>(null)
  // Guards the announce-once rule: announce when the query enters isError, and
  // never re-announce the same error. Reset on recovery so a *later* failure
  // announces again (UX-DR19).
  const errorAnnouncedRef = useRef(false)

  // Stable announcer over the single LiveRegion — passed to the create mutation
  // for the confirmation announcement (AC 9) and used for the load failure.
  const announce = useCallback((message: string) => {
    liveRegionRef.current?.announce(message)
  }, [])

  // "Has this session ever observed/created a task?" Drives the instruction-line
  // lifecycle (AC 1, 14): the line shows ONLY for a never-seen-empty list and
  // never reappears once any todo has existed, including seeded lists loaded from
  // the server.
  const [hasEverHadTodos, setHasEverHadTodos] = useState(false)

  const { submit, pendingIds } = useCreateTodo({
    announce,
    onCreated: () => setHasEverHadTodos(true),
  })

  // The toggle mutation is owned HERE (like create) so its in-flight ids reach
  // the list and drive each row's honest-pending presentation (1.7 precedent).
  const { toggle, togglingCompletedById } = useToggleTodo({ announce })

  // Reactive <title> (AC 7): "the long finger (N active)", count omitted at zero.
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

  const currentTodosCount = data?.length ?? 0
  const shouldShowInstruction = !hasEverHadTodos && currentTodosCount === 0

  useEffect(() => {
    if (currentTodosCount > 0) {
      // Latch seeded/non-empty server lists so the first-task instruction cannot
      // reappear after a later refetch returns empty.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- this is a session latch derived from async query data, not synchronously derivable initial state.
      setHasEverHadTodos(true)
    }
  }, [currentTodosCount])

  const instructionWrapClass = [
    styles['instruction-wrap'],
    shouldShowInstruction ? null : styles['instruction-hidden'],
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <main className={styles.app}>
      <LiveRegion ref={liveRegionRef} />
      <div className={styles.column}>
        {/*
         * The capture input + instruction line are present in every NON-loading
         * state (the loading surface has no interactive element, so the
         * first-interactive invariant still holds). They sit ABOVE the surface so
         * the input is the first interactive element in DOM order (AC 1).
         */}
        {!isPending && (
          <>
            {/*
             * Instruction line ABOVE the input (AC 1). Always mounted but
             * collapses (grid-rows 1fr→0fr + opacity) via --motion-settle once a
             * task exists, so it fades rather than vanishing and never reappears
             * (AC 14). Reduced motion collapses the token to 0 → instant, no
             * layout jump. aria-hidden once retired so it leaves the a11y tree.
             */}
            <div
              aria-hidden={!shouldShowInstruction || undefined}
              className={instructionWrapClass}
            >
              <p className={styles.instruction}>{INSTRUCTION_LINE}</p>
            </div>

            {/* Capture is sacred: the FIRST interactive element (AC 1). */}
            <CaptureInput onSubmit={submit} />
          </>
        )}

        {renderSurface()}
      </div>
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
    return (
      <TodoList
        onToggle={toggle}
        pendingIds={pendingIds}
        todos={data}
        togglingCompletedById={togglingCompletedById}
      />
    )
  }
}

export default App
