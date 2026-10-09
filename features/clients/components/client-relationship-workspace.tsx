'use client'

import Link from 'next/link'
import { CalendarClock, CheckCircle2, FileText, MessageSquareText, Users } from 'lucide-react'
import { useState } from 'react'

import { StatusBadge } from '@/components/ui/status-badge'
import { completeClientMilestoneAction, dismissClientRecommendationAction } from '../actions/client-relationships'
import type { Client360, RelatedRecord } from '../queries/get-client-360'
import { ContactForm, FollowUpForm, InteractionForm, MilestoneForm } from './relationship-forms'

const tabs = ['Overview','Contacts','Timeline','Commercial','Documents','Notes & Follow-ups','Milestones'] as const
type Tab = (typeof tabs)[number]
const date = (value?: string | null) => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' }).format(new Date(value)) : 'Not recorded'
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not scheduled'
const money = (amount: number, currency: string) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
const totals = (records: RelatedRecord[]) => {
  const byCurrency = new Map<string, number>()
  for (const record of records) if (record.amount !== undefined && record.currency) byCurrency.set(record.currency, (byCurrency.get(record.currency) ?? 0) + record.amount)
  return [...byCurrency.entries()].map(([currency, amount]) => money(amount, currency)).join(' · ')
}

function indicatorTone(indicator: string): 'brand' | 'warning' | 'info' | 'neutral' {
  if (indicator === 'Strong') return 'brand'
  if (indicator === 'Needs Attention') return 'warning'
  if (indicator === 'Stable') return 'info'
  return 'neutral'
}

