'use client'

import { useSyncExternalStore } from 'react'

/**
 * Re-renders subscribers once a minute. Anything that reads the viewer's clock goes
 * through useSyncExternalStore with an empty server snapshot, so the server HTML
 * and the first client render always agree: a time computed during render would
 * show the server's hour to a viewer in another timezone, then mismatch.
 */
function subscribeToMinute(onChange: () => void) {
  const id = window.setInterval(onChange, 60_000)
  return () => window.clearInterval(id)
}

export function useClockValue(read: () => string): string {
  return useSyncExternalStore(subscribeToMinute, read, () => '')
}
