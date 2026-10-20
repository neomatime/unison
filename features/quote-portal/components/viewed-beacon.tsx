'use client'

import { useEffect, useRef } from 'react'

import { recordViewAction } from '@/features/quote-portal/actions/record-view'

/**
 * Tells the server the page has been opened, once, after it has loaded in a browser. This is what marks a quote as
 * opened: the server never does it while rendering, so a mail scanner or a link preview that only fetches the page
 * changes nothing. It renders nothing.
 *
 * The ref keeps it to one call when React runs the effect twice (development does), and a failed call is swallowed:
 * the client is reading a quote, and a counter that did not move must never get in the way.
 */
export function ViewedBeacon({ token }: { token: string }) {
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    recordViewAction(token).catch(() => {})
  }, [token])
  return null
}
