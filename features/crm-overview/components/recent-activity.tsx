import { Building2, ClipboardList, FileText, Handshake, Receipt, Target, Trophy, UserPlus, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { describeActivity, type ActivityIcon } from '../metrics'
import type { ActivityEvent, Section } from '../types'
import { RelativeTime } from './local-time'
import { EmptyState, ErrorState, Panel } from './panel'

const icons: Record<ActivityIcon, LucideIcon> = {
  lead: Target,
  client: UserPlus,
  quote: FileText,
  won: Trophy,
  invoice: Receipt,
  vendor: Building2,
  onboarding: ClipboardList,
  opportunity: Handshake,
}

export function RecentActivity({ activity }: { activity: Section<ActivityEvent[]> }) {
  let body: ReactNode
  if (activity.status !== 'ready') {
    body = <ErrorState what="Recent activity" />
  } else {
    // A kind this dashboard cannot word is skipped, not rendered half-built.
    const items = activity.data.flatMap((event) => {
      const described = describeActivity(event)
      return described ? [{ event, described }] : []
    })
    body = items.length === 0 ? (
      <EmptyState>No recent activity yet. New leads, clients, quotes and wins will appear here as they are recorded.</EmptyState>
    ) : (
      <ul className="divide-y divide-border">
        {items.map(({ event, described }) => {
          const Icon = icons[described.icon]
          return (
            <li key={`${event.kind}:${event.recordId}`}>
              <Link href={described.href} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-brand">
                <span aria-hidden="true" className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-brand">
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{described.label}</span>
                  <span className="block truncate text-xs text-[var(--briefing-muted)]">{described.text}</span>
                </span>
                <span className="shrink-0 pt-0.5 text-xs text-[var(--briefing-muted)]"><RelativeTime iso={event.occurredAt} /></span>
              </Link>
            </li>
          )
        })}
      </ul>
    )
  }
  return (
    <Panel title="Recent activity" description="Latest updates across clients, leads, quotes and sales.">
      {body}
    </Panel>
  )
}
