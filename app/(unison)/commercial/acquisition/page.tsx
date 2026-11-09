import Link from 'next/link'
import { ArrowRight, ExternalLink, Plus, QrCode, Settings2 } from 'lucide-react'

import { WorkPage } from '@/components/shared/work-page'
import { ACQUISITION_CHANNELS, labelForIndustry, labelForService } from '@/features/prospect-engagement/catalog'
import { getAcquisitionAdminData } from '@/features/prospect-engagement/admin-data'

export default async function Page() {
  const data = await getAcquisitionAdminData()
  return (
    <WorkPage category="Commercial" title="Acquisition" description="Traceable prospect engagement links, genuine QR codes and source-to-opportunity reporting." parent={{ label: 'Overview', href: '/overview' }}>
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/engage" target="_blank" className="inline-flex items-center gap-2 border border-border bg-card px-4 py-2 text-sm font-medium">Preview public form<ExternalLink className="size-4" /></Link>
        <Link href="/commercial/acquisition/form" className="inline-flex items-center gap-2 border border-border bg-card px-4 py-2 text-sm font-medium"><Settings2 className="size-4" />Form versions</Link>
        {data.canManage ? <Link href="/commercial/acquisition/new" className="inline-flex items-center gap-2 bg-brand px-4 py-2 text-sm font-semibold text-white"><Plus className="size-4" />New engagement link</Link> : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Total enquiries" value={data.report.total.toLocaleString('en-ZA')} />
        <Metric label="Qualified leads" value={data.report.qualified.toLocaleString('en-ZA')} />
        <Metric label="Opportunities" value={data.report.opportunities.toLocaleString('en-ZA')} />
        <Metric label="Opportunity conversion" value={`${data.report.conversionRate}%`} />
        <Metric label="Attributed won revenue" value={new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(data.report.wonRevenue)} />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Breakdown title="Enquiries by channel" rows={data.report.byChannel.map((row) => ({ ...row, label: ACQUISITION_CHANNELS.find(([id]) => id === row.label)?.[1] ?? row.label }))} total={data.report.total} />
        <Breakdown title="Enquiries by industry" rows={data.report.byIndustry.map((row) => ({ ...row, label: labelForIndustry(row.label) }))} total={data.report.total} />
        <Breakdown title="Enquiries by service" rows={data.report.byService.map((row) => ({ ...row, label: labelForService(row.label) }))} total={data.report.total} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Breakdown title="Enquiries by event" rows={data.report.byEvent} total={data.report.total} />
        <Breakdown title="Enquiries by referring employee" rows={data.report.byEmployee} total={data.report.total} />
      </div>

      <section className="mt-5 border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border p-5"><div><h2 className="font-semibold">Engagement Links & QR Codes</h2><p className="mt-1 text-xs text-muted-foreground">Campaign, event and employee-specific acquisition sources.</p></div><QrCode className="size-5 text-brand" /></header>
        {data.links.length ? <div className="divide-y divide-border">{data.links.map((link) => <Link key={link.id} href={`/commercial/acquisition/${link.id}`} className="grid gap-3 p-5 transition-colors hover:bg-muted/20 md:grid-cols-[minmax(0,1fr)_10rem_7rem_7rem_2rem] md:items-center"><div><div className="flex items-center gap-2"><p className="font-semibold">{link.name}</p><span className={`px-2 py-0.5 text-[0.64rem] font-semibold uppercase ${link.active ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>{link.active ? 'Active' : 'Disabled'}</span></div><p className="mt-1 text-xs text-muted-foreground">{ACQUISITION_CHANNELS.find(([id]) => id === link.channel)?.[1] ?? link.channel}{link.eventName ? ` · ${link.eventName}` : ''}{link.assignedToName ? ` · ${link.assignedToName}` : ''}</p></div><span className="text-sm text-muted-foreground">{link.campaignName ?? 'No campaign'}</span><span className="text-sm tabular-nums"><strong>{link.visits}</strong> visits</span><span className="text-sm tabular-nums"><strong>{link.submissions}</strong> enquiries</span><ArrowRight className="size-4 text-muted-foreground" /></Link>)}</div> : <div className="p-10 text-center"><p className="font-semibold">No engagement links yet</p><p className="mt-2 text-sm text-muted-foreground">Create a source-specific link to generate the first attributable QR code.</p></div>}
      </section>
    </WorkPage>
  )
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p></div> }

function Breakdown({ title, rows, total }: { title: string; rows: Array<{ label: string; value: number }>; total: number }) {
  return <section className="border border-border bg-card p-5"><h2 className="font-semibold">{title}</h2><div className="mt-5 space-y-4">{rows.length ? rows.slice(0, 6).map((row) => <div key={row.label}><div className="flex items-center justify-between gap-3 text-xs"><span className="truncate text-muted-foreground">{row.label}</span><span className="font-semibold tabular-nums">{row.value}</span></div><div className="mt-1.5 h-1.5 bg-muted"><div className="h-full bg-brand" style={{ width: `${Math.max(4, total ? row.value / total * 100 : 0)}%` }} /></div></div>) : <p className="text-sm text-muted-foreground">No enquiry data yet.</p>}</div></section>
}

