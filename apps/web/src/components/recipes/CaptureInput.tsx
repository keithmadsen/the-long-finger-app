import { useId, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

import { TextInput } from '../primitives'
import { CharCounter } from './CharCounter'
import styles from './CaptureInput.module.css'

const MAX_LENGTH = 200
// Counter appears only as you near the cap — calm until then (AC 3).
const COUNTER_THRESHOLD = 180
const PLACEHOLDER = 'What do you want to do?'

export interface CaptureInputProps {
  /**
   * Called with the trimmed, non-empty description when the user presses Enter.
   * The parent owns the mutation (useCreateTodo) so its pending state can reach
   * the list; this recipe stays network-agnostic per the component boundary.
   */
  onSubmit: (description: string) => void
}

/*
 * The always-present capture field (AC 1–3). Wraps the <TextInput> primitive,
 * which ALREADY owns Enter-to-submit, empty/whitespace trim-and-suppress, IME
 * composition handling and trimmed-value dispatch — this recipe does NOT
 * re-implement those. It owns:
 *   - the controlled value + maxLength={200} silent cap (AC 3),
 *   - the calm placeholder,
 *   - clearing + refocusing the input IMMEDIATELY ON SUBMIT, not on confirm
 *     (AC 2), so the next task can be typed at once — independent of whether the
 *     create has resolved,
 *   - the N/200 CharCounter near the cap.
 *
 * Rapid-Enter safety: the value clears synchronously on submit, so a second
 * Enter on the now-empty field is suppressed by the primitive; and each submit
 * generates a fresh UUIDv7 upstream, so even an accidental resubmit of the same
 * text is a distinct todo, never a duplicate-id collision.
 */
export function CaptureInput({ onSubmit }: CaptureInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const counterId = useId()

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value)
  }

  function handleSubmit(trimmed: string) {
    onSubmit(trimmed)
    // Clear + refocus NOW (AC 2) — not when the mutation resolves.
    setValue('')
    inputRef.current?.focus()
  }

  const counterVisible = value.length >= COUNTER_THRESHOLD

  return (
    <div className={styles.field}>
      <TextInput
        ref={inputRef}
        aria-describedby={counterVisible ? counterId : undefined}
        autoFocus
        maxLength={MAX_LENGTH}
        onChange={handleChange}
        onSubmit={handleSubmit}
        placeholder={PLACEHOLDER}
        value={value}
      />
      <CharCounter
        id={counterId}
        length={value.length}
        max={MAX_LENGTH}
        threshold={COUNTER_THRESHOLD}
      />
    </div>
  )
}
