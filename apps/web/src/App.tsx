import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

// Stable id every failed row references via aria-describedby (Story 1.9 AC 5).
const FAILED_CREATE_HELP_ID = 'failed-create-help'
// The hidden help text a failed row points at — reassures the user their typed
// text is held until they act (AC 5). Kept as a constant so the test can assert it.
const FAILED_CREATE_HELP_TEXT =
  'Your typed text is saved here until you retry, dismiss, or refresh.'

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
 * Story 1.9 adds failed-create recovery here: the merged render list
 * ([...failedCreates, ...data]), the shared hidden aria-describedby help text,
 * and the beforeunload guard that is active while any create is in the Failed
 * state. Explicitly NOT here (later stories): the unread-error indicator (1.10),
 * delete (Epic 2). Do not stub them.
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

  const {
    submit,
    pendingIds,
    failedCreates,
    retry,
    dismiss,
    clearFailedCreates,
  } = useCreateTodo({
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

  // While any create is in the Failed state, guard an accidental tab close/refresh
  // (AC 5) — the typed text is held in client state only (no persistence; UX line
  // 734). Attach on the first failed row, detach when the last one clears (AC 7).
  // Only attach/detach is assertable; the native dialog itself is not scriptable.
  useEffect(() => {
    if (failedCreates.length === 0) return
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      // Legacy assignment required alongside preventDefault for cross-browser prompting.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [failedCreates.length])

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

  const serverIds = useMemo(
    () => new Set(data?.map((todo) => todo.id) ?? []),
    [data],
  )
  const visibleFailedCreates = failedCreates.filter(
    (todo) => !serverIds.has(todo.id),
  )

  useEffect(() => {
    const reconciledFailedIds = failedCreates
      .filter((todo) => serverIds.has(todo.id))
      .map((todo) => todo.id)
    if (reconciledFailedIds.length > 0) {
      clearFailedCreates(reconciledFailedIds)
    }
  }, [clearFailedCreates, failedCreates, serverIds])

  // Failed creates are pinned ABOVE the server list (where new creates prepend).
  // They live in the hook's client state, NOT the ['todos'] cache, so a sibling
  // success's invalidation refetch can never wipe them (AC 8). If a later refetch
  // proves the server already committed that id, hide and clear the failed copy so
  // one task never renders twice.
  const failedIds = new Set(visibleFailedCreates.map((todo) => todo.id))
  const rows = [...visibleFailedCreates, ...(data ?? [])]

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

        {/*
         * Shared hidden help text every failed row references via
         * aria-describedby (AC 5). Rendered ONLY while a failed row exists, using
         * the accessible-clip idiom (NOT display:none/aria-hidden, which would
         * hide it from aria-describedby).
         */}
        {visibleFailedCreates.length > 0 && (
          <p className={styles['visually-hidden']} id={FAILED_CREATE_HELP_ID}>
            {FAILED_CREATE_HELP_TEXT}
          </p>
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
    // Decide on the MERGED list so a lone failed create (empty server list) still
    // renders a row instead of the empty-state (AC 1 / gotcha 5).
    if (rows.length === 0) {
      return <EmptyState variant="empty" />
    }
    return (
      <TodoList
        describedById={FAILED_CREATE_HELP_ID}
        failedIds={failedIds}
        onDismiss={dismiss}
        onRetry={retry}
        onToggle={toggle}
        pendingIds={pendingIds}
        todos={rows}
        togglingCompletedById={togglingCompletedById}
      />
    )
  }
}

export default App
