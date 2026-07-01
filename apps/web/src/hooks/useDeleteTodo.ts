import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

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
 *   • onError restores the snapshot (the row was never removed, so nothing is
 *     silently lost, AC 4); the onSettled refetch reconciles to backend truth.
 *   • onSettled invalidates ['todos'] UNCONDITIONALLY (AC 3): on success the
 *     refetch drops the deleted row; on error it restores it. This is the
 *     opposite of toggle, which never invalidates on success (a re-sort would
 *     move a just-completed item). Do NOT copy toggle's "write in place, never
 *     invalidate" logic here — a refetch after delete is exactly correct.
 *
 * `deletingIds` is presentation state, NEVER a field on the Todo contract
 * (1.7/1.8 precedent). Announcements (LiveRegion "{description} deleted.") are
 * Story 2.3 — deliberately NOT here (no announce option, no dead code); the
 * mutation variables stay `{ id }` only. This hook is NOT wired into App/TodoList/
 * TodoItem in this story ("before any delete UI exists") — that is Story 2.2.
 */

interface DeleteVariables {
  id: string
}

export function useDeleteTodo() {
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

    // No onError cache rollback (code-review finding): because onMutate never
    // removed the row, there is nothing to restore, and blindly writing back a
    // pre-mutation snapshot would be actively wrong under concurrency — a later
    // failure could resurrect a sibling row that a parallel delete had already
    // removed. The item is never silently lost (AC 4) precisely because it was
    // never optimistically removed; the onSettled invalidate reconciles both
    // paths to backend truth.
    onSettled: (_data, _error, { id }) => {
      removeDeleting(id)
      // Unconditional reconcile (AC 3, 4): success drops the row, a failure
      // leaves it — the refetch is the single source of truth either way.
      void queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  // deleteTodo(id): per-row in-flight arbitration — if this row already has a
  // delete in flight, do NOT fire a conflicting second mutation.
  function deleteTodo(id: string) {
    if (inFlightIdsRef.current.has(id)) return
    inFlightIdsRef.current.add(id)
    mutation.mutate({ id })
  }

  return { deleteTodo, deletingIds }
}