export function ClientRelationshipWorkspace({ clientId, data }: { clientId: string; data: Client360 }) {
  const [tab, setTab] = useState<Tab>('Overview')
  return <section className="mt-5 overflow-hidden border border-border bg-card">
    <nav className="flex gap-1 overflow-x-auto border-b border-border px-3" aria-label="Client relationship workspace">
      {tabs.map((item) => <button type="button" key={item} onClick={() => setTab(item)} aria-current={tab === item ? 'page' : undefined} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${tab === item ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{item}</button>)}
    </nav>
    <div className="p-5 lg:p-6">
      {tab === 'Overview' ? <Overview clientId={clientId} data={data} /> : null}
      {tab === 'Contacts' ? <Contacts clientId={clientId} data={data} /> : null}
      {tab === 'Timeline' ? <Timeline data={data} /> : null}
      {tab === 'Commercial' ? <Commercial data={data} /> : null}
      {tab === 'Documents' ? <Documents clientId={clientId} data={data} /> : null}
      {tab === 'Notes & Follow-ups' ? <Notes clientId={clientId} data={data} /> : null}
      {tab === 'Milestones' ? <Milestones clientId={clientId} data={data} /> : null}
    </div>
  </section>
}

function Heading({ title, description }: { title: string; description: string }) {
  return <div className="mb-5"><h3 className="text-lg font-semibold tracking-tight">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
}

function Overview({ clientId, data }: { clientId: string; data: Client360 }) {
  return <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric label="Account owner" value={data.ownerName ?? 'Unassigned'} /><Metric label="Primary contact" value={data.primaryContact?.fullName ?? 'Not recorded'} /><Metric label="Last interaction" value={date(data.lastInteractionAt)} /><Metric label="Next follow-up" value={data.nextFollowUp ? dateTime(data.nextFollowUp.occurredAt) : 'Not scheduled'} />
    </div>
    <div className="grid gap-5 lg:grid-cols-[1fr_1.25fr]">
      <section className="border border-border p-5"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold">Relationship insight</h4><StatusBadge tone={indicatorTone(data.relationship.indicator)}>{data.relationship.indicator}</StatusBadge></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{data.relationship.reason}</p></section>
      <section className="border border-border p-5"><h4 className="font-semibold">Next best actions</h4>{data.recommendations.length ? <ul className="mt-3 divide-y divide-border">{data.recommendations.map((item) => <li key={item.key} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.reason}</p></div><div className="flex gap-2"><Link href={item.href} className="text-xs font-semibold text-brand hover:underline">{item.actionLabel}</Link><form action={dismissClientRecommendationAction.bind(null, clientId, item.key)}><button className="text-xs text-muted-foreground hover:text-foreground">Dismiss</button></form></div></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No relationship actions require attention.</p>}</section>
    </div>
    <section className="border border-border p-5"><h4 className="font-semibold">Commercial summary</h4><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Linked leads" value={String(data.commercial.leads.length)} /><Metric label="Opportunities" value={String(data.commercial.opportunities.length)} /><Metric label="Quotes" value={String(data.commercial.quotes.length)} /><Metric label="Invoices" value={String(data.commercial.invoices.length)} /></div></section>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-border p-4"><p className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>
}

function Contacts({ clientId, data }: { clientId: string; data: Client360 }) {
  return <><Heading title="Contacts" description="People involved in this client relationship, using recorded communication preferences." />
    {data.contacts.length ? <div className="grid gap-3 md:grid-cols-2">{data.contacts.map((contact) => <article key={contact.id} className="border border-border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{contact.fullName}</p><p className="text-sm text-muted-foreground">{contact.jobTitle ?? contact.relationshipRole}</p></div>{contact.isPrimary ? <StatusBadge tone="brand">Primary</StatusBadge> : null}</div><dl className="mt-4 grid gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">Relationship role</dt><dd>{contact.relationshipRole}</dd></div><div><dt className="text-xs text-muted-foreground">Email</dt><dd>{contact.email ?? 'Not recorded'}</dd></div><div><dt className="text-xs text-muted-foreground">Phone</dt><dd>{contact.phone ?? 'Not recorded'}</dd></div><div><dt className="text-xs text-muted-foreground">Preferred communication</dt><dd>{contact.preferredCommunication ?? 'Not recorded'}</dd></div></dl></article>)}</div> : <Empty icon={<Users />} text="No dedicated client contacts have been added yet. The existing primary contact remains visible in the overview when present." />}
    <details className="mt-5 border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Add contact</summary><div className="mt-5"><ContactForm clientId={clientId} /></div></details>
  </>
}

function Timeline({ data }: { data: Client360 }) {
  return <><Heading title="Relationship timeline" description="A chronological history built only from recorded client, interaction, onboarding, commercial, invoice, and follow-up events." />
    {data.timeline.length ? <ol className="relative ml-2 border-l border-border">{data.timeline.map((event) => <li key={event.id} className="relative pb-6 pl-6 last:pb-0"><span className="absolute -left-1.5 top-1 size-3 rounded-full border-2 border-card bg-brand" /><p className="text-xs font-medium text-muted-foreground">{dateTime(event.occurredAt)} · {event.kind}</p>{event.href ? <Link href={event.href} className="mt-1 block text-sm font-semibold hover:text-brand hover:underline">{event.title}</Link> : <p className="mt-1 text-sm font-semibold">{event.title}</p>}{event.description ? <p className="mt-1 text-sm text-muted-foreground">{event.description}</p> : null}</li>)}</ol> : <Empty icon={<MessageSquareText />} text="No relationship activity has been recorded." />}
  </>
}

function Commercial({ data }: { data: Client360 }) {
  const groups: Array<[string, RelatedRecord[]]> = [['Leads', data.commercial.leads], ['Sales opportunities', data.commercial.opportunities], ['Quotes', data.commercial.quotes], ['Invoices', data.commercial.invoices]]
  return <><Heading title="Commercial relationship" description="Real leads, opportunities, quotes, and invoices linked through this client's identifier." /><div className="grid gap-5 xl:grid-cols-2">{groups.map(([label, records]) => <section key={label} className="border border-border"><header className="border-b border-border px-4 py-3"><h4 className="font-semibold">{label}</h4><p className="text-xs text-muted-foreground">{records.length} linked record{records.length === 1 ? '' : 's'}{totals(records) ? ` · ${totals(records)}` : ''}</p></header>{records.length ? <ul className="divide-y divide-border">{records.map((record) => <li key={record.id}><Link href={record.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"><span className="min-w-0"><span className="block truncate text-sm font-medium">{record.title}</span><span className="block text-xs text-muted-foreground">{record.subtitle ?? record.status}</span></span><span className="shrink-0 text-right"><StatusBadge tone="neutral">{record.status}</StatusBadge>{record.amount !== undefined && record.currency ? <span className="mt-1 block text-xs font-medium">{money(record.amount, record.currency)}</span> : null}</span></Link></li>)}</ul> : <p className="px-4 py-6 text-sm text-muted-foreground">No linked {label.toLowerCase()}.</p>}</section>)}</div></>
}

function Documents({ clientId, data }: { clientId: string; data: Client360 }) {
  const returnHref = `/operations/clients/${clientId}`
  return <><Heading title="Documents" description="Private client-related documents stored using UNISON's existing governed document service." /><div className="mb-4"><Link href={`/records/documents/upload?return=${encodeURIComponent(returnHref)}`} className="inline-flex bg-brand px-4 py-2 text-sm font-semibold text-white">Upload document</Link></div>{data.documents.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-3">Document</th><th>Classification</th><th>Access</th><th>Version</th><th>Uploaded</th></tr></thead><tbody>{data.documents.map((document) => <tr key={document.id} className="border-b border-border last:border-0"><td className="py-3 pr-4"><a href={`/api/documents/${document.id}/download`} className="text-sm font-semibold hover:text-brand hover:underline">{document.displayName}</a>{document.description ? <p className="text-xs text-muted-foreground">{document.description}</p> : null}</td><td className="text-sm">{document.classification}</td><td className="text-sm">{document.confidentiality}</td><td className="text-sm">v{document.version}</td><td className="text-sm text-muted-foreground">{date(document.createdAt)}</td></tr>)}</tbody></table></div> : <Empty icon={<FileText />} text="No documents are linked to this client." />}</>
}

function Notes({ clientId, data }: { clientId: string; data: Client360 }) {
  return <><Heading title="Notes and follow-ups" description="Record meaningful interactions and commitments. Confidential notes are restricted by database policy." /><div className="grid gap-5 xl:grid-cols-2"><section className="border border-border p-4"><h4 className="font-semibold">Recent interactions</h4>{data.interactions.length ? <ul className="mt-3 divide-y divide-border">{data.interactions.slice(0, 8).map((item) => <li key={item.id} className="py-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium">{item.type}</p><span className="text-xs text-muted-foreground">{dateTime(item.occurredAt)}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>{item.nextAction ? <p className="mt-2 text-xs"><span className="font-semibold">Next:</span> {item.nextAction}{item.nextActionDueAt ? ` · ${dateTime(item.nextActionDueAt)}` : ''}</p> : null}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No interactions recorded.</p>}<details className="mt-4 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-semibold text-brand">Record interaction or note</summary><div className="mt-4"><InteractionForm clientId={clientId} contacts={data.contacts} /></div></details></section><section className="border border-border p-4"><h4 className="font-semibold">Follow-up commitments</h4>{data.followUps.length ? <ul className="mt-3 divide-y divide-border">{data.followUps.slice(0, 8).map((task) => <li key={task.id} className="py-3"><Link href={task.href} className="text-sm font-medium hover:text-brand hover:underline">{task.title}</Link><p className="mt-1 text-xs text-muted-foreground">{task.status} · {task.occurredAt ? dateTime(task.occurredAt) : 'No due date'}</p></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No follow-ups recorded.</p>}<details className="mt-4 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-semibold text-brand">Create follow-up</summary><div className="mt-4"><FollowUpForm clientId={clientId} /></div></details></section></div></>
}

function Milestones({ clientId, data }: { clientId: string; data: Client360 }) {
  return <><Heading title="Client milestones" description="Professional anniversaries, reviews, renewals, and important events recorded by the account team." />{data.milestones.length ? <div className="grid gap-3 md:grid-cols-2">{data.milestones.map((milestone) => <article key={milestone.id} className="border border-border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{milestone.name}</p><p className="text-sm text-muted-foreground">{milestone.type}</p></div><StatusBadge tone={milestone.status === 'Complete' ? 'brand' : 'info'}>{milestone.status}</StatusBadge></div><p className="mt-3 text-sm">{date(milestone.date)}{milestone.recurringAnnually ? ' · Repeats annually' : ''}</p>{milestone.notes ? <p className="mt-2 text-sm text-muted-foreground">{milestone.notes}</p> : null}{milestone.status === 'Upcoming' ? <form action={completeClientMilestoneAction.bind(null, clientId, milestone.id)} className="mt-3"><button className="inline-flex items-center gap-1 text-xs font-semibold text-brand"><CheckCircle2 className="size-3.5" />Mark complete</button></form> : null}</article>)}</div> : <Empty icon={<CalendarClock />} text="No client milestones have been recorded." />}<details className="mt-5 border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Add milestone</summary><div className="mt-5"><MilestoneForm clientId={clientId} /></div></details></>
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex min-h-40 flex-col items-center justify-center border border-dashed border-border p-6 text-center text-muted-foreground"><span className="mb-3 [&_svg]:size-5">{icon}</span><p className="max-w-lg text-sm">{text}</p></div>
}
