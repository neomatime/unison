import type React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type ContentPanelProps = {
  title: string
  /** Optional right-aligned action, e.g. a "View all" link or a badge */
  action?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

/**
 * The base surface for every dashboard panel: white card, hairline border,
 * subtle shadow and a header row with a title and optional action.
 */
export function ContentPanel({
  title,
  action,
  className,
  bodyClassName,
  children,
}: ContentPanelProps) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(16_32_46_/_0.04)]',
        className,
      )}
    >
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-base font-semibold tracking-tight text-card-foreground">
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
      className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
    </Link>
  )
}
