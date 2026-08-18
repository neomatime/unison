'use client'

import { AlertTriangle } from 'lucide-react'

export default function ClientsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-border bg-card px-6 text-center">
      <AlertTriangle className="size-8 text-warning" />
      <h3 className="mt-4 font-semibold">This workspace could not load</h3>
      <p className="mt-1 text-sm text-muted-foreground">The Clients data could not be retrieved. Try the request again.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-lg border border-border px-3 py-2 text-sm font-medium">Try again</button>
    </section>
  )
}
