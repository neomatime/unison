'use client'

import { AlertTriangle, LockKeyhole, SearchX } from 'lucide-react'
import { useState } from 'react'

export function LoadingSkeleton() {
  return <div className="space-y-3 p-6" aria-label="Loading"><div className="unison-skeleton h-10 rounded-none bg-muted" />{Array.from({ length: 5 }).map((_, index) => <div key={index} className="unison-skeleton h-14 rounded-none bg-muted/70" style={{ animationDelay: `${index * 60}ms` }} />)}</div>
}

export function EmptyState({ search = false }: { search?: boolean }) {
  return <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><SearchX className="size-8 text-muted-foreground" /><h3 className="unison-section-title mt-4 text-sm">{search ? 'No matching records' : 'Nothing here yet'}</h3><p className="mt-2 max-w-sm text-sm text-muted-foreground">{search ? 'Try changing your search or filters.' : 'Create the first record to begin building this workspace.'}</p></div>
}

export function ErrorState() {
  const [retrying, setRetrying] = useState(false)
  if (retrying) return <LoadingSkeleton />
  return <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><AlertTriangle className="size-8 text-warning" /><h3 className="unison-section-title mt-4 text-sm">This workspace could not load</h3><p className="mt-2 text-sm text-muted-foreground">A temporary problem prevented this content from loading.</p><button type="button" onClick={() => { setRetrying(true); window.setTimeout(() => setRetrying(false), 800) }} className="mt-4 rounded-none border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">Try again</button></div>
}

export function PermissionState() {
  return <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><LockKeyhole className="size-8 text-muted-foreground" /><h3 className="unison-section-title mt-4 text-sm">Restricted workspace</h3><p className="mt-2 text-sm text-muted-foreground">Your current role does not include access to this area.</p></div>
}
