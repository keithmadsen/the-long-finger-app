import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { LiveRegion } from './components/primitives'
import type { LiveRegionHandle } from './components/primitives'
import { CaptureInput } from './components/recipes/CaptureInput'
import { EmptyState } from './components/recipes/EmptyState'
import { TodoList } from './components/recipes/TodoList'
import { UnreadErrorIndicator } from './components/recipes/UnreadErrorIndicator'
import { useCreateTodo } from './hooks/useCreateTodo'
import { useDeleteTodo } from './hooks/useDeleteTodo'
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
 * state.
 *
 * Story 1.10 adds the unread-error indicator here: a focusable "N error(s)
 * above" affordance rendered to the RIGHT of the capture input (input stays
 * first in DOM order — first-interactive invariant), the App-owned
 * unread/acknowledged + focus-visibility state, and the activate handler that
 * scrolls + focuses the first failed row's Retry.
 *
 * Story 2.2 wires delete: App owns the delete mutation (useDeleteTodo — like
 * create/toggle, so its in-flight `deletingIds` reach the list and drive each
 * row's Committing/aria-busy presentation). <TodoList> owns the armed-state
 * (arm-then-confirm) coordination via useArmedDelete; App only supplies onDelete
 * + deletingIds. Story 2.3 wires the deletion announcements: App passes
 * `announce` to useDeleteTodo exactly like create/toggle (aria-pressed lives on
 * the row's delete affordance, not here).
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

  // Unread-error indicator state (Story 1.10). `acknowledgedIds` are the failed
  // ids the user has acknowledged by FOCUSING the indicator — acknowledging
  // clears the unread *notification* without dismissing the errors (the failed
  // rows stay visible and actionable, AC 3). `indicatorFocused` keeps the
  // indicator mounted while focused so Enter/click still fires the instant after
  // focus marked everything read. Both are client-only presentation state — never
  // a field on the Todo contract (1.7/1.8 precedent).
  const [acknowledgedIds, setAcknowledgedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [indicatorFocused, setIndicatorFocused] = useState(false)
  // Queried for the first failed row's Retry (via [data-failed-retry]) when the
  // indicator is activated — failed rows are pinned at the top, so document order
  // makes the first match the first failed row (AC 2).
  const surfaceRef = useRef<HTMLDivElement>(null)

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

  // The delete mutation is owned HERE too (Story 2.2). `deletingIds` (the
  // Committing marker from 2.1's honest-pending onMutate) reaches the list so
  // each row can render aria-busy + the committing fade. The armed-state timing
  // lives in <TodoList>'s useArmedDelete, not here. Story 2.3 passes the single
  // App-owned `announce` so delete emits its success/failure announcements
  // exactly like create/toggle (one LiveRegion only, UX-DR6/7).
  const { deleteTodo, deletingIds } = useDeleteTodo({ announce })

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
  const visibleFailedCreates = useMemo(
    () => failedCreates.filter((todo) => !serverIds.has(todo.id)),
    [failedCreates, serverIds],
  )

  useEffect(() => {
    const reconciledFailedIds = failedCreates
      .filter((todo) => serverIds.has(todo.id))
      .map((todo) => todo.id)
    if (reconciledFailedIds.length > 0) {
      clearFailedCreates(reconciledFailedIds)
    }
  }, [clearFailedCreates, failedCreates, serverIds])

  // Prune acknowledged ids that are no longer failing (resolved or dismissed) so
  // the set cannot grow unbounded AND a resolved-then-new failure with a fresh id
  // is correctly unread again (AC 3). Guarded so it only set-states when the
  // intersection actually differs — avoids render loops (mirrors the reconcile
  // effect above).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reconciling client-only unread state against async query-derived failures, not synchronously derivable; guarded to set-state only when the intersection differs.
    setAcknowledgedIds((prev) => {
      if (prev.size === 0) return prev
      const failedIdSet = new Set(visibleFailedCreates.map((todo) => todo.id))
      const stale = [...prev].some((id) => !failedIdSet.has(id))
      if (!stale) return prev
      return new Set([...prev].filter((id) => failedIdSet.has(id)))
    })
  }, [visibleFailedCreates])

  // The displayed N is the TOTAL failures above (never 0 while shown, climbs as
  // failures accumulate). `unreadCount` (failures the user has not acknowledged)
  // drives visibility together with `indicatorFocused`.
  const failedCount = visibleFailedCreates.length
  const unreadCount = visibleFailedCreates.filter(
    (todo) => !acknowledgedIds.has(todo.id),
  ).length
  const showIndicator =
    !isError && failedCount > 0 && (unreadCount > 0 || indicatorFocused)

  // Focusing the indicator acknowledges the current failures (unread → 0) without
  // dismissing them, and keeps it mounted while focused (AC 3).
  function handleIndicatorFocus() {
    setIndicatorFocused(true)
    setAcknowledgedIds((prev) => {
      const next = new Set(prev)
      for (const todo of visibleFailedCreates) next.add(todo.id)
      return next
    })
  }

  function handleIndicatorBlur() {
    setIndicatorFocused(false)
  }

  // Scroll the first failed row's Retry into view and focus it (AC 2). Null-safe:
  // if the last failure resolved between render and activation, do nothing.
  function activateFirstFailed() {
    const retry = surfaceRef.current?.querySelector<HTMLElement>(
      '[data-failed-retry]',
    )
    retry?.scrollIntoView({ block: 'nearest' })
    retry?.focus()
  }

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

            {/*
             * Capture is sacred: the FIRST interactive element (AC 1). The
             * indicator is its right-hand sibling in a flex row, so the input
             * stays first in DOM order (first-interactive invariant) and the
             * indicator is the SECOND tab stop (Story 1.10 AC 1, 2). The
             * indicator is rendered, never auto-focused, so it does not steal
             * focus during burst capture.
             */}
            <div className={styles['capture-row']}>
              <CaptureInput onSubmit={submit} />
              {showIndicator && (
                <UnreadErrorIndicator
                  count={failedCount}
                  onActivate={activateFirstFailed}
                  onBlur={handleIndicatorBlur}
                  onFocus={handleIndicatorFocus}
                />
              )}
            </div>
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

        {/*
         * The surface is wrapped so the indicator's activate handler can query
         * the first failed row's Retry ([data-failed-retry]) without threading a
         * ref through TodoList → TodoItem (Story 1.10 AC 2).
         */}
        <div ref={surfaceRef}>{renderSurface()}</div>
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
        deletingIds={deletingIds}
        describedById={FAILED_CREATE_HELP_ID}
        failedIds={failedIds}
        onDelete={deleteTodo}
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
