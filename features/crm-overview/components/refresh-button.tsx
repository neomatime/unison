'use client'

import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

/** Re-runs the server queries for the current page; the retry for a failed panel. */
export function RefreshButton({ className }: { className?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className={className ?? 'inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60'}
    >
      <RefreshCw aria-hidden="true" className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} />
      {pending ? 'Retrying…' : 'Retry'}
    </button>
  )
}
