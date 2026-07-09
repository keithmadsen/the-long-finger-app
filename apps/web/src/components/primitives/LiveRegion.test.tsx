import { act, render } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'

import { LiveRegion, type LiveRegionHandle } from './LiveRegion'

describe('LiveRegion', () => {
  it('renders exactly one polite status region and never assertive', () => {
    const { container } = render(<LiveRegion />)

    const regions = container.querySelectorAll('[role="status"]')
    expect(regions).toHaveLength(1)

    const region = regions[0]
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).not.toHaveAttribute('aria-live', 'assertive')
  })

  it('renders the announced message into the region', () => {
    const ref = createRef<LiveRegionHandle>()
    const { container } = render(<LiveRegion ref={ref} />)

    const region = container.querySelector('[role="status"]')
    // Empty before any announcement: proves announce() — not initial render —
    // is what puts the text on screen.
    expect(region).toHaveTextContent('')

    act(() => {
      ref.current?.announce('Buy milk added.')
    })

    expect(region).toHaveTextContent('Buy milk added.')
  })

  it('replaces the message text on a subsequent announce', () => {
    const ref = createRef<LiveRegionHandle>()
    const { container } = render(<LiveRegion ref={ref} />)

    const region = container.querySelector('[role="status"]')

    act(() => {
      ref.current?.announce('First message.')
    })
    expect(region).toHaveTextContent('First message.')

    act(() => {
      ref.current?.announce('Second message.')
    })
    expect(region).toHaveTextContent('Second message.')
    expect(region).not.toHaveTextContent('First message.')
  })

  it('mutates the DOM text on an identical consecutive announce so AT re-announces', () => {
    const ref = createRef<LiveRegionHandle>()
    const { container } = render(<LiveRegion ref={ref} />)

    const region = container.querySelector('[role="status"]') as HTMLElement

    act(() => {
      ref.current?.announce('Chores deleted.')
    })
    const firstRendered = region.textContent ?? ''

    act(() => {
      ref.current?.announce('Chores deleted.')
    })
    const secondRendered = region.textContent ?? ''

    // AT only re-announces on a DOM mutation inside the region; jsdom cannot
    // observe utterances, so the contract is: the rendered text node must
    // differ between two identical announce() calls...
    expect(secondRendered).not.toBe(firstRendered)

    // ...while the spoken output (text minus the zero-width nonce) is the
    // exact message both times.
    expect(firstRendered.replace(/\u200B/g, '')).toBe('Chores deleted.')
    expect(secondRendered.replace(/\u200B/g, '')).toBe('Chores deleted.')
  })

  it('mutates the DOM text on every announce in an identical-message run', () => {
    const ref = createRef<LiveRegionHandle>()
    const { container } = render(<LiveRegion ref={ref} />)

    const region = container.querySelector('[role="status"]') as HTMLElement
    const rendered: string[] = []

    for (let i = 0; i < 4; i += 1) {
      act(() => {
        ref.current?.announce('Retry failed.')
      })
      rendered.push(region.textContent ?? '')
    }

    for (let i = 1; i < rendered.length; i += 1) {
      expect(rendered[i]).not.toBe(rendered[i - 1])
      expect((rendered[i] ?? '').replace(/\u200B/g, '')).toBe('Retry failed.')
    }
  })

  it('does not steal focus when announcing', () => {
    const ref = createRef<LiveRegionHandle>()

    render(
      <>
        <button type="button">Keep me focused</button>
        <LiveRegion ref={ref} />
      </>,
    )

    const button = document.querySelector('button') as HTMLButtonElement
    button.focus()
    const activeBefore = document.activeElement

    act(() => {
      ref.current?.announce('Something happened.')
    })

    expect(document.activeElement).toBe(activeBefore)
    expect(document.activeElement).toBe(button)
  })
})
