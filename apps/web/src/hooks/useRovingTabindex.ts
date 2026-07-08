import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent } from 'react'

/*
 * useRovingTabindex — the list-wide roving-tabindex coordinator (Story 3.1,
 * UX-DR24 "Keyboard Navigation — Resolved", model B). Exactly ONE row anchor is
 * a page tab stop (tabIndex 0); Arrow/Home/End move real focus between anchors
 * (role="list" with real focus moves — never aria-activedescendant).
 *
 * TRANSIENT VIEW STATE ONLY (arch line 200: local UI state, no global store,
 * NOT TanStack Query). The state is the anchored todo ID, not an index: rows
 * reorder on toggle (canonical order re-sorts) while ids are stable and
 * key={todo.id} preserves the DOM node, so id-keyed anchoring means focus
 * simply travels with its row across a reorder.
 *
 * Consumed by <TodoList>, which owns which ids are navigable (normal rows only —
 * failed rows render no anchor and keep their natively-tabbable Retry/Dismiss,
 * UX line 1390). The DELETE arm/confirm layer (useArmedDelete) is untouched: the
 * delete button's own onKeyDown stops propagation, so this handler never sees
 * its keys.
 */

export interface UseRovingTabindexOptions {
  /** Ordered ids of the navigable rows (normal rows only — failed rows have no anchor). */
  ids: readonly string[]
  /**
   * Return focus to the capture input. Invoked on Escape from a row anchor
   * (AC 5) and as the stranded-focus fallback when the list empties (AC 7).
   */
  onEscape?: () => void
}

export interface RovingAnchorProps {
  /** The roving value: 0 on the single anchored row, -1 everywhere else (AC 1). */
  tabIndex: 0 | -1
  /** Syncs the anchor when focus arrives by other means (click, Shift+Tab). */
  onFocus: () => void
  /** Callback ref registering the anchor node as a focus target. */
  ref: (node: HTMLElement | null) => void
}

export interface RovingTabindex {
  /** The id whose anchor is the single page tab stop (null while no rows are navigable). */
  anchorId: string | null
  /** Spread-ready props for each navigable row's anchor element. */
  getAnchorProps: (id: string) => RovingAnchorProps
  /** Attach to the list container (<ul>). */
  containerProps: {
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
    onBlur: (event: FocusEvent<HTMLElement>) => void
  }
}

