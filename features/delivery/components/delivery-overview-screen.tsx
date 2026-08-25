import { ArrowUpRight, CalendarClock, CircleAlert, Scale, ShieldAlert } from 'lucide-react'
import Link from 'next/link'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { deliveryMetrics, deliveryPhases, deliveryProjects, frameworks } from '../data'
import { HealthBadge, MetricGrid, PhaseStepper, RiskList, SectionCard } from './delivery-primitives'
import { ProjectTable } from './project-table'

export function DeliveryOverviewScreen() {
  return <>
    <WorkspaceHeader category="Delivery" title="Project Delivery Overview" description="Executive visibility across portfolio health, governance performance and delivery outcomes." />
    <MetricGrid items={deliveryMetrics} />

    <SectionCard title="Delivery lifecycle" description="Current project distribution across the governed delivery lifecycle." className="mt-5">
      <div className="p-5"><PhaseStepper phases={deliveryPhases} /></div>
    </SectionCard>

    <SectionCard title="Portfolio overview" description="Delivery position across the organization." action={<Link href="/delivery/portfolio" className="inline-flex items-center gap-1 text-xs font-semibold text-brand">View portfolio <ArrowUpRight className="size-3.5" /></Link>} className="mt-5">
      <ProjectTable limit={5} />
    </SectionCard>

    <div className="mt-5 grid gap-5 xl:grid-cols-3">
      <SectionCard title="Projects requiring attention" description="Highest-impact delivery exceptions." className="xl:col-span-2">
        <RiskList items={[
          { title: 'Vendor Integration Upgrade has four unresolved blockers', meta: 'Build phase · Integration Review due 22 Sep', severity: 'danger' },
          { title: 'WhatsApp Claims Automation is awaiting UAT approval', meta: 'Test phase · Gate decision due today', severity: 'danger' },
          { title: 'Customer Policy Validation has three vendor dependencies', meta: 'Design phase · Design Authority due 12 Sep', severity: 'warning' },
        ]} />
      </SectionCard>
      <SectionCard title="Upcoming governance gates" description="Next decisions due across delivery.">
        <CompactRows icon={CalendarClock} rows={[
          ['UAT Sign-off', 'Today · WhatsApp Claims Automation'],
          ['Design Authority', '28 Aug · Customer Policy Validation'],
          ['Go-live Readiness', '04 Sep · Digital Onboarding Rollout'],
          ['Build Review', '06 Sep · Claims Intake Modernisation'],
        ]} />
      </SectionCard>

      <SectionCard title="Vendor exposure" description="Dependencies with elevated delivery impact.">
        <CompactRows icon={ShieldAlert} rows={[
          ['Twilio', '4 projects · 7 open dependencies'],
          ['TIAL Integration Services', '3 projects · SLA at 84%'],
          ['Dimension Data', 'Compliance gap open'],
        ]} />
      </SectionCard>
      <SectionCard title="Open decisions" description="Decisions currently constraining progress.">
        <CompactRows icon={Scale} rows={[
          ['Approve revised UAT window', 'Owner: Neo Morake · Overdue'],
          ['Confirm data retention control', 'Owner: Zanele Khumalo · 26 Aug'],
          ['Select integration fallback', 'Owner: Lethabo Nkosi · 28 Aug'],
        ]} />
      </SectionCard>
      <SectionCard title="Benefits realisation" description="Tracked value against approved business cases.">
        <div className="grid grid-cols-3 gap-3 p-5 text-center"><MiniStat label="Realised" value="R8.4M" /><MiniStat label="Forecast" value="R13.2M" /><MiniStat label="At risk" value="R1.6M" danger /></div>
      </SectionCard>

      <SectionCard title="Delivery health by framework" description="Governance health across active methodologies." className="xl:col-span-2">
        <div className="divide-y divide-border">{frameworks.slice(0, 4).map((framework) => <div key={framework.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3.5"><div><p className="text-sm font-medium">{framework.name}</p><p className="text-xs text-muted-foreground">{framework.projects} active projects · {framework.version}</p></div><HealthBadge>{framework.health}</HealthBadge><span className="w-10 text-right text-sm font-bold">{91 - frameworks.indexOf(framework) * 4}%</span></div>)}</div>
      </SectionCard>
      <SectionCard title="Portfolio risks" description="Current risk concentration.">
        <RiskList items={[
          { title: 'Delayed gates', meta: '5 gates are beyond their decision date', severity: 'danger' },
          { title: 'Vendor dependencies', meta: '12 critical dependencies need owners', severity: 'warning' },
          { title: 'Governance exceptions', meta: '3 approved exceptions expire this month', severity: 'info' },
        ]} />
      </SectionCard>
    </div>
  </>
}

function CompactRows({ icon: Icon, rows }: { icon: typeof CircleAlert; rows: Array<[string, string]> }) {
  return <div className="divide-y divide-border">{rows.map(([title, meta]) => <div key={title} className="flex gap-3 px-5 py-3.5"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="size-4 text-muted-foreground" /></span><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{meta}</p></div></div>)}</div>
}

function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className="rounded-lg bg-muted/50 p-3"><p className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p><p className={`mt-2 text-lg font-bold ${danger ? 'text-danger' : ''}`}>{value}</p></div>
}
