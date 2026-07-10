import { useImperativeHandle, useState } from 'react'
import type { Ref } from 'react'

import styles from './LiveRegion.module.css'

export type LiveRegionHandle = {
  announce: (message: string) => void
}

export type LiveRegionProps = {
  ref?: Ref<LiveRegionHandle>
}

export function LiveRegion({ ref }: LiveRegionProps) {
  const [entry, setEntry] = useState({ message: '', sequence: 0 })

  // Imperative announce API (React 19 ref-as-prop). announce only sets state
  // that renders text into the region; it must never call .focus() or move the
  // active element — a status region is a passive surface. The v1 announcement
  // copy and de-dupe rules live in <App>/mutation hooks, not in this primitive.
  //
  // The sequence increments on every announce so a repeat of the identical
  // message still mutates the region's text node — AT announces on DOM
  // mutation, so a byte-identical replace is silent (Story 3.2, AC 5). The
  // sequence renders as zero-width spaces (U+200B), which have no spoken
  // rendering in NVDA/VoiceOver live-region flow. A monotonic sequence, rather
  // than boolean alternation, keeps the final DOM text distinct even if multiple
  // identical announce calls are batched into one React render.
  useImperativeHandle(
    ref,
    () => ({
      announce: (message: string) =>
        setEntry((prev) => ({
          message,
          sequence: message === '' ? 0 : prev.sequence + 1,
        })),
    }),
    [],
  )

  return (
    <div aria-live="polite" className={styles.region} role="status">
      {entry.message}
      {entry.sequence > 0 ? '\u200B'.repeat(entry.sequence) : ''}
    </div>
  )
}
