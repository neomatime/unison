import Link from 'next/link'

import { StatusBadge } from '@/components/ui/status-badge'
import type { RelationshipOverviewData, Section } from '../types'
import { EmptyState, ErrorState, Panel } from './panel'

function tone(indicator: string): 'brand' | 'warning' | 'info' | 'neutral' {
  if (indicator === 'Strong') return 'brand'
  if (indicator === 'Needs Attention') return 'warning'
  if (indicator === 'Stable') return 'info'
  return 'neutral'
}

export function MyClients({ relationships }: { relationships: Section<RelationshipOverviewData> }) {
  if (relationships.status === 'error') return <Panel title="My clients" description="Clients assigned to you."><ErrorState what="Your client relationships" /></Panel>
  if (relationships.status === 'unavailable') return <Panel title="My clients" description="Clients assigned to you."><EmptyState>Clients are not available in your plan.</EmptyState></Panel>
  const data = relationships.data
  return <Panel title="My clients" description="Your assigned relationships and their explainable current state." action={<Link href="/operations/clients" className="text-xs font-semibold text-brand hover:underline">View all clients →</Link>}>
    <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
      {[['Assigned', data.assigned], ['Active', data.active], ['Follow-ups', data.upcomingFollowUps], ['Need attention', data.requiringAttention]].map(([label, value], index) => <div key={String(label)} className={`px-4 py-3 ${index ? 'border-l border-border' : ''}`}><p className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>)}
    </div>
    {data.clients.length ? <ul className="divide-y divide-border">{data.clients.map((client) => <li key={client.id}><Link href={`/operations/clients/${client.id}`} className="flex items-start justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted/40"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{client.name}</span><span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">{client.reason}</span></span><StatusBadge tone={tone(client.indicator)}>{client.indicator}</StatusBadge></Link></li>)}</ul> : <EmptyState>No clients are currently assigned to you. Assign an account owner from a client record to personalise this view.</EmptyState>}
  </Panel>
}
