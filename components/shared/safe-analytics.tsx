'use client'

import { Analytics } from '@vercel/analytics/next'
import { redactPortalUrl } from '@/components/shared/analytics-url'

// Vercel Web Analytics with the quote portal's link token taken out of every address it would send. The root layout is
// a server component and cannot hand a function to Analytics, so the call sits here, in a client component.
export function SafeAnalytics() {
  return <Analytics beforeSend={redactPortalUrl} />
}
