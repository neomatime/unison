'use client'

import Link from 'next/link'
import {
  Archive,
  ArrowLeft,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Link2,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { moduleFixtures } from '../mocks/modules'
import type { ModuleDefinition } from '../types'

type FixtureRecord = Record<string, string>

export function ModuleRecord({ module, recordId }: { module: ModuleDefinition; recordId: string }) {
  const record = (moduleFixtures[module.id]?.find((item) => item.id === recordId) ?? moduleFixtures[module.id]?.[0]) as FixtureRecord | undefined
  const [activeTab, setActiveTab] = useState(module.tabs[0])
  const [confirm, setConfirm] = useState(false)
  const [archived, setArchived] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  if (!record) return null

  const runAction = (message: string) => {
    setActionMessage(message)
    setMoreOpen(false)
  }

  return <>
    <WorkspaceHeader category={module.category} title={record.name} />
    <Link href={module.route} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to {module.label}</Link>

    <section className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><h2 className="text-2xl font-bold tracking-tight">{record.name}</h2><StatusBadge tone={archived ? 'neutral' : 'brand'}>{archived ? 'Archived' : record.status}</StatusBadge></div>
          <p className="mt-2 text-sm text-muted-foreground">Owned by {record.owner} · Last activity {record.updated}</p>
          {actionMessage ? <p role="status" className="mt-2 text-xs font-medium text-brand">{actionMessage}</p> : null}
        </div>
        <div className="relative flex flex-wrap gap-2">
          <Link href={`${module.route}/${record.id}/edit`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium"><Pencil className="size-4" />Edit</Link>
          <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-destructive"><Archive className="size-4" />{module.archiveLabel ?? 'Archive'}</button>
          <button type="button" onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen} aria-label="More actions" className="rounded-lg border border-border p-2"><MoreHorizontal className="size-4" /></button>
          {moreOpen ? <div className="absolute top-full right-0 z-30 mt-2 w-48 rounded-xl border border-border bg-card p-2 text-sm shadow-xl">
            <button type="button" onClick={() => runAction('A duplicate draft was created.')} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-muted">Duplicate record</button>
            <button type="button" onClick={() => runAction('A secure preview link was copied.')} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-muted">Share preview</button>
            <button type="button" onClick={() => runAction('Summary export is ready.')} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-muted">Download summary</button>
          </div> : null}
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary icon={CheckCircle2} label="Status" value={record.status} />
        <Summary icon={Users} label="Owner" value={record.owner} />
        <Summary icon={CalendarDays} label="Next milestone" value={record.due ?? record.updated} />
        <Summary icon={CircleDollarSign} label="Commercial value" value={record.value ?? record.total ?? 'R284,500'} />
      </div>
    </section>

    <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-border" aria-label={`${module.singular} sections`}>
      {module.tabs.map((tab) => <button type="button" key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${activeTab === tab ? 'border-foreground' : 'border-transparent text-muted-foreground'}`}>{tab}</button>)}
    </nav>

    <div className="mt-5 grid gap-5 xl:grid-cols-3">
      <section className="rounded-xl border border-border bg-card p-6 xl:col-span-2"><RecordTabContent activeTab={activeTab} module={module} record={record} onAction={setActionMessage} /></section>
      <aside className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-semibold">Recent activity</h3>
        <ActivityList limit={4} owner={record.owner} />
        <button type="button" onClick={() => setActivityOpen(true)} className="mt-5 inline-flex items-center gap-2 text-sm font-medium"><FileText className="size-4" />View full activity</button>
      </aside>
    </div>

    <ConfirmationDialog open={confirm} title={`${module.archiveLabel ?? 'Archive'}?`} description={`This UI-only action will mark ${record.name} as archived until the page is refreshed.`} confirmLabel={module.archiveLabel ?? 'Archive'} onCancel={() => setConfirm(false)} onConfirm={() => { setArchived(true); setConfirm(false); setActionMessage(`${record.name} was archived.`) }} />
    {activityOpen ? <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close activity" onClick={() => setActivityOpen(false)} className="absolute inset-0 bg-foreground/20" />
      <aside className="absolute top-0 right-0 h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Activity history</h2><p className="text-sm text-muted-foreground">{record.name}</p></div><button type="button" onClick={() => setActivityOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm">Close</button></div>
        <ActivityList limit={8} owner={record.owner} />
      </aside>
    </div> : null}
  </>
}

function RecordTabContent({ activeTab, module, record, onAction }: { activeTab: string; module: ModuleDefinition; record: FixtureRecord; onAction: (message: string) => void }) {
  if (activeTab === 'Document' && (module.id === 'quotes' || module.id === 'invoices')) return <BusinessDocument module={module} record={record} onAction={onAction} />
  if (activeTab === 'Activity') return <><TabIntro tab={activeTab} singular={module.singular} /><ActivityList limit={6} owner={record.owner} /></>
  if (['Documents', 'Receipt', 'Equipment', 'Versions'].includes(activeTab)) return <FileCollection title={activeTab} onAction={onAction} />
  if (['Contacts', 'Team', 'Candidates', 'Attendees'].includes(activeTab)) return <PeopleCollection title={activeTab} onAction={onAction} />
  if (['Tasks', 'Subtasks', 'Checklist', 'Dependencies', 'Milestones', 'Deliverables'].includes(activeTab)) return <WorkCollection title={activeTab} />
  if (activeTab === 'Onboarding') return <ClientOnboardingTab record={record} />
  if (['Atlas'].includes(activeTab)) return <AtlasTab record={record} onAction={onAction} />
  if (['Approval', 'Approvals'].includes(activeTab)) return <ApprovalTab onAction={onAction} />
  if (['Related Records', 'Projects', 'Commercial', 'Financial', 'Payments', 'Meetings'].includes(activeTab)) return <RelatedCollection title={activeTab} />
  return <>
    <TabIntro tab={activeTab} singular={module.singular} />
    <div className="mt-6 grid gap-4 sm:grid-cols-2">{Object.entries(record).filter(([key]) => !['id', 'name'].includes(key)).slice(0, 8).map(([key, value]) => <div key={key} className="rounded-lg bg-muted/50 p-4"><p className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">{key.replace(/([A-Z])/g, ' $1')}</p><p className="mt-1 text-sm font-medium">{value}</p></div>)}</div>
  </>
}

function TabIntro({ tab, singular }: { tab: string; singular: string }) {
  return <><h3 className="font-semibold">{tab}</h3><p className="mt-1 text-sm text-muted-foreground">A focused view of {tab.toLowerCase()} information for this {singular.toLowerCase()}.</p></>
}

function FileCollection({ title, onAction }: { title: string; onAction: (message: string) => void }) {
  const files = ['Executive summary.pdf', 'Scope and requirements.docx', 'Commercial schedule.xlsx']
  return <><div className="flex items-center justify-between"><TabIntro tab={title} singular="record" /><button type="button" onClick={() => onAction('File upload drawer opened.')} className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-primary-foreground">Upload file</button></div><div className="mt-6 divide-y divide-border rounded-xl border border-border">{files.map((file, index) => <button type="button" key={file} onClick={() => onAction(`${file} preview opened.`)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40"><Paperclip className="size-4 text-muted-foreground" /><span><span className="block text-sm font-medium">{file}</span><span className="text-xs text-muted-foreground">{index + 1}.{index + 2} MB · Updated this week</span></span><span className="ml-auto text-xs text-muted-foreground">Preview</span></button>)}</div></>
}

function PeopleCollection({ title, onAction }: { title: string; onAction: (message: string) => void }) {
  return <><div className="flex items-center justify-between"><TabIntro tab={title} singular="record" /><button type="button" onClick={() => onAction(`Add ${title.toLowerCase()} drawer opened.`)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Add</button></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{[['Neo Morake','Executive owner'],['Amara Dlamini','Delivery lead'],['Lethabo Nkosi','Product lead'],['Zanele Khumalo','Finance partner']].map(([name, role]) => <article key={name} className="flex items-center gap-3 rounded-xl border border-border p-4"><span className="flex size-9 items-center justify-center rounded-full bg-foreground text-xs font-bold text-primary-foreground">{name.split(' ').map((part) => part[0]).join('')}</span><span><span className="block text-sm font-semibold">{name}</span><span className="text-xs text-muted-foreground">{role}</span></span></article>)}</div></>
}

function WorkCollection({ title }: { title: string }) {
  const [done, setDone] = useState<boolean[]>([true, false, false])
  return <><TabIntro tab={title} singular="record" /><div className="mt-6 divide-y divide-border rounded-xl border border-border">{['Confirm owner and scope', 'Review stakeholder feedback', 'Complete quality assurance'].map((task, index) => <label key={task} className="flex cursor-pointer items-center gap-3 p-4"><input type="checkbox" checked={done[index]} onChange={() => setDone((current) => current.map((value, taskIndex) => taskIndex === index ? !value : value))} className="size-4" /><span className={done[index] ? 'text-sm text-muted-foreground line-through' : 'text-sm font-medium'}>{task}</span><span className="ml-auto text-xs text-muted-foreground">{index + 1} day{index ? 's' : ''}</span></label>)}</div></>
}

function AtlasTab({ record, onAction }: { record: FixtureRecord; onAction: (message: string) => void }) {
  return <><div className="flex items-center gap-2"><Bot className="size-5 text-brand" /><h3 className="font-semibold">Atlas intelligence</h3></div><p className="mt-2 text-sm text-muted-foreground">Contextual observations generated from the current mock record.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{['Delivery confidence is improving', 'One executive decision is overdue', 'Commercial follow-up recommended', 'Stakeholder engagement is healthy'].map((insight, index) => <article key={insight} className="rounded-xl border border-border p-4"><span className="text-xs font-semibold text-brand">{88 - index * 3}% confidence</span><p className="mt-2 text-sm font-medium">{insight}</p><button type="button" onClick={() => onAction(`Atlas insight reviewed for ${record.name}.`)} className="mt-4 text-xs font-semibold">Review insight</button></article>)}</div></>
}

function ApprovalTab({ onAction }: { onAction: (message: string) => void }) {
  return <><TabIntro tab="Approval" singular="record" /><article className="mt-6 rounded-xl border border-border p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">Executive approval</p><p className="mt-1 text-sm text-muted-foreground">Requested from Neo Morake · Due today</p></div><StatusBadge tone="warning">Pending</StatusBadge></div><div className="mt-5 flex gap-2"><button type="button" onClick={() => onAction('Approval completed successfully.')} className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-primary-foreground">Approve</button><button type="button" onClick={() => onAction('Changes were requested from the owner.')} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Request changes</button></div></article></>
}

function RelatedCollection({ title }: { title: string }) {
  return <><TabIntro tab={title} singular="record" /><div className="mt-6 grid gap-3 sm:grid-cols-2">{['Meridian Advisory', 'Northstar Transformation', 'INV-1327', 'Executive Review'].map((item, index) => <article key={item} className="flex items-center gap-3 rounded-xl border border-border p-4"><span className="flex size-9 items-center justify-center rounded-lg bg-muted">{index % 2 ? <ListChecks className="size-4" /> : <Link2 className="size-4" />}</span><span><span className="block text-sm font-semibold">{item}</span><span className="text-xs text-muted-foreground">Related {index % 2 ? 'workflow' : 'record'}</span></span></article>)}</div></>
}

function ClientOnboardingTab({ record }: { record: FixtureRecord }) {
  const milestones = ['Contract Signed', 'Internal Handover', 'Discovery', 'Information Collection', 'Access & Credentials', 'Brand & Asset Collection', 'Systems Configuration', 'Integrations', 'QA & Validation', 'Client Readiness', 'Go-Live']
  return <><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-semibold">Client onboarding</h3><p className="mt-1 text-sm text-muted-foreground">Track onboarding as part of the {record.name} client lifecycle.</p></div><StatusBadge tone="info">In progress</StatusBadge></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Progress</p><p className="mt-1 text-lg font-bold">18%</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Target go-live</p><p className="mt-1 text-sm font-semibold">30 Sep 2026</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Onboarding manager</p><p className="mt-1 text-sm font-semibold">Sarah Johnson</p></div></div><div className="mt-6 divide-y divide-border rounded-xl border border-border">{milestones.map((milestone, index) => <div key={milestone} className="flex items-center gap-3 p-4"><span className={`flex size-6 items-center justify-center rounded-full ${index < 2 ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground'}`}>{index < 2 ? <CheckCircle2 className="size-3.5" /> : <Clock3 className="size-3.5" />}</span><span className="text-sm font-medium">{milestone}</span><span className={`ml-auto text-xs font-semibold ${index < 2 ? 'text-brand' : 'text-muted-foreground'}`}>{index < 2 ? 'Complete' : 'Pending'}</span></div>)}</div></>
}

function ActivityList({ limit, owner }: { limit: number; owner: string }) {
  return <div className="mt-5 space-y-5">{Array.from({ length: limit }, (_, index) => <div key={index} className="flex gap-3"><span className="mt-1 flex size-7 items-center justify-center rounded-full bg-muted"><Clock3 className="size-3.5" /></span><div><p className="text-sm">{['Record reviewed', 'Owner updated', 'Document attached', 'Comment added'][index % 4]}</p><p className="mt-0.5 text-xs text-muted-foreground">{index % 2 ? owner : 'Neo Morake'} · {index + 1}h ago</p></div></div>)}</div>
}

function Summary({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="rounded-lg border border-border p-4"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="size-4" />{label}</div><p className="mt-2 text-sm font-semibold">{value}</p></div>
}

function BusinessDocument({ module, record, onAction }: { module: ModuleDefinition; record: FixtureRecord; onAction: (message: string) => void }) {
  const isInvoice = module.id === 'invoices'
  return <div>
    <div className="mb-4 flex justify-end gap-2"><button type="button" onClick={() => onAction('Document preview is ready to print.')} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Print preview</button><button type="button" onClick={() => onAction(`${isInvoice ? 'Invoice' : 'Quote'} was sent for review.`)} className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-primary-foreground">Send for review</button></div>
    <div className="mx-auto max-w-3xl rounded-lg border border-border p-8">
      <div className="flex justify-between gap-8"><div><p className="text-xl font-bold tracking-[0.18em]">UNISON</p><p className="mt-2 text-xs text-muted-foreground">HIMARK · Johannesburg, South Africa</p></div><div className="text-right"><h3 className="text-2xl font-bold">{isInvoice ? 'INVOICE' : 'QUOTE'}</h3><p className="mt-1 font-mono text-sm">{record.name}</p><p className="mt-1 text-xs text-muted-foreground">{isInvoice ? 'Due 24 Aug 2026' : 'Valid until 31 Aug 2026'}</p></div></div>
      <div className="mt-10 grid gap-6 border-y border-border py-5 sm:grid-cols-2"><div><p className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">Prepared for</p><p className="mt-2 font-semibold">{record.client ?? 'Meridian Advisory'}</p><p className="text-sm text-muted-foreground">Attention: Naledi Mokoena</p></div><div><p className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">Prepared by</p><p className="mt-2 font-semibold">{record.owner}</p><p className="text-sm text-muted-foreground">HIMARK</p></div></div>
      <table className="mt-8 w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-3">Service</th><th className="py-3 text-center">Qty</th><th className="py-3 text-right">Rate</th><th className="py-3 text-right">Amount</th></tr></thead><tbody>{[['Strategy and discovery','1','R84,500','R84,500'],['Design and implementation','1','R160,000','R160,000'],['Enablement and handover','1','R40,000','R40,000']].map((row) => <tr key={row[0]} className="border-b border-border">{row.map((cell,index) => <td key={cell} className={`py-4 ${index === 1 ? 'text-center' : index > 1 ? 'text-right' : ''}`}>{cell}</td>)}</tr>)}</tbody></table>
      <div className="ml-auto mt-6 max-w-xs space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>R284,500</span></div><div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>Included</span></div><div className="flex justify-between border-t border-border pt-3 text-lg font-bold"><span>Total</span><span>{record.total ?? 'R284,500'}</span></div></div>
      <p className="mt-10 text-xs leading-5 text-muted-foreground">Payment terms and commercial conditions are presented here for stakeholder review.</p>
    </div>
  </div>
}
