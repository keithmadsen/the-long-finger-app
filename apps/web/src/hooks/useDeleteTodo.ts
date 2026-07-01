import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Todo } from '@tlf/contracts'

import { deleteTodo as deleteTodoRequest } from '../api/todos'

/*
 * useDeleteTodo — hard delete via DELETE /todos/:id, the THIRD consumer of the
 * mandatory honest-pending shape (cancel → snapshot → pending marker; per-id
 * rollback on error; cleanup on settle). It is closest to useToggleTodo (per-row
 * arbitration + client-only presentation state) with delete's divergences:
 *
 *   • onMutate writes NOTHING to the cache. Honest-pending ≠ optimistic (UX-DR15):
 *     the row is NOT removed — it is marked *Committing* via a client-only
 *     `deletingIds` set and stays visible until the backend confirms (FR-3).
 *     Story 2.2 consumes `deletingIds` to render the Committing/aria-busy visual.
 *   • onError writes nothing to the cache (the row was never removed, so there is
 *     no snapshot to restore); the onSettled refetch reconciles to backend truth.
 *   • onSettled invalidates ['todos'] UNCONDITIONALLY (AC 3): on success the
 *     refetch drops the deleted row; on error it restores it. This is the
 *     opposite of toggle, which never invalidates on success (a re-sort would
 *     move a just-completed item). Do NOT copy toggle's "write in place, never
 *     invalidate" logic here — a refetch after delete is exactly correct.
 *
 * `deletingIds` is presentation state, NEVER a field on the Todo contract
 * (1.7/1.8 precedent). Announcements are wired HERE in Story 2.3 (no longer
 * deferred): `onSuccess` announces "{description} deleted." (terminal, no undo)
 * and `onError` reuses toggle's shared mutation-failure copy. The `description`
 * is read from the cache at call time (mirroring useToggleTodo) and threaded
 * through the mutation variables purely for the announcement string.
 */

export interface UseDeleteTodoOptions {
  /** Confirmation/failure announcer — the single App-owned LiveRegion (AC 2, 5). */
  announce?: (message: string) => void
}

interface DeleteVariables {
  id: string
  /** Carried for the announcement string — read from the cache row at call time. */
  description: string
}

export function useDeleteTodo({ announce }: UseDeleteTodoOptions = {}) {
  const queryClient = useQueryClient()
  const inFlightIdsRef = useRef<Set<string>>(new Set())
  // Client-only presentation state: the set of row ids currently being deleted
  // (the Committing marker). Never a field on the Todo contract.
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  function addDeleting(id: string) {
    setDeletingIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  function removeDeleting(id: string) {
    inFlightIdsRef.current.delete(id)
    setDeletingIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const mutation = useMutation<void, Error, DeleteVariables>({
    mutationFn: ({ id }) => deleteTodoRequest(id),

    onMutate: async ({ id }) => {
      // Stop any in-flight list refetch from racing our marker. We do NOT write
      // the cache — honest-pending shows the row as Committing, not gone (AC 3,
      // UX-DR15) — so there is deliberately NO snapshot to roll back to.
      await queryClient.cancelQueries({ queryKey: ['todos'] })
      addDeleting(id)
    },

    onSuccess: (_data, { description }) => {
      // The 204 confirms the row is gone; the announcement is TERMINAL — no undo
      // copy (AC 2). "Once" is naturally satisfied (onSuccess fires once per
      // successful mutation). Do NOT touch the cache here — the onSettled
      // invalidate is what drops the row (honest-pending).
      announce?.(`${description} deleted.`)
    },

    // onError is ANNOUNCE-ONLY (AC 5): no cache rollback (code-review finding).
    // Because onMutate never removed the row, there is nothing to restore, and
    // blindly writing back a pre-mutation snapshot would be actively wrong under
    // concurrency — a later failure could resurrect a sibling row that a parallel
    // delete had already removed. The item is never silently lost (AC 4)
    // precisely because it was never optimistically removed; the onSettled
    // invalidate reconciles both paths to backend truth. The copy is the SAME
    // string useToggleTodo.onError emits — the UX spec shares one mutation-
    // failure announcement across toggle AND delete (curly apostrophe + quotes).
    onError: (_error, { description }) => {
      announce?.(
        `Couldn’t update “${description}”. The list refreshed to current state.`,
      )
    },

    onSettled: (_data, _error, { id }) => {
      removeDeleting(id)
      // Unconditional reconcile (AC 3, 4): success drops the row, a failure
      // leaves it — the refetch is the single source of truth either way.
      void queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  // deleteTodo(id): per-row in-flight arbitration — if this row already has a
  // delete in flight, do NOT fire a conflicting second mutation. The description
  // is read from the current cache row so the announcement has it (mirroring
  // useToggleTodo.toggle); arbitration stays keyed on id alone.
  function deleteTodo(id: string) {
    if (inFlightIdsRef.current.has(id)) return
    inFlightIdsRef.current.add(id)
    const current = queryClient.getQueryData<Todo[]>(['todos'])
    const description = current?.find((todo) => todo.id === id)?.description ?? ''
    mutation.mutate({ id, description })
  }

  return { deleteTodo, deletingIds }
}
