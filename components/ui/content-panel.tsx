import type React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type ContentPanelProps = {
  title: string
  /** Optional right-aligned action, e.g. a "View all" link or a badge */
  action?: React.ReactNode
  className?: string
  bodyClassName?: string
  /** Opt in only when the whole surface takes the user somewhere or exposes a primary action. */
  interactive?: boolean
  children: React.ReactNode
}

/**
 * The base surface for every dashboard panel: flat white surface, hairline
 * border and a header row with a title and optional action.
 */
export function ContentPanel({
  title,
  action,
  className,
  bodyClassName,
  interactive = false,
  children,
}: ContentPanelProps) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-none border border-border bg-card',
        interactive && 'unison-interactive-card',
        className,
      )}
    >
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="unison-section-title text-sm text-card-foreground">
          {title}
        </h2>
        {action}
      </header>
      <div className={cn('px-5 pb-5', bodyClassName)}>{children}</div>
    </section>
  )
}

/** A quiet "View all" style text link used in panel headers. */
export function ViewAllLink({ label = 'View all', href = '/overview' }: { label?: string; href?: string }) {
  return (
    <Link
      href={href}
      className="unison-action-control group inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
    >
      {label}<ArrowRight className="size-3.5 transition-transform duration-[var(--motion-micro)] group-hover:translate-x-0.5" />
    </Link>
  )
}