export function useRovingTabindex({
  ids,
  onEscape,
}: UseRovingTabindexOptions): RovingTabindex {
  // The anchor rests on the FIRST navigable row by default (Task A3).
  const [anchorId, setAnchorId] = useState<string | null>(() => ids[0] ?? null)

  // Focus targets keyed by id — registered via callback refs so arrow movement
  // can call .focus() on the destination anchor (WAI-ARIA APG roving pattern).
  const anchorNodesRef = useRef(new Map<string, HTMLElement>())
  // Previous render's ids: the removal fallback needs the REMOVED row's index.
  const prevIdsRef = useRef<readonly string[]>(ids)

  // Latest onEscape without re-running the reconcile effect on identity churn.
  // Declared BEFORE the reconcile effect so it is current when that effect runs.
  const onEscapeRef = useRef(onEscape)
  useLayoutEffect(() => {
    onEscapeRef.current = onEscape
  })

  /*
   * Reconcile the anchor when the id list changes (Tasks A3/A4, AC 7). When the
   * anchored id left the list (delete refetch, dismiss), fall back to the row now
   * at the removed row's index (clamped — the previous row if it was last). Focus
   * follows ONLY under 2.3's stranded-guard (document.activeElement === body):
   * the unmount stranded focus out from under the user; focus the user placed
   * elsewhere is never stolen. useLayoutEffect runs before paint, mirroring the
   * 2.3 commit-focus reclaim.
   */
  useLayoutEffect(() => {
    const prevIds = prevIdsRef.current
    prevIdsRef.current = ids
    if (anchorId !== null && ids.includes(anchorId)) {
      // The anchor is id-pinned only while the user is IN the list (focus
      // within the anchored row — reorder must not yank focus, AC 4). While
      // focus is OUTSIDE the list its sole job is the Tab entry point, which
      // is row 1 (AC 2/UX line 1387): without this, every capture-input create
      // PREPENDS a row above the pinned anchor and Tab-from-input would land
      // mid-list. Found in runtime verification — the blur-reset alone only
      // covers focus that actually entered the list.
      const anchorNode = anchorNodesRef.current.get(anchorId)
      if (
        anchorId !== ids[0] &&
        !anchorNode?.contains(document.activeElement)
      ) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- same reconcile pattern as below: transient anchor state re-derived from the async query-driven id list, guarded to fire only on an actual mismatch.
        setAnchorId(ids[0]!)
      }
      return
    }

    const removedIndex = anchorId === null ? -1 : prevIds.indexOf(anchorId)
    const stranded = document.activeElement === document.body

    if (ids.length === 0) {
      if (anchorId !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reconciling transient anchor state against the async query-derived row list; guarded to fire only when the anchored id actually left.
        setAnchorId(null)
        if (removedIndex !== -1 && stranded) onEscapeRef.current?.()
      }
      return
    }

    const fallbackId =
      removedIndex === -1
        ? ids[0]!
        : ids[Math.min(removedIndex, ids.length - 1)]!
    setAnchorId(fallbackId)
    if (removedIndex !== -1 && stranded) {
      anchorNodesRef.current.get(fallbackId)?.focus()
    }
  }, [ids, anchorId])

  /*
   * When the WHOLE list unmounts (the last row deleted → App swaps in the empty
   * state) the reconcile effect above never sees ids=[] — so the emptied-list
   * half of AC 7 lives in this unmount cleanup. Passive (not layout) on purpose:
   * passive cleanups for a removed tree run AFTER the DOM is detached, which is
   * exactly when stranded focus is observable on <body>. Same stranded-guard.
   */
  useEffect(() => {
    return () => {
      if (document.activeElement === document.body) onEscapeRef.current?.()
    }
  }, [])

  const focusAnchor = useCallback((id: string) => {
    setAnchorId(id)
    anchorNodesRef.current.get(id)?.focus()
  }, [])

  /** The id whose registered anchor node is the event target, else null. */
  function anchorIdOf(target: EventTarget | null): string | null {
    for (const [id, node] of anchorNodesRef.current) {
      if (node === target) return id
    }
    return null
  }

  /*
   * The list-wide keydown layer (layer 3 of the strict non-interference stack:
   * delete-button onKeyDown stops propagation before this; the row label's
   * Space/Enter toggle bubbles past untouched — neither key is handled here).
   *
   * UNDO CONTRACT (AC 6 / NG-6): the application binds NO handler to Cmd+Z,
   * Ctrl+Z, or related undo combinations — the modifier guard below lets every
   * modified key pass through to the browser/OS untouched. "Future engineers
   * must not add an undo handler without first revisiting NG-6 in the PRD."
   * [Source: ux-design-specification.md lines 1309-1332]
   */
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    // Act only when the event target IS a row anchor — never when a key bubbles
    // from inner controls (checkbox input) or failed-row Retry/Dismiss buttons.
    const targetId = anchorIdOf(event.target)
    if (targetId === null) return
    const index = ids.indexOf(targetId)
    if (index === -1) return

    switch (event.key) {
      // No wrap (AC 3): clamp at the boundaries. preventDefault fires even on a
      // clamped move so the page never scrolls under a handled arrow (Task A5).
      case 'ArrowDown':
        event.preventDefault()
        focusAnchor(ids[Math.min(index + 1, ids.length - 1)]!)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusAnchor(ids[Math.max(index - 1, 0)]!)
        break
      case 'Home':
        event.preventDefault()
        focusAnchor(ids[0]!)
        break
      case 'End':
        event.preventDefault()
        focusAnchor(ids[ids.length - 1]!)
        break
      // Escape on a row anchor returns focus to the capture input (AC 5). The
      // delete affordance's own Escape→anchor never reaches here (stopPropagation).
      case 'Escape':
        onEscape?.()
        break
    }
  }

  /*
   * Reset-to-first when focus exits the list (Task A3): Tab-from-input must
   * always land on row 1 (UX line 1387). Only a REAL exit resets — a blur with
   * relatedTarget inside the container is intra-list movement, and a null
   * relatedTarget is a stranded unmount (the reconcile effect owns that case)
   * or a window blur (position should survive an app switch).
   */
  function handleBlur(event: FocusEvent<HTMLElement>) {
    const next = event.relatedTarget
    if (next === null || event.currentTarget.contains(next)) return
    const firstId = ids[0] ?? null
    if (anchorId !== firstId) setAnchorId(firstId)
  }

  function getAnchorProps(id: string): RovingAnchorProps {
    return {
      tabIndex: id === anchorId ? 0 : -1,
      onFocus: () => {
        if (anchorId !== id) setAnchorId(id)
      },
      ref: (node) => {
        if (node) anchorNodesRef.current.set(id, node)
        else anchorNodesRef.current.delete(id)
      },
    }
  }

  return {
    anchorId,
    getAnchorProps,
    containerProps: { onKeyDown: handleKeyDown, onBlur: handleBlur },
  }
}
