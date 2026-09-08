'use client'

import { AlertTriangle, Archive, BookOpen, Building2, Check, ChevronRight, CircleHelp, CreditCard, Database, Plus, Search, ShieldAlert, TicketCheck, Users, X } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { RowActionMenu } from '@/components/shared/row-action-menu'
import { subscriptions as initialSubscriptions, tenants as initialTenants } from '../data'
import type { OrganisationRow } from '../queries/list-organizations'
import { InternalEmptyState, InternalMetric, InternalPageHeader, ProvisioningStatusBadge } from './internal-primitives'

type DrawerState = { title: string; subtitle: string; fields: Array<[string, string]> } | null

export function OrganisationsScreen({ records }: { records: OrganisationRow[] }) {
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const counts = useMemo(() => ({
    total: records.length,
    active: records.filter((record) => record.status === 'active').length,
    suspended: records.filter((record) => record.status === 'suspended').length,
    archived: records.filter((record) => record.status === 'archived').length,
  }), [records])
  const open = (record: OrganisationRow) => setDrawer({ title: record.name, subtitle: 'Organisation internal metadata', fields: [['Tier', record.tier], ['Status', record.status], ['Modules', record.modules], ['Primary Admin', record.admin], ['Implementation Owner', record.owner], ['Created', record.created], ['Last Activity', record.activity]] })
  const rows = records.map((record) => [
    <button type="button" onClick={() => open(record)} className="font-brand text-sm font-medium tracking-[0.035em] hover:text-brand" key="name">{record.name}</button>,
    record.tier, <ProvisioningStatusBadge status={record.status} key="status" />, record.modules, record.admin, record.owner, record.created, record.activity,
    <RowActionMenu key="actions" label={record.name} actions={[{ id: 'tenant', label: 'View Tenant', onSelect: () => open(record) }, { id: 'provisioning', label: 'View Provisioning', onSelect: () => window.location.assign(`/internal/provisioning/${record.id}-setup`) }, { id: 'subscription', label: 'Manage Subscription', onSelect: () => window.location.assign('/internal/subscriptions') }]} />,
  ])
  return <>
    <InternalPageHeader title="Organisations" description="Internal view of organisations configured for the UNISON platform." actions={<Link href="/internal/provisioning/new" className="inline-flex h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white hover:bg-foreground"><Plus className="size-4 stroke-[1.6]" />New Organisation</Link>} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><InternalMetric label="Organisations" value={String(counts.total)} detail="Every organisation on the platform" icon={Building2} /><InternalMetric label="Active" value={String(counts.active)} detail="Serving tenants" icon={Check} tone="success" /><InternalMetric label="Suspended" value={String(counts.suspended)} detail="Internal review required" icon={ShieldAlert} tone="warning" /><InternalMetric label="Archived" value={String(counts.archived)} detail="Retained, not serving" icon={Archive} /></div>
    <div className="mt-5"><InternalTable title="Organisation Register" searchPlaceholder="Search organisations..." columns={['Organisation', 'Tier', 'Status', 'Modules', 'Primary Admin', 'Implementation Owner', 'Created', 'Last Activity', 'Actions']} rows={rows} /></div>
    <InternalDrawer value={drawer} onClose={() => setDrawer(null)} />
  </>
}

