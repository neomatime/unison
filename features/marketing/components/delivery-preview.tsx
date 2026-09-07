import { AlertCircle, ArrowRight, CalendarDays, CheckCircle2, Link2, Search } from 'lucide-react'

import { cn } from '@/lib/utils'

const navigation = ['Overview', 'Portfolio', 'Projects', 'Frameworks', 'Approvals', 'Vendors'] as const
const interventions = [
  { project: 'Digital Claims Platform', state: 'Critical', issue: 'UAT approval overdue', decision: '18 Apr 2025' },
  { project: 'Customer Data Migration', state: 'At Risk', issue: 'Vendor dependency unresolved', decision: '24 Apr 2025' },
] as const

export function DeliveryPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('relative overflow-hidden border border-[#aebbc9] bg-white shadow-[0_24px_55px_rgb(13_35_64_/_0.14)]', compact && 'shadow-[0_18px_42px_rgb(13_35_64_/_0.12)]')}>
      <div className="grid min-h-[29rem] grid-cols-[7.6rem_1fr] sm:grid-cols-[9rem_1fr]">
        <aside className="border-r border-[#dce3eb] bg-[#fbfcfe] px-3 py-4 text-[#274364]">
          <p className="px-2 text-[0.6rem] font-medium tracking-[0.22em] text-[#0d2340]">UNISON</p>
          <div className="mt-7 space-y-1 text-[0.52rem]">
            {navigation.map((item, index) => (
              <div key={item} className={cn('relative flex items-center gap-2 px-2 py-1.5', index === 0 && 'bg-[#edf3f8] text-[#0d2340] before:absolute before:inset-y-0 before:-left-3 before:w-0.5 before:bg-[#1769aa]')}>
                <span className="grid size-2 grid-cols-2 gap-px" aria-hidden="true"><span className="border border-current" /><span className="border border-current" /><span className="border border-current" /><span className="border border-current" /></span>
                {item}
              </div>
            ))}
          </div>
          <p className="mt-6 px-2 text-[0.42rem] font-medium tracking-[0.18em] text-[#71839a]">OPERATIONS</p>
          <div className="mt-2 space-y-1 px-2 text-[0.52rem] text-[#49617f]"><div className="py-1.5">Clients</div><div className="py-1.5">Onboarding</div></div>
          <p className="mt-6 px-2 text-[0.42rem] font-medium tracking-[0.18em] text-[#71839a]">COMMERCIAL</p>
          <div className="mt-2 space-y-1 px-2 text-[0.52rem] text-[#49617f]"><div className="py-1.5">Leads</div><div className="py-1.5">Quotes</div></div>
        </aside>

        <div className="min-w-0 bg-[#fafbfd] p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.5rem] text-[#657590]">Good afternoon, Neo.</p>
              <h2 className="mt-1 text-xs font-medium tracking-[0.08em] text-[#0d2340] uppercase sm:text-sm">Here’s the delivery briefing.</h2>
              <p className="mt-1 hidden text-[0.46rem] text-[#657590] sm:block">A clear view of what’s happening, what matters, and what needs your attention.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden h-7 w-32 items-center gap-1.5 border border-[#dce3eb] bg-white px-2 text-[0.42rem] text-[#71839a] sm:flex"><Search className="size-2.5" />Search</div>
              <div className="border border-[#dce3eb] bg-white px-2.5 py-1.5 text-[0.46rem] font-medium text-[#0d2340]">HIMARK</div>
            </div>
          </div>

          <section className="mt-4 grid border border-[#dce3eb] bg-white lg:grid-cols-[1.12fr_0.88fr]">
            <div className="border-b border-[#dce3eb] p-3 lg:border-r lg:border-b-0">
              <p className="text-[0.42rem] font-medium tracking-[0.16em] text-[#1769aa] uppercase">Overall position</p>
              <h3 className="mt-2 text-sm font-medium text-[#0d2340] sm:text-base">Delivery remains on track.</h3>
              <p className="mt-1 max-w-[22rem] text-[0.47rem] leading-3.5 text-[#657590]">Most projects are progressing as planned. Two require timely intervention.</p>
              <div className="mt-3 flex divide-x divide-[#dce3eb]">
                <BriefMetric value="15" label="Projects" />
                <BriefMetric value="12" label="On track" tone="success" />
                <BriefMetric value="2" label="At risk" tone="warning" />
                <BriefMetric value="1" label="Critical" tone="danger" />
              </div>
            </div>
            <div className="p-3">
              <p className="text-[0.42rem] font-medium tracking-[0.16em] text-[#55749a] uppercase">Key focus areas</p>
              <div className="mt-3 space-y-2.5">
                <FocusLine icon={AlertCircle} title="2 projects require intervention" tone="danger" />
                <FocusLine icon={CalendarDays} title="3 decisions due this week" />
                <FocusLine icon={Link2} title="1 critical dependency" />
              </div>
            </div>
          </section>

          <section className="mt-3 border border-[#dce3eb] bg-white">
            <div className="flex items-center justify-between border-b border-[#dce3eb] px-3 py-2">
              <p className="border-l-2 border-red-500 pl-2 text-[0.46rem] font-medium tracking-[0.14em] uppercase">Requires intervention</p>
              <span className="flex items-center gap-1 text-[0.42rem] text-[#1769aa]">View all <ArrowRight className="size-2.5" /></span>
            </div>
            <div className="divide-y divide-[#edf0f4]">
              {interventions.map((item) => (
                <div key={item.project} className="grid grid-cols-[1.2fr_0.48fr_1fr_0.55fr] items-center gap-2 px-3 py-2 text-[0.45rem]">
                  <p className="truncate font-medium text-[#0d2340]">{item.project}</p>
                  <span className={cn('flex items-center gap-1', item.state === 'Critical' ? 'text-red-700' : 'text-amber-700')}><span className={cn('size-1.5 rounded-full', item.state === 'Critical' ? 'bg-red-500' : 'bg-amber-500')} />{item.state}</span>
                  <p className="truncate text-[#657590]">{item.issue}</p>
                  <p className="text-[#334d6d]">{item.decision}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-3 border border-[#dce3eb] bg-white">
            <div className="flex items-center justify-between border-b border-[#dce3eb] px-3 py-2"><p className="border-l-2 border-[#1769aa] pl-2 text-[0.46rem] font-medium tracking-[0.14em] uppercase">Delivery horizon</p><span className="text-[0.42rem] text-[#1769aa]">View calendar</span></div>
            <div className="grid divide-y divide-[#dce3eb] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <HorizonBlock title="Upcoming dates" icon={CalendarDays} detail="3 gates in the next 30 days" />
              <HorizonBlock title="Delivery by phase" icon={CheckCircle2} detail="12 projects progressing" />
              <HorizonBlock title="Risks & dependencies" icon={AlertCircle} detail="2 require attention" />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function BriefMetric({ value, label, tone }: { value: string; label: string; tone?: 'success' | 'warning' | 'danger' }) {
  const dot = tone === 'success' ? 'bg-emerald-500' : tone === 'warning' ? 'bg-amber-500' : tone === 'danger' ? 'bg-red-500' : undefined
  return <div className="min-w-0 flex-1 px-2 first:pl-0"><p className="text-sm font-medium text-[#0d2340]">{value}</p><p className="mt-0.5 flex items-center gap-1 text-[0.4rem] text-[#657590]">{dot ? <span className={cn('size-1 rounded-full', dot)} /> : null}{label}</p></div>
}

function FocusLine({ icon: Icon, title, tone }: { icon: typeof AlertCircle; title: string; tone?: 'danger' }) {
  return <div className="flex items-center gap-2 text-[0.45rem] font-medium text-[#0d2340]"><Icon className={cn('size-3.5 shrink-0', tone === 'danger' ? 'text-red-500' : 'text-[#0d2340]')} strokeWidth={1.6} /><span>{title}</span></div>
}

function HorizonBlock({ title, icon: Icon, detail }: { title: string; icon: typeof CalendarDays; detail: string }) {
  return <div className="p-3"><p className="text-[0.4rem] font-medium tracking-[0.12em] text-[#657590] uppercase">{title}</p><div className="mt-3 flex items-center gap-2"><Icon className="size-3.5 text-[#55749a]" strokeWidth={1.5} /><span className="text-[0.45rem] font-medium text-[#0d2340]">{detail}</span></div></div>
}
