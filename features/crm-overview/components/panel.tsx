import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { RefreshButton } from './refresh-button'

/** The card every dashboard panel sits in. Square-cornered, as the rest of UNISON is. */
export function Panel({ title, description, action, children, className }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('overflow-hidden rounded-none border border-border bg-card', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="unison-section-title text-xs text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-xs text-[var(--briefing-muted)]">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

/** A confirmed empty result: the query worked and found nothing. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-sm text-[var(--briefing-muted)]">{children}</p>
}

/** The query failed. Says so, and offers a retry; it never substitutes a zero. */
export function ErrorState({ what }: { what: string }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-5 py-6">
      <p className="text-sm text-foreground">{what} could not be loaded.</p>
      <RefreshButton />
    </div>
  )
}

/** The tenant's plan does not include the module behind this panel. */
export function UnavailableState({ module }: { module: string }) {
  return <p className="px-5 py-8 text-sm text-[var(--briefing-muted)]">{module} is not included in your plan, so there is nothing to show here.</p>
}
