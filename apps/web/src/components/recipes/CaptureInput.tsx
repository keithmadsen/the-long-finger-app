import { useId, useImperativeHandle, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, Ref } from 'react'

import { TextInput } from '../primitives'
import { CharCounter } from './CharCounter'
import styles from './CaptureInput.module.css'

const MAX_LENGTH = 200
// Counter appears only as you near the cap — calm until then (AC 3).
const COUNTER_THRESHOLD = 180
const PLACEHOLDER = 'What do you want to do?'

/**
 * Imperative focus handle (Story 3.1, mirrors the LiveRegionHandle precedent):
 * App points Escape-on-a-row (and the emptied-list focus fallback) back here.
 */
export type CaptureInputHandle = {
  focus: () => void
}

export interface CaptureInputProps {
  /**
   * Called with the trimmed, non-empty description when the user presses Enter.
   * The parent owns the mutation (useCreateTodo) so its pending state can reach
   * the list; this recipe stays network-agnostic per the component boundary.
   */
  onSubmit: (description: string) => void
  ref?: Ref<CaptureInputHandle>
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
 *   - the N/200 CharCounter near the cap,
 *   - Escape-clears-draft (Story 3.1 AC 5): Escape with text clears the value
 *     (no submit, no blur); Escape on an empty field is a no-op and the event
 *     passes through untouched.
 *
 * Rapid-Enter safety: the value clears synchronously on submit, so a second
 * Enter on the now-empty field is suppressed by the primitive; and each submit
 * generates a fresh UUIDv7 upstream, so even an accidental resubmit of the same
 * text is a distinct todo, never a duplicate-id collision.
 */
export function CaptureInput({ onSubmit, ref }: CaptureInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const counterId = useId()

  // The focus() handle App wires to the list's Escape/empty-fallback (Story 3.1).
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), [])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value)
  }

  // Escape with a non-empty draft clears it and keeps focus (Story 3.1 AC 5).
  // TextInput forwards the caller's onKeyDown BEFORE its Enter logic, so this
  // never interferes with submit. An empty field lets Escape pass untouched.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Escape' || value.length === 0) return
    event.preventDefault()
    setValue('')
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
        onKeyDown={handleKeyDown}
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
