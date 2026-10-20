'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { Analytics } from '@vercel/analytics/next'
import { isPortalPath, redactPortalUrl } from '@/components/shared/analytics-url'

// Vercel Web Analytics, kept away from the quote portal.
//
// A portal address carries the link token, which is the credential. `beforeSend` cannot be trusted to keep it out:
// @vercel/analytics/next also hands its script the raw pathname as `path`, outside what `beforeSend` sees. So on a
// portal page nothing is rendered and the script is never loaded. Everywhere else Analytics runs with `beforeSend`
// still redacting any portal address, as defence in depth (a client-side move from another page to a portal one).
//
// This lives in a client component because the root layout is a server component and cannot read the pathname or
// hand Analytics a function.

function AnalyticsUnlessPortal() {
  // Always called, before any condition (rules of hooks).
  const pathname = usePathname()
  // Fails closed: a pathname that is not a string cannot be shown not to be a portal address, so nothing is rendered.
  if (typeof pathname !== 'string' || isPortalPath(pathname)) return null
  return <Analytics beforeSend={redactPortalUrl} />
}

export function SafeAnalytics() {
  // usePathname can suspend on a dynamic route if cacheComponents is ever turned on; without a boundary that would
  // fail the build. The fallback is empty: analytics has nothing to show while it waits.
  return (
    <Suspense fallback={null}>
      <AnalyticsUnlessPortal />
    </Suspense>
  )
}
