'use client'

import { AlertTriangle } from 'lucide-react'

/**
 * Without this, an error thrown while rendering the Overview escalates to the root
 * full-page fallback and replaces the whole tenant shell, sidebar included, for
 * every member of the organisation. Each dashboard panel already handles its own
 * failed query, so this is only reached by something outside them, such as the
 * session lookup that every panel depends on.
 */
export default function OverviewError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="flex min-h-72 flex-col items-center justify-center rounded-none border border-border bg-card px-6 text-center">
      <AlertTriangle aria-hidden="true" className="size-8 text-warning" />
      <h3 className="mt-4 font-semibold">The CRM overview could not load</h3>
      <p className="mt-1 text-sm text-muted-foreground">Your clients, leads, quotes and sales could not be retrieved. Try the request again.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-none border border-border px-3 py-2 text-sm font-medium focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-brand">Try again</button>
    </section>
  )
}
