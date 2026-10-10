import type { ReactNode } from 'react'

/** The card each workspace section sits in. Square-cornered, as the rest of UNISON is. */
export function WorkspaceSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-none border border-border bg-card">
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
