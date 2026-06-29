import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateTodoBody, Todo } from '@tlf/contracts'
import { v7 as uuidv7 } from 'uuid'

import { createTodo } from '../api/todos'
import { realClock, type PendingClock } from './usePendingPresentation'

/*
 * useCreateTodo — the create mutation, the canonical home of the MANDATORY
 * honest-pending mutation shape (architecture #Process-Patterns), AND (Story 1.9)
 * the full failed-create recovery lifecycle: a failed create no longer silently
 * disappears — it survives as a Failed row the user can Retry or Dismiss.
 *
 *   onMutate  → cancelQueries(['todos']) → snapshot previous → write a PENDING
 *               Todo into the cache immutably, carrying its client UUIDv7 id;
 *               track the id as pending; create a per-id AbortController and a
 *               wall-clock deadline for the ~10s timeout.
 *   onError   → an AbortError means a Dismiss aborted this in flight (already
 *               cleaned up) → return. Otherwise markFailed(id): move the row out
 *               of the cache into `failedCreates` and announce ONCE. NEVER
 *               invalidate on failure (it would wipe sibling failed rows — AC 8).
 *   onSuccess → announce "{description} added."; clear any failed/announce/
 *               deadline state for the id (covers timeout→Failed→late-success).
 *   onSettled → drop pending id + controller + deadline; invalidate ONLY on
 *               success (settle = refetch, as 1.7).
 *
 * The one critical design decision: FAILED ROWS LIVE IN `useState`, NOT THE
 * CACHE. A sibling success's onSettled invalidation refetches the server list
 * (which never contains a failed-only optimistic row); a failed row left in the
 * cache would be WIPED by that refetch (AC 8). Keeping it in `failedCreates`
 * makes it immune to invalidation. App merges `[...failedCreates, ...data]` for
 * render (failed rows pinned at the top).
 *
 * Every map/set/collection is keyed by the client UUIDv7 `id`, stable across the
 * whole lifecycle — which is why the same id is reused on Retry and why the
 * server's idempotent-on-id 200 path (Story 1.7) makes Retry safe.
 */

/** Wall-clock budget before a still-pending create surfaces as Failed (UX §2.5). */
export const CREATE_TIMEOUT_MS = 10_000

export interface UseCreateTodoOptions {
  /** Confirmation/failure announcer — the single App-owned LiveRegion's announce. */
  announce?: (message: string) => void
  /**
   * Fired once on a successful create. App uses it to latch the "has ever created
   * a task" flag that retires the instruction line (Story 1.7 AC 14).
   */
  onCreated?: () => void
  /**
   * Injectable clock for the ~10s timeout (AC 6). Defaults to the real clock; the
   * SAME PendingClock seam the honest-pending presentation uses — tests advance
   * `now` and fire timers/visibilitychange to simulate a backgrounded-tab/laptop-
   * sleep time jump without real wall-clock waits. Never a second clock interface.
   */
  clock?: PendingClock
}

interface MutationContext {
  previous: Todo[] | undefined
}

interface CreateTodoMutationBody extends CreateTodoBody {
  attemptId: number
}

interface AttemptController {
  attemptId: number
  controller: AbortController
}

interface AttemptDeadline {
  attemptId: number
  deadlineMs: number
}