export function TenantsScreen() {
  const [records, setRecords] = useState(initialTenants)
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [confirm, setConfirm] = useState<(typeof initialTenants)[number] | null>(null)
  const open = (record: (typeof initialTenants)[number]) => setDrawer({ title: record.tenant, subtitle: record.organisation, fields: [['Tier', record.tier], ['Enabled Modules', record.modules], ['Users', record.users], ['Status', record.status], ['Environment', record.environment], ['Created', record.created], ['Last Activity', record.activity]] })
  const rows = records.map((record) => [
    <button type="button" onClick={() => open(record)} className="font-brand text-sm font-medium tracking-[0.035em] hover:text-brand" key="tenant">{record.tenant}</button>,
    record.organisation, record.tier, record.modules, record.users, <ProvisioningStatusBadge status={record.status} key="status" />, record.environment, record.created, record.activity,
    <RowActionMenu key="actions" label={record.tenant} actions={[{ id: 'view', label: 'View Tenant', onSelect: () => open(record) }, { id: 'open', label: 'Open Workspace', onSelect: () => window.location.assign('/overview') }, { id: 'tier', label: 'Change Tier', onSelect: () => window.location.assign(`/internal/tenants/${record.id}/tier`) }, { id: 'subscription', label: 'Manage Subscription', onSelect: () => window.location.assign('/internal/subscriptions') }, { id: 'suspend', label: 'Suspend', tone: 'danger', onSelect: () => setConfirm(record) }]} />,
  ])
  return <>
    <InternalPageHeader title="Tenants" description="Operational view of provisioned UNISON tenant environments." />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><InternalMetric label="Production Tenants" value="9" detail="Eight currently active" icon={Database} /><InternalMetric label="Active Users" value="286" detail="Across provisioned tenants" icon={Users} tone="success" /><InternalMetric label="Provisioning" value="1" detail="Growthpoint Properties" icon={Building2} /><InternalMetric label="Suspended" value="1" detail="Internal action required" icon={ShieldAlert} tone="warning" /></div>
    <div className="mt-5"><InternalTable title="Tenant Register" searchPlaceholder="Search tenants..." columns={['Tenant', 'Organisation', 'Tier', 'Enabled Modules', 'Users', 'Status', 'Environment', 'Created', 'Last Activity', 'Actions']} rows={rows} /></div>
    <InternalDrawer value={drawer} onClose={() => setDrawer(null)} />
    <ConfirmationDialog open={Boolean(confirm)} title="Suspend tenant?" description={`${confirm?.tenant ?? 'This tenant'} will be hidden from active internal views. No module or tenant records are deleted.`} confirmLabel="Suspend Tenant" onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm) setRecords((current) => current.map((record) => record.id === confirm.id ? { ...record, status: 'Suspended' } : record)); setConfirm(null) }} />
  </>
}

export function SubscriptionsScreen() {
  const [records, setRecords] = useState(initialSubscriptions)
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [confirm, setConfirm] = useState<{ record: (typeof initialSubscriptions)[number]; action: 'Pause' | 'Cancel' } | null>(null)
  const open = (record: (typeof initialSubscriptions)[number]) => setDrawer({ title: record.organisation, subtitle: 'UNISON subscription', fields: [['UNISON Tier', record.tier], ['Status', record.status], ['Start Date', record.start], ['Renewal Date', record.renewal], ['Billing Cycle', record.cycle], ['Seats', record.seats]] })
  const rows = records.map((record) => [
    <button type="button" onClick={() => open(record)} className="font-brand text-sm font-medium tracking-[0.035em] hover:text-brand" key="organisation">{record.organisation}</button>,
    record.tier, <ProvisioningStatusBadge status={record.status} key="status" />, record.start, record.renewal, record.cycle, record.seats,
    <RowActionMenu key="actions" label={record.organisation} actions={[{ id: 'view', label: 'View', onSelect: () => open(record) }, { id: 'tier', label: 'Change Tier', onSelect: () => window.location.assign(`/internal/subscriptions/${record.id}/tier`) }, { id: 'edit', label: 'Update Subscription', onSelect: () => window.location.assign(`/internal/subscriptions/${record.id}/edit`) }, { id: 'pause', label: 'Pause', onSelect: () => setConfirm({ record, action: 'Pause' }) }, { id: 'cancel', label: 'Cancel', tone: 'danger', onSelect: () => setConfirm({ record, action: 'Cancel' }) }]} />,
  ])
  return <>
    <InternalPageHeader title="Subscriptions" description="Internal tier, renewal and seat configuration. No payment processing is performed here." />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><InternalMetric label="Active Subscriptions" value="8" detail="Across production tenants" icon={CreditCard} tone="success" /><InternalMetric label="Pending" value="2" detail="Awaiting provisioning" icon={Database} /><InternalMetric label="Renewals Due" value="3" detail="Within 90 days" icon={AlertTriangle} tone="warning" /><InternalMetric label="Seats" value="325" detail="Configured capacity" icon={Users} /></div>
    <div className="mt-5"><InternalTable title="Subscription Register" searchPlaceholder="Search subscriptions..." columns={['Organisation', 'UNISON Tier', 'Status', 'Start Date', 'Renewal Date', 'Billing Cycle', 'Seats', 'Actions']} rows={rows} /></div>
    <InternalDrawer value={drawer} onClose={() => setDrawer(null)} />
    <ConfirmationDialog open={Boolean(confirm)} title={`${confirm?.action ?? 'Update'} subscription?`} description={`${confirm?.record.organisation ?? 'This subscription'} will be marked ${confirm?.action.toLowerCase() ?? 'updated'}. No tenant records are removed.`} confirmLabel={`${confirm?.action ?? 'Confirm'} Subscription`} onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm) setRecords((current) => current.map((record) => record.id === confirm.record.id ? { ...record, status: confirm.action === 'Pause' ? 'Paused' : 'Cancelled' } : record)); setConfirm(null) }} />
  </>
}

