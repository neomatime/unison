'use client'

import { useShellContext } from '@/components/layout/shell-context'

type DeliveryBriefingHeaderProps = {
  dateTime: string
  dateLabel: string
}

// Lookup, alerts and the signed-in user live once, in the sidebar, so this header
// carries only the greeting, the title and the date.
export function DeliveryBriefingHeader({ dateTime, dateLabel }: DeliveryBriefingHeaderProps) {
  const { user } = useShellContext()
  const firstName = user.displayName.trim().split(/\s+/)[0] || 'there'
  // Was hard-coded to "Good afternoon", which told a 7am reader it was the
  // afternoon — the one line on a page whose whole design argument is that
  // everything on it is derived from data.
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <header className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--briefing-muted)]">{greeting}, {firstName}.</p>
        <h1 className="mt-2 text-[1.625rem] leading-tight font-bold tracking-[-0.035em] text-foreground sm:text-[1.875rem]">
          Here&apos;s the delivery briefing.
        </h1>
        <p className="mt-1 text-sm leading-6 text-[var(--briefing-muted)] sm:text-[0.9375rem]">
          A clear view of what&apos;s happening, what matters, and what needs your attention.
        </p>
      </div>
      <time dateTime={dateTime} className="shrink-0 text-xs text-[var(--briefing-muted)]">{dateLabel}</time>
    </header>
  )
}
