'use client'

import { AlertTriangle, LockKeyhole, SearchX } from 'lucide-react'
import { useState } from 'react'

export function LoadingSkeleton() {
  return <div className="space-y-3 p-6" aria-label="Loading"><div className="h-10 animate-pulse rounded-lg bg-muted" />{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-lg bg-muted/70" />)}</div>
}

export function EmptyState({ search = false }: { search?: boolean }) {
  return <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><SearchX className="size-8 text-muted-foreground" /><h3 className="mt-4 font-semibold">{search ? 'No matching records' : 'Nothing here yet'}</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">{search ? 'Try changing your search or filters.' : 'Create the first record to begin building this workspace.'}</p></div>
}

export function ErrorState() {
  const [retrying, setRetrying] = useState(false)
  if (retrying) return <LoadingSkeleton />
  return <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><AlertTriangle className="size-8 text-warning" /><h3 className="mt-4 font-semibold">This workspace could not load</h3><p className="mt-1 text-sm text-muted-foreground">A temporary problem prevented this content from loading.</p><button type="button" onClick={() => { setRetrying(true); window.setTimeout(() => setRetrying(false), 800) }} className="mt-4 rounded-lg border border-border px-3 py-2 text-sm font-medium">Try again</button></div>
}

export function PermissionState() {
  return <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><LockKeyhole className="size-8 text-muted-foreground" /><h3 className="mt-4 font-semibold">Restricted workspace</h3><p className="mt-1 text-sm text-muted-foreground">Your current role does not include access to this area.</p></div>
}
