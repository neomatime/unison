'use client'

import { AlertTriangle } from 'lucide-react'

/**
 * Without this, an error thrown while rendering the briefing escalates to the
 * root full-page fallback and replaces the whole tenant shell — sidebar
 * included — for every member of the organisation.
 *
 * That matters more since the briefing gained three deliberate throw sites:
 * `bandFor`'s default case, `positionNarrative`'s count reconciliation, and the
 * missing-due-date guard in `delivery-overview.ts`. All three are correct — they
 * refuse to publish misleading copy rather than quietly mislabelling a project —
 * but a throw needs somewhere to land. `operations/projects/` was given this
 * treatment for exactly this reason; `/overview` was not, in the same branch.
 */
export default function OverviewError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-border bg-card px-6 text-center">
      <AlertTriangle className="size-8 text-warning" />
      <h3 className="mt-4 font-semibold">The delivery briefing could not load</h3>
      <p className="mt-1 text-sm text-muted-foreground">The delivery data could not be retrieved. Try the request again.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-lg border border-border px-3 py-2 text-sm font-medium">Try again</button>
    </section>
  )
}
