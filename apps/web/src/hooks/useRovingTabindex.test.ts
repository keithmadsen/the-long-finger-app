import { act, renderHook } from '@testing-library/react'
import type { FocusEvent, KeyboardEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useRovingTabindex } from './useRovingTabindex'

/*
 * Pure-DOM hook test (no renderWithClient — the hook holds transient view state
 * only). Anchor nodes are real DOM <label>s registered through the hook's
 * callback refs inside a container <ul>, so focus() and document.activeElement
 * behave exactly as they do under <TodoList>. Keyboard/blur events are dispatched
 * by invoking the container handlers with React-shaped event objects — the same
 * fields the real synthetic events carry.
 */

type Harness = ReturnType<typeof setup>

function setup(initialIds: string[], onEscape = vi.fn()) {
  const container = document.createElement('ul')
  document.body.appendChild(container)
  const nodes = new Map<string, HTMLElement>()

  const view = renderHook(
    ({ ids }: { ids: string[] }) => useRovingTabindex({ ids, onEscape }),
    { initialProps: { ids: initialIds } },
  )

  /** Mount + register an anchor node for each id (idempotent), like React refs would. */
  function register(ids: string[]) {
    for (const id of ids) {
      let node = nodes.get(id)
      if (!node) {
        node = document.createElement('label')
        node.tabIndex = 0 // focusable in jsdom regardless of roving value
        node.dataset['id'] = id
        container.appendChild(node)
        nodes.set(id, node)
      }
      act(() => view.result.current.getAnchorProps(id).ref(node!))
    }
  }

  /** Unregister + unmount an anchor node, like React does when a row leaves. */
  function remove(id: string) {
    act(() => view.result.current.getAnchorProps(id).ref(null))
    nodes.get(id)?.remove()
    nodes.delete(id)
  }

  function keydown(
    key: string,
    targetId: string,
    modifiers: Partial<
      Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
    > = {},
  ) {
    const preventDefault = vi.fn()
    const event = {
      key,
      target: nodes.get(targetId),
      currentTarget: container,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault,
      ...modifiers,
    } as unknown as KeyboardEvent<HTMLElement>
    act(() => view.result.current.containerProps.onKeyDown(event))
    return { preventDefault }
  }

  function blurTo(relatedTarget: Element | null) {
    const event = {
      relatedTarget,
      currentTarget: container,
    } as unknown as FocusEvent<HTMLElement>
    act(() => view.result.current.containerProps.onBlur(event))
  }

  register(initialIds)

  return {
    view,
    container,
    nodes,
    onEscape,
    register,
    remove,
    keydown,
    blurTo,
    rerender: (ids: string[]) => {
      act(() => view.rerender({ ids }))
      register(ids)
    },
    tabIndexes: (ids: string[]) =>
      ids.map((id) => view.result.current.getAnchorProps(id).tabIndex),
  }
}

