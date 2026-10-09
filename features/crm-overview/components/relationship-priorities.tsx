import Link from 'next/link'

import { dismissClientRecommendationAction } from '@/features/clients/actions/client-relationships'
import type { RelationshipOverviewData, Section } from '../types'
import { EmptyState, ErrorState, Panel } from './panel'

const date = (value: string) => new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00Z`))

export function RelationshipPriorities({ relationships }: { relationships: Section<RelationshipOverviewData> }) {
  if (relationships.status === 'error') return <Panel title="Your relationship priorities" description="Meaningful actions derived from your assigned client records."><ErrorState what="Relationship priorities" /></Panel>
  if (relationships.status === 'unavailable') return <Panel title="Your relationship priorities" description="Meaningful actions derived from your assigned client records."><EmptyState>Relationship priorities are unavailable.</EmptyState></Panel>
  const data = relationships.data
  return <Panel title="Your relationship priorities" description="Every item shows the recorded fact that caused it to be flagged.">
    {data.priorities.length ? <ul className="divide-y divide-border">{data.priorities.map((item) => <li key={item.key} className="px-5 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-brand">{item.clientName} · {item.category}</p><p className="mt-1 text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.reason}</p></div><div className="flex items-center gap-3"><Link href={item.href} className="text-xs font-semibold text-brand hover:underline">{item.actionLabel}</Link><form action={dismissClientRecommendationAction.bind(null, item.clientId, item.key)}><button className="text-xs text-muted-foreground hover:text-foreground">Dismiss</button></form></div></div></li>)}</ul> : <EmptyState>No assigned client records currently require attention.</EmptyState>}
    {data.milestones.length ? <div className="border-t border-border px-5 py-4"><p className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">Upcoming milestones</p><div className="mt-3 flex gap-3 overflow-x-auto pb-1">{data.milestones.map((milestone) => <Link key={milestone.id} href={`/operations/clients/${milestone.clientId}`} className="min-w-52 border border-border p-3 transition-colors hover:border-brand/40"><p className="truncate text-sm font-semibold">{milestone.name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{milestone.clientName} · {milestone.type}</p><p className="mt-2 text-xs font-medium text-brand">{date(milestone.date)}</p></Link>)}</div></div> : null}
  </Panel>
}
