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
  const [entry, setEntry] = useState({ message: '', nonce: false })

  // Imperative announce API (React 19 ref-as-prop). announce only sets state
  // that renders text into the region; it must never call .focus() or move the
  // active element — a status region is a passive surface. The v1 announcement
  // copy and de-dupe rules live in <App>/mutation hooks, not in this primitive.
  //
  // The nonce alternates on every announce so a repeat of the identical
  // message still mutates the region's text node — AT announces on DOM
  // mutation, so a byte-identical replace is silent (Story 3.2, AC 5). The
  // nonce renders as a zero-width space (U+200B), which has no spoken
  // rendering in NVDA/VoiceOver live-region flow.
  useImperativeHandle(
    ref,
    () => ({
      announce: (message: string) =>
        setEntry((prev) => ({ message, nonce: !prev.nonce })),
    }),
    [],
  )

  return (
    <div aria-live="polite" className={styles.region} role="status">
      {entry.message}
      {entry.nonce ? '\u200B' : ''}
    </div>
  )
}
