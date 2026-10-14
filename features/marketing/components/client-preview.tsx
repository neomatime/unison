import { AlertCircle, ArrowRight, CalendarClock, FileText, Receipt, Search } from 'lucide-react'
import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'
import { CountUp } from './count-up'

// An illustration of the product, not live data: the names and figures are invented.
const navigation = ['Overview', 'Clients', 'Leads', 'Quotes', 'Sales', 'Invoices'] as const
const attention = [
  { client: 'Northwind Capital', state: 'At risk', issue: 'No contact for 21 days', due: 'Follow up today' },
  { client: 'Aurora Holdings', state: 'Overdue', issue: 'Invoice 14 days late', due: 'Reminder due' },
  { client: 'Meridian Partners', state: 'Waiting', issue: 'Quote awaiting a decision', due: 'Expires in 3 days' },
] as const
const pipeline = [
  { stage: 'Leads', width: '100%', value: '14' },
  { stage: 'Qualified', width: '72%', value: '9' },
  { stage: 'Quoted', width: '46%', value: '6' },
  { stage: 'Accepted', width: '24%', value: '3' },
] as const

const delay = (ms: number) => ({ '--lux-delay': `${ms}ms` }) as CSSProperties

export function ClientPreview() {
  return (
    <div className="relative overflow-hidden border border-[#aebbc9] bg-white shadow-[0_40px_90px_-30px_rgb(13_35_64_/_0.35),0_2px_0_rgb(255_255_255)]" aria-label="An illustration of the UNISON client briefing" role="img">
      <div className="grid min-h-[29rem] grid-cols-[7.6rem_1fr] sm:grid-cols-[9rem_1fr]">
        <aside className="border-r border-[#dce3eb] bg-[#fbfcfe] px-3 py-4 text-[#274364]">
          <p className="px-2 text-[0.6rem] font-medium tracking-[0.22em] text-[#0d2340]">UNISON</p>
          <div className="mt-7 space-y-1 text-[0.52rem]">
            {navigation.map((item, index) => (
              <div key={item} style={delay(900 + index * 70)} className={cn('lux-fade relative flex items-center gap-2 px-2 py-1.5', index === 0 && 'bg-[#edf3f8] text-[#0d2340] before:absolute before:inset-y-0 before:-left-3 before:w-0.5 before:bg-[#1769aa]')}>
                <span className="grid size-2 grid-cols-2 gap-px" aria-hidden="true"><span className="border border-current" /><span className="border border-current" /><span className="border border-current" /><span className="border border-current" /></span>
                {item}
              </div>
            ))}
          </div>
          <p className="mt-6 px-2 text-[0.42rem] font-medium tracking-[0.18em] text-[#71839a]">FINANCE</p>
          <div className="mt-2 space-y-1 px-2 text-[0.52rem] text-[#49617f]"><div className="py-1.5">Payments</div><div className="py-1.5">Forecasting</div></div>
        </aside>

        <div className="min-w-0 bg-[#fafbfd] p-3 sm:p-4">
          <div className="lux-fade flex items-start justify-between gap-3" style={delay(700)}>
            <div>
              <p className="text-[0.5rem] text-[#657590]">Good afternoon, Neo.</p>
              <h2 className="mt-1 text-xs font-medium tracking-[0.08em] text-[#0d2340] uppercase sm:text-sm">Here’s your client briefing.</h2>
              <p className="mt-1 hidden text-[0.46rem] text-[#657590] sm:block">Every relationship at a glance: what is moving, and what needs you.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden h-7 w-32 items-center gap-1.5 border border-[#dce3eb] bg-white px-2 text-[0.42rem] text-[#71839a] sm:flex"><Search className="size-2.5" />Search clients</div>
              <div className="border border-[#dce3eb] bg-white px-2.5 py-1.5 text-[0.46rem] font-medium text-[#0d2340]">Your organisation</div>
            </div>
          </div>

          <section className="lux-fade mt-4 grid border border-[#dce3eb] bg-white lg:grid-cols-[1.12fr_0.88fr]" style={delay(950)}>
            <div className="border-b border-[#dce3eb] p-3 lg:border-r lg:border-b-0">
              <p className="text-[0.42rem] font-medium tracking-[0.16em] text-[#1769aa] uppercase">Overall position</p>
              <h3 className="mt-2 text-sm font-medium text-[#0d2340] sm:text-base">Your relationships are in good health.</h3>
              <p className="mt-1 max-w-[22rem] text-[0.47rem] leading-3.5 text-[#657590]">Most clients are active and on track. A few need a follow-up this week.</p>
              <div className="mt-3 flex divide-x divide-[#dce3eb]">
                <Metric value={48} label="Clients" delayMs={1300} />
                <Metric value={41} label="Healthy" tone="success" delayMs={1420} />
                <Metric value={5} label="Watch" tone="warning" delayMs={1540} />
                <Metric value={2} label="At risk" tone="danger" delayMs={1660} />
              </div>
            </div>
            <div className="p-3">
              <p className="text-[0.42rem] font-medium tracking-[0.16em] text-[#55749a] uppercase">Key focus areas</p>
              <div className="mt-3 space-y-2.5">
                <Focus icon={AlertCircle} title="2 clients need a follow-up" tone="danger" />
                <Focus icon={FileText} title="3 quotes awaiting a decision" />
                <Focus icon={Receipt} title="1 overdue invoice" />
              </div>
            </div>
          </section>

          <section className="lux-fade mt-3 border border-[#dce3eb] bg-white" style={delay(1150)}>
            <div className="flex items-center justify-between border-b border-[#dce3eb] px-3 py-2">
              <p className="border-l-2 border-red-500 pl-2 text-[0.46rem] font-medium tracking-[0.14em] uppercase">Needs your attention</p>
              <span className="flex items-center gap-1 text-[0.42rem] text-[#1769aa]">View all <ArrowRight className="size-2.5" /></span>
            </div>
            <div className="divide-y divide-[#edf0f4]">
              {attention.map((item, index) => (
                <div key={item.client} style={delay(1500 + index * 140)} className="lux-fade grid grid-cols-[1.2fr_0.48fr_1fr_0.7fr] items-center gap-2 px-3 py-2 text-[0.45rem]">
                  <p className="truncate font-medium text-[#0d2340]">{item.client}</p>
                  <span className={cn('flex items-center gap-1', item.state === 'At risk' ? 'text-red-700' : item.state === 'Overdue' ? 'text-amber-700' : 'text-[#1769aa]')}><span className={cn('size-1.5 rounded-full', item.state === 'At risk' ? 'bg-red-500' : item.state === 'Overdue' ? 'bg-amber-500' : 'bg-[#1769aa]')} />{item.state}</span>
                  <p className="truncate text-[#657590]">{item.issue}</p>
                  <p className="text-[#334d6d]">{item.due}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="lux-fade mt-3 border border-[#dce3eb] bg-white" style={delay(1350)}>
            <div className="flex items-center justify-between border-b border-[#dce3eb] px-3 py-2"><p className="border-l-2 border-[#1769aa] pl-2 text-[0.46rem] font-medium tracking-[0.14em] uppercase">Pipeline and billing</p><span className="text-[0.42rem] text-[#1769aa]">View forecast</span></div>
            <div className="grid divide-y divide-[#dce3eb] sm:grid-cols-[1.3fr_0.85fr_0.85fr] sm:divide-x sm:divide-y-0">
              <div className="p-3">
                <p className="text-[0.4rem] font-medium tracking-[0.12em] text-[#657590] uppercase">Open pipeline</p>
                <div className="mt-2 space-y-1.5">
                  {pipeline.map((row, index) => (
                    <div key={row.stage} className="grid grid-cols-[2.6rem_1fr_0.9rem] items-center gap-2 text-[0.4rem] text-[#49617f]">
                      <span>{row.stage}</span>
                      <span className="h-1.5 bg-[#edf3f8]"><span style={{ ...delay(1800 + index * 160), width: row.width }} className="lux-fill block h-full bg-gradient-to-r from-[#1769aa] to-[#6fa8dc]" /></span>
                      <span className="text-right font-medium text-[#0d2340]">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Block title="Quotes" icon={FileText} detail="3 awaiting a decision" />
              <Block title="Invoices" icon={CalendarClock} detail="1 overdue, 4 due this month" />
            </div>
          </section>
        </div>
      </div>
      <span aria-hidden="true" className="lux-sheen" />
    </div>
  )
}

function Metric({ value, label, tone, delayMs }: { value: number; label: string; tone?: 'success' | 'warning' | 'danger'; delayMs: number }) {
  const dot = tone === 'success' ? 'bg-emerald-500' : tone === 'warning' ? 'bg-amber-500' : tone === 'danger' ? 'bg-red-500' : undefined
  return (
    <div className="min-w-0 flex-1 px-2 first:pl-0">
      <p className="text-sm font-medium text-[#0d2340]"><CountUp value={value} delay={delayMs} /></p>
      <p className="mt-0.5 flex items-center gap-1 text-[0.4rem] text-[#657590]">{dot ? <span className={cn('size-1 rounded-full', dot)} /> : null}{label}</p>
    </div>
  )
}

function Focus({ icon: Icon, title, tone }: { icon: typeof AlertCircle; title: string; tone?: 'danger' }) {
  return <div className="flex items-center gap-2 text-[0.45rem] font-medium text-[#0d2340]"><Icon className={cn('size-3.5 shrink-0', tone === 'danger' ? 'text-red-500' : 'text-[#0d2340]')} strokeWidth={1.6} /><span>{title}</span></div>
}

function Block({ title, icon: Icon, detail }: { title: string; icon: typeof AlertCircle; detail: string }) {
  return <div className="p-3"><p className="text-[0.4rem] font-medium tracking-[0.12em] text-[#657590] uppercase">{title}</p><div className="mt-3 flex items-center gap-2"><Icon className="size-3.5 text-[#55749a]" strokeWidth={1.5} /><p className="text-[0.45rem] font-medium text-[#0d2340]">{detail}</p></div></div>
}