export function useCreateTodo({
  announce,
  onCreated,
  clock = realClock,
}: UseCreateTodoOptions = {}) {
  const queryClient = useQueryClient()
  // The set of in-flight (pending) ids. Client-only presentation state — never a
  // field on the Todo contract. <TodoItem> reads membership to render Pending.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  // Failed creates live HERE, not in the ['todos'] cache, so a sibling success's
  // invalidation refetch can never wipe them (AC 8). Each entry is the snapshotted
  // pending Todo — it keeps its description + timestamps so the row renders intact.
  const [failedCreates, setFailedCreates] = useState<readonly Todo[]>([])

  // Per-id AbortController (Dismiss aborts the in-flight POST). Created on submit/
  // retry, dropped on settle/dismiss.
  const controllersRef = useRef<Map<string, AttemptController>>(new Map())
  // Ids already announced as failed — the announce-once guard (AC 4). Survives a
  // retry that fails again; cleared only on dismiss or a successful settle.
  const announcedRef = useRef<Set<string>>(new Set())
  // id → active attempt. Retry reuses the same todo id while an older timed-out
  // request can still be in flight, so every network attempt also gets its own
  // monotonically increasing attempt id.
  const activeAttemptRef = useRef<Map<string, number>>(new Map())
  const nextAttemptIdRef = useRef(0)
  // id → the last submitted row snapshot. This survives cache refetches, so a
  // later failure can still render the Failed row with the user's text intact.
  const submittedRowsRef = useRef<Map<string, Todo>>(new Map())
  // id → wall-clock deadline for the active attempt. Set on submit/retry, deleted
  // on settle/markFailed/dismiss.
  const deadlineRef = useRef<Map<string, AttemptDeadline>>(new Map())
  // Terminal guards for late settlements after a Dismiss or after any attempt for
  // this id has already succeeded.
  const dismissedRef = useRef<Set<string>>(new Set())
  const completedRef = useRef<Set<string>>(new Set())

  function addPending(id: string) {
    setPendingIds((prev) => new Set(prev).add(id))
  }

  function removePending(id: string) {
    setPendingIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function nextAttemptId() {
    nextAttemptIdRef.current += 1
    return nextAttemptIdRef.current
  }

  function isActiveAttempt(body: CreateTodoMutationBody) {
    return activeAttemptRef.current.get(body.id) === body.attemptId
  }

  function cleanupAttempt(body: CreateTodoMutationBody) {
    const controller = controllersRef.current.get(body.id)
    if (controller?.attemptId === body.attemptId) {
      controllersRef.current.delete(body.id)
    }
    const deadline = deadlineRef.current.get(body.id)
    if (deadline?.attemptId === body.attemptId) {
      deadlineRef.current.delete(body.id)
    }
    if (activeAttemptRef.current.get(body.id) === body.attemptId) {
      activeAttemptRef.current.delete(body.id)
    }
  }

  // Move a pending row to the Failed state — used by BOTH the mutation onError
  // path and the timeout path, so it MUST be idempotent. Prefer the current cache
  // row, but fall back to the submitted snapshot if a sibling success/refetch has
  // already replaced the cache. On timeout we keep the controller so Dismiss can
  // still abort the original in-flight request; on network error the request has
  // settled, so its controller can be dropped.
  function markFailed(
    id: string,
    attemptId: number,
    { keepController }: { keepController: boolean },
  ) {
    if (activeAttemptRef.current.get(id) !== attemptId) return
    const cached = queryClient.getQueryData<Todo[]>(['todos'])
    const cachedRow = cached?.find((todo) => todo.id === id)
    const failedRow = cachedRow ?? submittedRowsRef.current.get(id)
    if (!failedRow) return

    setFailedCreates((prev) =>
      prev.some((todo) => todo.id === id) ? prev : [...prev, failedRow],
    )
    queryClient.setQueryData<Todo[]>(['todos'], (old) =>
      (old ?? []).filter((todo) => todo.id !== id),
    )
    removePending(id)
    activeAttemptRef.current.delete(id)
    const deadline = deadlineRef.current.get(id)
    if (deadline?.attemptId === attemptId) {
      deadlineRef.current.delete(id)
    }
    if (!keepController) {
      const controller = controllersRef.current.get(id)
      if (controller?.attemptId === attemptId) {
        controllersRef.current.delete(id)
      }
    }

    if (!announcedRef.current.has(id)) {
      // Curly apostrophe/quotes to match the existing failure copy.
      announce?.(
        `Couldn’t save ‘${failedRow.description}’. Use Retry to try again.`,
      )
      announcedRef.current.add(id)
    }
  }

  // Fail any pending id whose wall-clock deadline has passed. Snapshot the entries
  // first since markFailed mutates the deadline map during iteration.
  function checkDeadlines() {
    const now = clock.now()
    for (const [id, deadline] of [...deadlineRef.current]) {
      if (now >= deadline.deadlineMs) {
        markFailed(id, deadline.attemptId, { keepController: true })
      }
    }
  }

  function completeCreate(body: CreateTodoMutationBody) {
    if (
      dismissedRef.current.has(body.id) ||
      completedRef.current.has(body.id)
    ) {
      return
    }
    completedRef.current.add(body.id)
    announce?.(`${body.description} added.`)
    onCreated?.()
    setFailedCreates((prev) => prev.filter((todo) => todo.id !== body.id))
    removePending(body.id)
    announcedRef.current.delete(body.id)
    submittedRowsRef.current.delete(body.id)
    activeAttemptRef.current.delete(body.id)
    controllersRef.current.delete(body.id)
    deadlineRef.current.delete(body.id)
    void queryClient.invalidateQueries({ queryKey: ['todos'] })
  }

  const mutation = useMutation<
    Todo,
    Error,
    CreateTodoMutationBody,
    MutationContext
  >({
    mutationFn: (body) =>
      createTodo(
        body,
        controllersRef.current.get(body.id)?.attemptId === body.attemptId
          ? controllersRef.current.get(body.id)?.controller.signal
          : undefined,
      ),

    onMutate: async (body) => {
      // Stop any in-flight list refetch from overwriting our optimistic write.
      await queryClient.cancelQueries({ queryKey: ['todos'] })
      const previous = queryClient.getQueryData<Todo[]>(['todos'])

      // A client-synthesized timestamp so the pending row sorts to the TOP of the
      // actives. The REAL server timestamps arrive on the invalidation refetch.
      const now = new Date().toISOString()
      const pendingTodo: Todo = {
        id: body.id,
        description: body.description,
        completed: false,
        createdAt: now,
        updatedAt: now,
      }
      dismissedRef.current.delete(body.id)
      completedRef.current.delete(body.id)
      submittedRowsRef.current.set(body.id, pendingTodo)
      activeAttemptRef.current.set(body.id, body.attemptId)

      // Immutable write, new array reference. Prepend = top of the list.
      queryClient.setQueryData<Todo[]>(['todos'], (old) => {
        const withoutDuplicate = (old ?? []).filter(
          (todo) => todo.id !== body.id,
        )
        return [pendingTodo, ...withoutDuplicate]
      })
      addPending(body.id)

      // Fresh per-id controller + wall-clock deadline for THIS attempt (covers a
      // retry, which re-enters onMutate with the same id after settle cleared the
      // previous controller/deadline).
      controllersRef.current.set(body.id, {
        attemptId: body.attemptId,
        controller: new AbortController(),
      })
      deadlineRef.current.set(body.id, {
        attemptId: body.attemptId,
        deadlineMs: clock.now() + CREATE_TIMEOUT_MS,
      })

      return { previous }
    },

    onError: (error, body) => {
      // A Dismiss aborted this in flight — Dismiss already cleaned everything up.
      // Do NOT mark failed and do NOT announce (the native AbortError propagates
      // un-wrapped from createTodo so we can detect it here).
      if (error.name === 'AbortError') return
      if (
        dismissedRef.current.has(body.id) ||
        completedRef.current.has(body.id) ||
        !isActiveAttempt(body)
      ) {
        return
      }
      markFailed(body.id, body.attemptId, { keepController: false })
      // Deliberately NO invalidate on failure: nothing server-side to reconcile,
      // and invalidation would refetch and wipe sibling failed rows (AC 8).
    },

    onSuccess: (_created, body) => {
      // Any successful attempt for this id means the server has the task. This also
      // covers timeout→Failed→Retry where the original request succeeds late: retire
      // the recovery UI and ignore later settlements for redundant attempts.
      completeCreate(body)
    },

    onSettled: (_data, _error, body) => {
      if (isActiveAttempt(body)) {
        removePending(body.id)
      }
      cleanupAttempt(body)
    },
  })

  // Generate a fresh UUIDv7 per submit so even an accidental resubmit of the same
  // text is a DISTINCT todo (never a duplicate-id collision).
  function submit(description: string) {
    mutation.mutate({ id: uuidv7(), description, attemptId: nextAttemptId() })
  }

  // Re-attempt a failed create with the SAME id (server is idempotent on id →
  // 201 new / 200 existing). Returns the row to pending; onMutate re-prepends the
  // optimistic row + arms a fresh controller/deadline. Retry deliberately does
  // NOT abort the original request (UX line 1094) and does NOT clear the announce-
  // once guard, so a retry that fails again does NOT re-announce (AC 4).
  function retry(id: string) {
    const failed = failedCreates.find((todo) => todo.id === id)
    if (!failed) return
    setFailedCreates((prev) => prev.filter((todo) => todo.id !== id))
    dismissedRef.current.delete(id)
    mutation.mutate({
      id,
      description: failed.description,
      attemptId: nextAttemptId(),
    })
  }

  // Remove a failed row and abort any in-flight request for it (best-effort: if
  // the POST already completed server-side, the task reappears on the next
  // refetch — server-of-truth reconciliation, AC 3).
  function dismiss(id: string) {
    dismissedRef.current.add(id)
    const controller = controllersRef.current.get(id)
    if (controller) {
      controller.controller.abort()
      controllersRef.current.delete(id)
    }
    setFailedCreates((prev) => prev.filter((todo) => todo.id !== id))
    removePending(id)
    announcedRef.current.delete(id)
    deadlineRef.current.delete(id)
    activeAttemptRef.current.delete(id)
    submittedRowsRef.current.delete(id)
    completedRef.current.delete(id)
    // Ensure it is absent from the cache (covers a timeout-then-dismiss where the
    // row might otherwise still be present).
    queryClient.setQueryData<Todo[]>(['todos'], (old) =>
      (old ?? []).filter((todo) => todo.id !== id),
    )
  }

  // Fast path: arm a single timer for the SOONEST outstanding deadline. Re-runs
  // whenever pendingIds changes (every deadline set/delete coincides with a
  // pending add/remove), so the timer always tracks the nearest deadline.
  useEffect(() => {
    const deadlines = [...deadlineRef.current.values()].map(
      (deadline) => deadline.deadlineMs,
    )
    if (deadlines.length === 0) return
    const soonest = Math.min(...deadlines)
    const delay = Math.max(0, soonest - clock.now())
    const handle = clock.setTimeout(() => {
      checkDeadlines()
    }, delay)
    return () => clock.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deadlineRef/clock are stable refs; pendingIds is the intended re-arm trigger and checkDeadlines only touches stable refs/setters.
  }, [pendingIds, clock])

  // The REAL guarantee across a backgrounded tab / laptop sleep (a setTimeout
  // alone is throttled/suspended): on foreground, immediately fail any id whose
  // wall-clock deadline already passed (AC 6).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        checkDeadlines()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkDeadlines only touches stable refs/setters; re-subscribing each render is unnecessary.
  }, [clock])

  function clearFailedCreates(ids: readonly string[]) {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    setFailedCreates((prev) => prev.filter((todo) => !idSet.has(todo.id)))
    for (const id of idSet) {
      announcedRef.current.delete(id)
      submittedRowsRef.current.delete(id)
      dismissedRef.current.delete(id)
      completedRef.current.add(id)
    }
  }

  return {
    submit,
    pendingIds,
    failedCreates,
    retry,
    dismiss,
    clearFailedCreates,
  }
}
