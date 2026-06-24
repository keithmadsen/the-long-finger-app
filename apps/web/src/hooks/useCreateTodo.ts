import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateTodoBody, Todo } from '@tlf/contracts'
import { v7 as uuidv7 } from 'uuid'

import { createTodo } from '../api/todos'

/*
 * useCreateTodo — the create mutation, and the canonical home of the MANDATORY
 * honest-pending mutation shape (architecture #Process-Patterns). Toggle (1.8),
 * failed-create recovery (1.9) and delete (Epic 2) mirror this exact flow; this
 * story DEFINES it. The shape:
 *
 *   onMutate  → cancelQueries(['todos']) → snapshot previous → write a PENDING
 *               Todo into the cache immutably (new reference), carrying its
 *               client UUIDv7 id. Track the id as pending (a client-only Set, NOT
 *               a field on the Todo contract).
 *   onError   → remove THIS row only (a per-id removal, never a whole-snapshot
 *               restore — that would clobber other in-flight rows; AC 13). In 1.7
 *               a failed create simply disappears; the Failed-variant UI, Retry
 *               and the ~10s timeout are Story 1.9.
 *   onSuccess → announce "{description} added." via the App-owned <LiveRegion>.
 *   onSettled → invalidateQueries(['todos']). The settle IS the invalidation
 *               refetch — the POST 201/200 body is NEVER merged into the cache
 *               (AC 12); the client already owns the final id, so there is no
 *               temporary-id reconciliation path.
 *
 * The pending row already carries its final UUIDv7 id (client-generated), so a
 * retry is idempotent on the server (201 new / 200 existing).
 */

export interface UseCreateTodoOptions {
  /** Confirmation announcer — the single App-owned LiveRegion's announce (AC 9). */
  announce?: (message: string) => void
  /**
   * Fired once on a successful create. App uses it to latch the "has ever created
   * a task" flag that retires the instruction line (AC 14) — done in this
   * success callback rather than a data-watching effect.
   */
  onCreated?: () => void
}

interface MutationContext {
  previous: Todo[] | undefined
}

export function useCreateTodo({
  announce,
  onCreated,
}: UseCreateTodoOptions = {}) {
  const queryClient = useQueryClient()
  // The set of in-flight (pending) ids. Client-only presentation state — never a
  // field on the Todo contract. <TodoItem> reads membership to render Pending.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

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

  const mutation = useMutation<Todo, Error, CreateTodoBody, MutationContext>({
    mutationFn: (body) => createTodo(body),

    onMutate: async (body) => {
      // Stop any in-flight list refetch from overwriting our optimistic write.
      await queryClient.cancelQueries({ queryKey: ['todos'] })
      const previous = queryClient.getQueryData<Todo[]>(['todos'])

      // A client-synthesized timestamp so the pending row sorts to the TOP of the
      // actives (canonical completed ASC, updatedAt DESC). The REAL server
      // timestamps arrive on the invalidation refetch — this value is transient.
      const now = new Date().toISOString()
      const pendingTodo: Todo = {
        id: body.id,
        description: body.description,
        completed: false,
        createdAt: now,
        updatedAt: now,
      }

      // Immutable write, new array reference. Prepend = top of the list (newest
      // active); the backend's canonical order is restored on invalidation.
      queryClient.setQueryData<Todo[]>(['todos'], (old) => [
        pendingTodo,
        ...(old ?? []),
      ])
      addPending(body.id)

      return { previous }
    },

    onError: (_error, body) => {
      // Roll back THIS row only — a targeted removal, not a restore of the whole
      // `previous` snapshot, so concurrent in-flight rows are left untouched
      // (AC 13). Immutable: filter to a new array reference.
      queryClient.setQueryData<Todo[]>(['todos'], (old) =>
        (old ?? []).filter((todo) => todo.id !== body.id),
      )
      removePending(body.id)
    },

    onSuccess: (_created, body) => {
      // The submitted text is the disambiguator (AC 9). No announcement on
      // pending or on the rolled-back error.
      announce?.(`${body.description} added.`)
      onCreated?.()
    },

    onSettled: (_data, _error, body) => {
      removePending(body.id)
      // Settle = invalidate, NOT merge (AC 12). Refetch is the canonical settle.
      void queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  // Generate a fresh UUIDv7 per submit, so even an accidental resubmit of the
  // same text is a DISTINCT todo (never a duplicate-id collision).
  function submit(description: string) {
    mutation.mutate({ id: uuidv7(), description })
  }

  return { submit, pendingIds }
}