export function SupportScreen() {
  const [selected, setSelected] = useState<string[] | null>(null)
  const tickets = [['SUP-1048', 'Growthpoint provisioning access review', 'Growthpoint Properties', 'High', 'Open', '12m ago'], ['SUP-1047', 'Northstar user invitation delayed', 'Northstar Advisory', 'Medium', 'In Progress', '1h ago'], ['SUP-1042', 'Meridian renewal configuration', 'Meridian Group', 'Low', 'Resolved', 'Yesterday']]
  const detail: DrawerState = selected ? { title: selected[0], subtitle: selected[1], fields: [['Organisation', selected[2]], ['Priority', selected[3]], ['Status', selected[4]], ['Last Updated', selected[5]], ['Owner', 'HIMARK Support'], ['Resolution', 'Internal review in progress']] } : null
  const rows = tickets.map((row) => [row[0], row[1], row[2], row[3], <ProvisioningStatusBadge status={row[4]} key="status" />, row[5], <button type="button" onClick={() => setSelected(row)} key="view" className="text-xs font-medium text-brand hover:text-foreground">View</button>])
  return <>
    <InternalPageHeader title="Support Tickets" description="Internal support visibility across tenant provisioning and operations." actions={<Link href="/internal/support/new" className="inline-flex h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white hover:bg-foreground"><Plus className="size-4 stroke-[1.6]" />New Ticket</Link>} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><InternalMetric label="Open Tickets" value="14" detail="Three high priority" icon={TicketCheck} /><InternalMetric label="In Progress" value="7" detail="Assigned internally" icon={CircleHelp} /><InternalMetric label="Resolved This Week" value="23" detail="92% within SLA" icon={Check} tone="success" /><InternalMetric label="SLA Risk" value="2" detail="Attention required" icon={AlertTriangle} tone="danger" /></div>
    <div className="mt-5"><InternalTable title="Support Register" searchPlaceholder="Search support tickets..." columns={['Ticket', 'Subject', 'Organisation', 'Priority', 'Status', 'Updated', 'Actions']} rows={rows} /></div>
    <InternalDrawer value={detail} onClose={() => setSelected(null)} />
  </>
}

