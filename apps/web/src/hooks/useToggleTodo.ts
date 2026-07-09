import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Todo } from '@tlf/contracts'

import { patchTodo } from '../api/todos'

/*
 * useToggleTodo — completion toggle via PATCH /todos/:id, built on the MANDATORY
 * honest-pending shape that useCreateTodo DEFINES (cancel → snapshot → optimistic
 * cache write → track id; per-id rollback on error; announce on success; cleanup
 * on settle). It reuses that flow with ONE deliberate, documented divergence:
 *
 *   THE in-place vs. canonical-order divergence (UX-DR15 × UX-DR17).
 *   useCreateTodo ends with `onSettled → invalidateQueries(['todos'])` (settle =
 *   refetch). For a TOGGLE that is wrong ON SUCCESS: a refetch returns the
 *   backend canonical order (completed ASC, updated_at DESC), which would sink a
 *   just-completed item below the actives — moving it mid-session and violating
 *   AC 4 ("the item does NOT move position; canonical re-sort only on the NEXT
 *   page load"). So:
 *     • SUCCESS → write the server-confirmed Todo into its EXISTING array
 *       position (replace by id) and do NOT invalidate. The item stays put; the
 *       real updated_at is captured for the next fresh GET to re-sort.
 *     • FAILURE → revert THIS row in place AND invalidate(['todos']) — the AC 5
 *       "reconcile to the last backend-confirmed state (refetch)".
 *   The next page load (fresh useTodos GET) re-sorts naturally; the frontend
 *   NEVER re-sorts client-side (canonical authority is the repository SQL). Do
 *   NOT copy create's onSettled invalidate here.
 */

export interface UseToggleTodoOptions {
  /** Confirmation/failure announcer — the single App-owned LiveRegion (AC 3, 5). */
  announce?: (message: string) => void
}

interface ToggleVariables {
  id: string
  completed: boolean
  /** Carried for the announcement string — read from the cache row at call time. */
  description: string
}

export function useToggleTodo({ announce }: UseToggleTodoOptions = {}) {
  const queryClient = useQueryClient()
  const inFlightIdsRef = useRef<Set<string>>(new Set())
  // Client-only presentation state: keys are in-flight row ids, values are the
  // pending checkbox destinations. Never a field on the Todo contract.
  const [togglingCompletedById, setTogglingCompletedById] = useState<
    Readonly<Record<string, boolean>>
  >({})

  function setTogglingDestination(id: string, completed: boolean) {
    setTogglingCompletedById((prev) => ({ ...prev, [id]: completed }))
  }

  function removeToggling(id: string) {
    inFlightIdsRef.current.delete(id)
    setTogglingCompletedById((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const mutation = useMutation<Todo, Error, ToggleVariables>({
    mutationFn: ({ id, completed }) => patchTodo(id, { completed }),

    onMutate: async ({ id, completed }) => {
      // Stop any in-flight list refetch from clobbering our optimistic write.
      await queryClient.cancelQueries({ queryKey: ['todos'] })

      // Keep the canonical Todo data backend-confirmed until success. The checkbox
      // reflects the pending destination from client-only state, but .complete
      // styling and App's active-count title keep reading confirmed data.
      setTogglingDestination(id, completed)
    },

    onSuccess: (confirmedTodo, { id, completed, description }) => {
      // Announce the settled state (AC 3). The destination boolean is the source
      // of truth for which string — not the server echo.
      announce?.(
        completed
          ? `${description} marked complete.`
          : `${description} marked active.`,
      )
      // Write the server-confirmed Todo into the SAME position (replace by id) to
      // capture the real updated_at. Do NOT invalidate — that would refetch in
      // canonical order and move the item, violating AC 4.
      queryClient.setQueryData<Todo[]>(['todos'], (old) =>
        (old ?? []).map((todo) => (todo.id === id ? confirmedTodo : todo)),
      )
    },

    onError: async (_error, { description }) => {
      // Reconcile to backend truth (AC 5): the change must not silently persist.
      await queryClient.invalidateQueries({ queryKey: ['todos'] })
      // Curly apostrophe + curly SINGLE quotes around the description — the
      // committed §2.6 copy style, shared with create failure (Story 3.2 C1).
      // Announce only after the reconciliation request has completed.
      announce?.(
        `Couldn’t update ‘${description}’. The list refreshed to current state.`,
      )
    },

    onSettled: (_data, _error, { id }) => {
      removeToggling(id)
    },
  })

  // toggle(id, completed): per-row in-flight arbitration (AC 8) — if this row
  // already has a toggle in flight, do NOT fire a conflicting second mutation.
  // The description is snapshotted from the cache row into the mutation
  // variables at call time so the announcement carries it even if the row
  // leaves the cache mid-flight. A cache MISS means the action is stale (the
  // row is already gone from backend truth and the reconcile is about to drop
  // it from view) — bail rather than fire a mutation whose announcement would
  // render an empty disambiguator (Story 3.2 C2).
  function toggle(id: string, completed: boolean) {
    if (inFlightIdsRef.current.has(id)) return
    const current = queryClient.getQueryData<Todo[]>(['todos'])
    const row = current?.find((todo) => todo.id === id)
    if (!row) return
    inFlightIdsRef.current.add(id)
    mutation.mutate({ id, completed, description: row.description })
  }

  return { toggle, togglingCompletedById }
}
