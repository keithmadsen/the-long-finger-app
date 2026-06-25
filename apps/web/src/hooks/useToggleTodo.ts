import { useState } from 'react'
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

interface MutationContext {
  previous: Todo[] | undefined
}

export function useToggleTodo({ announce }: UseToggleTodoOptions = {}) {
  const queryClient = useQueryClient()
  // The set of in-flight (toggling) ids. Client-only presentation state — never a
  // field on the Todo contract. <TodoItem> reads membership to render Pending and
  // to go inert (aria-disabled) while the toggle is in flight (AC 8).
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  function addToggling(id: string) {
    setTogglingIds((prev) => new Set(prev).add(id))
  }

  function removeToggling(id: string) {
    setTogglingIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const mutation = useMutation<Todo, Error, ToggleVariables, MutationContext>({
    mutationFn: ({ id, completed }) => patchTodo(id, { completed }),

    onMutate: async ({ id, completed }) => {
      // Stop any in-flight list refetch from clobbering our optimistic write.
      await queryClient.cancelQueries({ queryKey: ['todos'] })
      const previous = queryClient.getQueryData<Todo[]>(['todos'])

      // Optimistic write IN PLACE: flip this row's completed, keep its array
      // position (map by id — never prepend or re-sort). The checkbox reflects
      // the destination immediately; canonical re-sort waits for the next load.
      queryClient.setQueryData<Todo[]>(['todos'], (old) =>
        (old ?? []).map((todo) =>
          todo.id === id ? { ...todo, completed } : todo,
        ),
      )
      addToggling(id)

      return { previous }
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

    onError: (_error, { id, description }, context) => {
      // Revert THIS row's completed in place from the snapshot — a per-id restore,
      // never a whole-snapshot restore, so concurrent in-flight rows survive.
      const previousRow = context?.previous?.find((todo) => todo.id === id)
      if (previousRow) {
        queryClient.setQueryData<Todo[]>(['todos'], (old) =>
          (old ?? []).map((todo) =>
            todo.id === id
              ? { ...todo, completed: previousRow.completed }
              : todo,
          ),
        )
      }
      // Reconcile to backend truth (AC 5): the change must not silently persist.
      void queryClient.invalidateQueries({ queryKey: ['todos'] })
      // Curly apostrophe + curly quotes to match the existing failure copy.
      announce?.(
        `Couldn’t update “${description}”. The list refreshed to current state.`,
      )
    },

    onSettled: (_data, _error, { id }) => {
      removeToggling(id)
    },
  })

  // toggle(id, completed): per-row in-flight arbitration (AC 8) — if this row
  // already has a toggle in flight, do NOT fire a conflicting second mutation.
  // The description is read from the current cache row so the announcement has it.
  function toggle(id: string, completed: boolean) {
    if (togglingIds.has(id)) return
    const current = queryClient.getQueryData<Todo[]>(['todos'])
    const description = current?.find((todo) => todo.id === id)?.description ?? ''
    mutation.mutate({ id, completed, description })
  }

  return { toggle, togglingIds }
}
