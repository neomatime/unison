'use client'

import { PortalStateCard } from '@/features/quote-portal/components/portal-state-card'
import { RETRY_LABEL } from '@/features/quote-portal/copy'

/**
 * What a client sees when something throws while a portal page renders: the same calm temporary-error card, and a
 * button to try again. It is handed the error and ignores it, so no message, stack or reference reaches the page; the
 * server has already logged what it needs. In this version of Next, retry() fetches the page again and renders it,
 * which is what a temporary fault needs (reset() would only clear the error and show the same page).
 */
export default function PortalError({ retry }: { retry: () => void }) {
  return (
    <PortalStateCard quote={{ state: 'error' }}>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 inline-flex items-center justify-center border border-foreground px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        {RETRY_LABEL}
      </button>
    </PortalStateCard>
  )
}
