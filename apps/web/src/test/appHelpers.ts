import { act, fireEvent, screen, within } from '@testing-library/react'
import { vi } from 'vitest'

import { DELETE_NO_COMMIT_WINDOW_MS } from '../hooks/useArmedDelete'

// App copy the suites assert against, centralized so the App.*.test.tsx files
// can't drift onto stale strings independently.
export const LOAD_FAILURE_MESSAGE =
  'Couldn’t load your list. Refresh to try again.'
export const INSTRUCTION_LINE =
  'Type a task and press Enter to add it to your list.'
export const CAPTURE_PLACEHOLDER = 'What do you want to do?'

// The instruction line stays MOUNTED but retires via aria-hidden + a CSS collapse
// once a task exists (AC 14). aria-hidden="true" on its wrapper is the signal.
export function instructionWrap(): HTMLElement {
  const wrap = screen.getByText(INSTRUCTION_LINE).parentElement
  if (!wrap) throw new Error('instruction wrapper not found')
  return wrap
}

// Commit a delete on a row: arm, cross the 300 ms muscle-memory window
// deterministically, confirm. Fake timers span only the synchronous sequence;
// the finally guarantees real timers are restored even when an assertion
// inside (e.g. the Confirm lookup) throws, so one red test can't strand fake
// timers and cascade into every later test in the file.
export function commitDelete(
  row: HTMLElement,
  options: { focusDeleteButton?: boolean } = {},
) {
  const deleteButton = within(row).getByRole('button', { name: /^Delete '/ })
  // Keyboard-parity commits start from the affordance itself.
  if (options.focusDeleteButton) deleteButton.focus()
  vi.useFakeTimers()
  try {
    fireEvent.click(deleteButton)
    act(() => vi.advanceTimersByTime(DELETE_NO_COMMIT_WINDOW_MS))
    fireEvent.click(
      within(row).getByRole('button', { name: /^Confirm deletion of/ }),
    )
  } finally {
    vi.useRealTimers()
  }
}