export function KnowledgeScreen() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ title: string; category: string; detail: string } | null>(null)
  const articles = [{ title: 'Client provisioning operating guide', category: 'Provisioning', detail: 'Six-stage setup, validation and handover.' }, { title: 'UNISON tier entitlement reference', category: 'Product', detail: 'Core, Framework, Enterprise and Strategic Enterprise.' }, { title: 'Tenant access and administration', category: 'Security', detail: 'Primary admins, initial users, SSO and MFA.' }, { title: 'Provisioning failure recovery', category: 'Operations', detail: 'Safe retry and escalation guidance.' }, { title: 'Subscription change procedure', category: 'Commercial', detail: 'Tier change impact and renewal controls.' }, { title: 'Tenant support handbook', category: 'Support', detail: 'Triage, ownership and SLA practices.' }]
  const visible = articles.filter((article) => Object.values(article).join(' ').toLowerCase().includes(query.toLowerCase()))
  const detail: DrawerState = selected ? { title: selected.title, subtitle: `${selected.category} guidance`, fields: [['Summary', selected.detail], ['Audience', 'HIMARK internal administrators'], ['Status', 'Published'], ['Last Reviewed', '20 August 2026'], ['Owner', 'Platform Operations']] } : null
  return <>
    <InternalPageHeader title="Knowledge Base" description="Internal guidance for provisioning, tenant operations and support." actions={<Link href="/internal/knowledge/new" className="inline-flex h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white hover:bg-foreground"><Plus className="size-4 stroke-[1.6]" />New Article</Link>} />
    <label className="relative block max-w-xl"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search internal knowledge..." className="h-10 w-full border border-border bg-card pr-3 pl-10 text-sm outline-none focus:border-brand" /></label>
    {visible.length ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((article) => <button type="button" onClick={() => setSelected(article)} key={article.title} className="border border-border bg-card p-5 text-left hover:border-brand/35 hover:bg-muted/20"><span className="flex size-8 items-center justify-center border border-brand/15 bg-brand-soft text-brand"><BookOpen className="size-3.5 stroke-[1.6]" /></span><p className="mt-4 text-[0.625rem] font-medium tracking-[0.1em] text-brand uppercase">{article.category}</p><h2 className="mt-2 font-brand text-sm font-medium tracking-[0.035em]">{article.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{article.detail}</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-medium">Read article<ChevronRight className="size-3" /></span></button>)}</div> : <InternalEmptyState title="No matching articles" description="Try a different internal knowledge search." />}
    <InternalDrawer value={detail} onClose={() => setSelected(null)} />
  </>
}

function InternalTable({ title, searchPlaceholder, columns, rows }: { title: string; searchPlaceholder: string; columns: string[]; rows: React.ReactNode[][] }) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => rows.filter((row) => row.map((cell) => typeof cell === 'string' ? cell : '').join(' ').toLowerCase().includes(query.toLowerCase())), [query, rows])
  return <section className="overflow-hidden border border-border bg-card"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><h2 className="font-brand text-sm font-medium tracking-[0.08em] uppercase">{title}</h2><label className="relative"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} className="h-10 w-64 border border-border bg-background pr-3 pl-9 text-sm outline-none focus:border-brand" /></label></header>{visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left"><thead><tr className="bg-muted/35 text-[0.625rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">{columns.map((column) => <th key={column} className="px-4 py-3">{column}</th>)}</tr></thead><tbody>{visible.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-border hover:bg-muted/35">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-4 text-xs text-muted-foreground">{cell}</td>)}</tr>)}</tbody></table></div> : <InternalEmptyState title="No matching records" description="Change the search to see more internal records." />}</section>
}

function InternalDrawer({ value, onClose }: { value: DrawerState; onClose: () => void }) {
  if (!value) return null
  return <div className="fixed inset-0 z-[90]" onMouseDown={onClose}><div className="absolute inset-0 bg-foreground/25" /><aside role="dialog" aria-modal="true" aria-labelledby="internal-detail-title" onMouseDown={(event) => event.stopPropagation()} className="absolute top-0 right-0 h-full w-full max-w-lg border-l border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-[0.625rem] font-medium tracking-[0.14em] text-brand uppercase">HIMARK Internal</p><h2 id="internal-detail-title" className="mt-2 font-brand text-lg font-medium tracking-[0.06em] uppercase">{value.title}</h2><p className="mt-1 text-sm text-muted-foreground">{value.subtitle}</p></div><button type="button" onClick={onClose} aria-label="Close detail" className="p-2 hover:bg-muted"><X className="size-4" /></button></div><dl className="mt-8 space-y-5">{value.fields.map(([label, fieldValue]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium text-foreground">{fieldValue}</dd></div>)}</dl><div className="mt-8 flex justify-end"><button type="button" onClick={onClose} className="h-10 border border-border px-4 text-sm font-medium hover:bg-muted">Close</button></div></aside></div>
}
