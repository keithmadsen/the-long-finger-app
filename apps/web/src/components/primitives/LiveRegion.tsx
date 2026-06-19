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
  const [message, setMessage] = useState('')

  // Imperative announce API (React 19 ref-as-prop). announce only sets state
  // that renders text into the region; it must never call .focus() or move the
  // active element — a status region is a passive surface. The v1 announcement
  // copy and de-dupe rules live in <App>/mutation hooks, not in this primitive.
  useImperativeHandle(ref, () => ({ announce: setMessage }), [])

  return (
    <div aria-live="polite" className={styles.region} role="status">
      {message}
    </div>
  )
}