function anchorOf(harness: Harness) {
  return harness.view.result.current.anchorId
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useRovingTabindex', () => {
  it('rests exactly one anchor (tabIndex 0) on the FIRST navigable row (AC 1)', () => {
    const h = setup(['a', 'b', 'c'])

    expect(anchorOf(h)).toBe('a')
    expect(h.tabIndexes(['a', 'b', 'c'])).toEqual([0, -1, -1])
  })

  it('an empty id list has no anchor', () => {
    const h = setup([])

    expect(anchorOf(h)).toBeNull()
  })

  describe('Arrow / Home / End movement (AC 3)', () => {
    it('ArrowDown moves anchor + focus to the next row and prevents scrolling', () => {
      const h = setup(['a', 'b', 'c'])

      const { preventDefault } = h.keydown('ArrowDown', 'a')

      expect(anchorOf(h)).toBe('b')
      expect(document.activeElement).toBe(h.nodes.get('b'))
      expect(h.tabIndexes(['a', 'b', 'c'])).toEqual([-1, 0, -1])
      expect(preventDefault).toHaveBeenCalled()
    })

    it('ArrowUp moves anchor + focus to the previous row', () => {
      const h = setup(['a', 'b', 'c'])
      h.keydown('ArrowDown', 'a')

      h.keydown('ArrowUp', 'b')

      expect(anchorOf(h)).toBe('a')
      expect(document.activeElement).toBe(h.nodes.get('a'))
    })

    it('does NOT wrap: ArrowUp at the first row and ArrowDown at the last row clamp (AC 3)', () => {
      const h = setup(['a', 'b'])

      const up = h.keydown('ArrowUp', 'a')
      expect(anchorOf(h)).toBe('a')
      // Still consumed — the page must not scroll at the boundary either.
      expect(up.preventDefault).toHaveBeenCalled()

      h.keydown('ArrowDown', 'a')
      const down = h.keydown('ArrowDown', 'b')
      expect(anchorOf(h)).toBe('b')
      expect(down.preventDefault).toHaveBeenCalled()
    })

    it('Home moves to the first row, End to the last (AC 3)', () => {
      const h = setup(['a', 'b', 'c'])

      h.keydown('End', 'a')
      expect(anchorOf(h)).toBe('c')
      expect(document.activeElement).toBe(h.nodes.get('c'))

      h.keydown('Home', 'c')
      expect(anchorOf(h)).toBe('a')
      expect(document.activeElement).toBe(h.nodes.get('a'))
    })

    it('ignores keys whose target is not a registered row anchor (inner controls)', () => {
      const h = setup(['a', 'b'])
      const inner = document.createElement('input')
      h.container.appendChild(inner)

      const preventDefault = vi.fn()
      act(() =>
        h.view.result.current.containerProps.onKeyDown({
          key: 'ArrowDown',
          target: inner,
          currentTarget: h.container,
          altKey: false,
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          preventDefault,
        } as unknown as KeyboardEvent<HTMLElement>),
      )

      expect(anchorOf(h)).toBe('a')
      expect(preventDefault).not.toHaveBeenCalled()
    })
  })

  describe('modifier safety (AC 6, Task A5)', () => {
    it.each([
      ['metaKey', { metaKey: true }],
      ['ctrlKey', { ctrlKey: true }],
      ['altKey', { altKey: true }],
    ])(
      'ignores arrows carrying %s so browser/OS shortcuts pass through',
      (_name, modifiers) => {
        const h = setup(['a', 'b'])

        const { preventDefault } = h.keydown('ArrowDown', 'a', modifiers)

        expect(anchorOf(h)).toBe('a')
        expect(preventDefault).not.toHaveBeenCalled()
      },
    )

    it('ignores Cmd/Ctrl+Z entirely — no state change, no preventDefault (AC 6)', () => {
      const h = setup(['a', 'b'])

      const meta = h.keydown('z', 'a', { metaKey: true })
      const ctrl = h.keydown('z', 'a', { ctrlKey: true })

      expect(anchorOf(h)).toBe('a')
      expect(meta.preventDefault).not.toHaveBeenCalled()
      expect(ctrl.preventDefault).not.toHaveBeenCalled()
    })
  })

  describe('Escape (AC 5)', () => {
    it('Escape on a row anchor calls onEscape (the caller focuses the capture input)', () => {
      const h = setup(['a', 'b'])

      h.keydown('Escape', 'b')

      expect(h.onEscape).toHaveBeenCalledTimes(1)
    })

    it('Escape with a modifier is ignored', () => {
      const h = setup(['a'])

      h.keydown('Escape', 'a', { metaKey: true })

      expect(h.onEscape).not.toHaveBeenCalled()
    })
  })

  describe('id-keyed anchoring across reorder (AC 4 of the toggle flow)', () => {
    it('the anchor follows its id when the list reorders', () => {
      const h = setup(['a', 'b', 'c'])
      h.keydown('ArrowDown', 'a') // anchor → 'b'

      h.rerender(['b', 'c', 'a']) // toggle re-sorts; ids stable

      expect(anchorOf(h)).toBe('b')
      expect(h.tabIndexes(['b', 'c', 'a'])).toEqual([0, -1, -1])
    })
  })

  describe('removal fallback + focus-follow (AC 7, Tasks A3/A4)', () => {
    it('a removed MIDDLE anchor falls back to the row now at its index (the next row)', () => {
      const h = setup(['a', 'b', 'c'])
      h.keydown('ArrowDown', 'a') // anchor → 'b'
      h.nodes.get('b')?.focus()

      h.remove('b') // unmount strands focus on <body>
      expect(document.activeElement).toBe(document.body)
      h.rerender(['a', 'c'])

      expect(anchorOf(h)).toBe('c')
      // Stranded focus was reclaimed onto the fallback anchor.
      expect(document.activeElement).toBe(h.nodes.get('c'))
    })

    it('a removed LAST anchor falls back to the previous row (clamped)', () => {
      const h = setup(['a', 'b', 'c'])
      h.keydown('End', 'a') // anchor → 'c'
      h.nodes.get('c')?.focus()

      h.remove('c')
      h.rerender(['a', 'b'])

      expect(anchorOf(h)).toBe('b')
      expect(document.activeElement).toBe(h.nodes.get('b'))
    })

    it('removing the ONLY row clears the anchor and calls onEscape for stranded focus (list emptied)', () => {
      const h = setup(['a'])
      h.nodes.get('a')?.focus()

      h.remove('a')
      h.rerender([])

      expect(anchorOf(h)).toBeNull()
      expect(h.onEscape).toHaveBeenCalledTimes(1)
    })

    it('never steals focus the user moved elsewhere (stranded-guard, Task A4)', () => {
      const h = setup(['a', 'b'])
      const outside = document.createElement('button')
      document.body.appendChild(outside)
      outside.focus() // user parked focus outside the list

      h.remove('a')
      h.rerender(['b'])

      expect(anchorOf(h)).toBe('b') // anchor state still falls back…
      expect(document.activeElement).toBe(outside) // …but focus is untouched
      expect(h.onEscape).not.toHaveBeenCalled()
    })

    it('unmounting the whole hook with stranded focus calls onEscape (surface emptied)', () => {
      const h = setup(['a'])
      h.nodes.get('a')?.focus()
      h.nodes.get('a')?.remove() // list unmounts wholesale; focus falls to <body>

      act(() => h.view.unmount())

      expect(h.onEscape).toHaveBeenCalledTimes(1)
    })

    it('unmounting the whole hook does NOT call onEscape when focus is elsewhere', () => {
      const h = setup(['a'])
      const outside = document.createElement('button')
      document.body.appendChild(outside)
      outside.focus()

      act(() => h.view.unmount())

      expect(h.onEscape).not.toHaveBeenCalled()
    })
  })

  describe('anchor rests on the FIRST row while focus is outside the list (AC 2)', () => {
    it('a row prepended while focus is elsewhere moves the anchor to the new first row', () => {
      const h = setup(['a'])
      const outside = document.createElement('input')
      document.body.appendChild(outside)
      outside.focus() // e.g. the capture input, mid-burst

      h.rerender(['b', 'a']) // a create PREPENDS above the old anchor

      expect(anchorOf(h)).toBe('b')
      expect(h.tabIndexes(['b', 'a'])).toEqual([0, -1])
      expect(document.activeElement).toBe(outside) // focus untouched
    })

    it('does NOT re-anchor while focus is inside the anchored row (reorder keeps position)', () => {
      const h = setup(['a', 'b'])
      h.keydown('ArrowDown', 'a') // anchor + focus → 'b'

      h.rerender(['c', 'b', 'a']) // 'b' is no longer first, but the user is ON it

      expect(anchorOf(h)).toBe('b')
      expect(document.activeElement).toBe(h.nodes.get('b'))
    })
  })

  describe('reset-to-first on list exit (Task A3)', () => {
    it('a blur that leaves the list resets the anchor to the first row', () => {
      const h = setup(['a', 'b', 'c'])
      h.keydown('End', 'a') // anchor → 'c'
      const outside = document.createElement('input')
      document.body.appendChild(outside)

      h.blurTo(outside)

      expect(anchorOf(h)).toBe('a')
      expect(h.tabIndexes(['a', 'b', 'c'])).toEqual([0, -1, -1])
    })

    it('a blur WITHIN the list does not reset the anchor', () => {
      const h = setup(['a', 'b'])
      h.keydown('ArrowDown', 'a') // anchor → 'b'

      h.blurTo(h.nodes.get('a') ?? null)

      expect(anchorOf(h)).toBe('b')
    })

    it('a blur with no relatedTarget (stranded/window) does not reset — removal fallback owns it', () => {
      const h = setup(['a', 'b'])
      h.keydown('ArrowDown', 'a') // anchor → 'b'

      h.blurTo(null)

      expect(anchorOf(h)).toBe('b')
    })
  })

  describe('anchor sync on focus arrival (click path)', () => {
    it('onFocus moves the anchor to the focused row', () => {
      const h = setup(['a', 'b'])

      // onFocus fires only when the node actually received focus (click,
      // Shift+Tab) — mirror that: focus the DOM node, then notify the hook.
      h.nodes.get('b')?.focus()
      act(() => h.view.result.current.getAnchorProps('b').onFocus())

      expect(anchorOf(h)).toBe('b')
      expect(h.tabIndexes(['a', 'b'])).toEqual([-1, 0])
    })
  })

  it('rows appearing on an initially empty list gain a first-row anchor without stealing focus', () => {
    const h = setup([])
    const outside = document.createElement('input')
    document.body.appendChild(outside)
    outside.focus()

    h.rerender(['a', 'b'])

    expect(anchorOf(h)).toBe('a')
    expect(document.activeElement).toBe(outside)
  })
})
