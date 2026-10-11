'use client'

import { useEffect } from 'react'

/** Opens the browser's print dialog once the sheet's images have loaded, so the logo and header picture are in the print. */
export function AutoPrint() {
  useEffect(() => {
    let cancelled = false
    const images = Array.from(document.images)
    Promise.all(
      images.map((image) => (image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve() }))),
    ).then(() => {
      if (!cancelled) window.print()
    })
    return () => { cancelled = true }
  }, [])
  return null
}
