import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { ProgressBar } from '@/components/ui/progress-bar'
import { cn } from '@/lib/utils'
import type { DeliveryHealth } from '../data'

export function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon?: LucideIcon }) {
  return <article className="rounded-xl border border-border bg-card px-4 py-4 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
    {/* The label block reserves two lines whether or not it needs them. Without
        it, a label that wraps ("Outstanding approvals") pushes its own value down
        a line while its neighbours' values stay put, and the row of numbers sits
        on three different baselines. */}
    <div className="flex min-h-8 items-start justify-between gap-3"><p className="text-[0.675rem] font-semibold tracking-[0.09em] text-muted-foreground uppercase">{label}</p>{Icon ? <Icon className="size-4 text-muted-foreground" /> : null}</div>
    <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </article>
}

export function MetricGrid({ items }: { items: ReadonlyArray<readonly [string, string, string]> }) {
  // Four across at most. Eight forced every card to ~150px, which is what made
  // the longer labels wrap in the first place — and eight equally weighted
  // figures tell a reader nothing about which of them matters.
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{items.map(([label, value, detail]) => <MetricCard key={label} label={label} value={value} detail={detail} />)}</div>
}

export function SectionCard({ title, description, action, children, className }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]', className)}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold text-foreground">{title}</h2>{description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}</div>{action}</header>
    {children}
  </section>
}

const healthStyles: Record<string, string> = {
  'On Track': 'bg-success-soft text-success',
  Healthy: 'bg-success-soft text-success',
  Watch: 'bg-warning-soft text-warning',
  'At Risk': 'bg-danger-soft text-danger',
  Critical: 'bg-danger text-white',
  Pending: 'bg-warning-soft text-warning',
  'In Review': 'bg-info-soft text-info',
  Overdue: 'bg-danger-soft text-danger',
  Approved: 'bg-success-soft text-success',
  Current: 'bg-success-soft text-success',
}

export function HealthBadge({ children }: { children: DeliveryHealth | ReactNode }) {
  const label = String(children)

  return <span className={cn('inline-flex rounded-md px-2 py-1 text-[0.6875rem] font-semibold whitespace-nowrap', healthStyles[label] ?? 'bg-muted text-muted-foreground')}>{label}</span>
}

export function PhaseStepper({ phases, active }: { phases: ReadonlyArray<{ name: string; projects?: number }>; active?: string }) {
  return <div className="overflow-x-auto"><div className="flex min-w-[760px] items-start">
    {phases.map((phase, index) => {
      const activeIndex = active ? phases.findIndex((item) => item.name === active) : -1
      const reached = activeIndex >= 0 && index <= activeIndex
      return <div key={phase.name} className="relative flex flex-1 flex-col items-center text-center">
        {index > 0 ? <span className={cn('absolute top-3 right-1/2 h-px w-full', reached ? 'bg-brand' : 'bg-border')} /> : null}
        <span className={cn('relative z-10 flex size-6 items-center justify-center rounded-full border text-[0.625rem] font-bold', reached ? 'border-brand bg-brand text-white' : 'border-border bg-card text-muted-foreground')}>{index + 1}</span>
        <span className="mt-2 text-xs font-semibold">{phase.name}</span>
        {phase.projects !== undefined ? <span className="mt-0.5 text-[0.6875rem] text-muted-foreground">{phase.projects} projects</span> : null}
      </div>
    })}
  </div></div>
}

export function TableProgress({ value }: { value: number }) {
  return <div className="flex min-w-28 items-center gap-2"><ProgressBar value={value} color="var(--brand)" /><span className="w-9 text-right text-xs font-semibold">{value}%</span></div>
}

export function RiskList({ items }: { items: ReadonlyArray<{ title: string; meta: string; severity: 'danger' | 'warning' | 'info' }> }) {
  return <div className="divide-y divide-border">{items.map((item) => <article key={item.title} className="flex items-start gap-3 px-5 py-4"><span className={cn('mt-1.5 size-2 rounded-full', item.severity === 'danger' ? 'bg-danger' : item.severity === 'warning' ? 'bg-warning' : 'bg-info')} /><div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.meta}</p></div></article>)}</div>
}
