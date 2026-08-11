import { ArrowUp, Info } from 'lucide-react'
import type { KpiCard as KpiCardType } from '@/features/overview/data'
import { Sparkline } from '@/components/ui/sparkline'
import { cn } from '@/lib/utils'

const iconToneClasses: Record<'neutral' | 'brand' | 'warning', string> = {
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-brand-soft text-brand',
  warning: 'bg-warning-soft text-warning',
}

export function KpiCard({ card }: { card: KpiCardType }) {
  return (
    <article className="flex min-h-[9.5rem] flex-col rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_0_rgb(16_32_46_/_0.04)]">
      <div className="flex items-center gap-1.5">
        <h3 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {card.label}
        </h3>
        {card.info ? <Info className="size-3.5 text-muted-foreground/70" /> : null}
      </div>

      {card.kind === 'gauge' ? <GaugeBody card={card} /> : null}
      {card.kind === 'trend' ? <TrendBody card={card} /> : null}
      {card.kind === 'icon' ? <IconBody card={card} /> : null}
    </article>
  )
}

function DeltaRow({ delta, deltaLabel }: { delta: string; deltaLabel: string }) {
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <ArrowUp className="size-3 text-brand" />
      <span className="font-semibold text-brand">{delta}</span>
      <span>{deltaLabel}</span>
    </p>
  )
}

function GaugeBody({ card }: { card: Extract<KpiCardType, { kind: 'gauge' }> }) {
  return (
    <div className="mt-2 flex flex-1 flex-col">
      <div>
        <p className="text-4xl font-bold tracking-tight text-foreground">{card.value}</p>
      </div>
      <div className="mt-3"><DeltaRow delta={card.delta} deltaLabel={card.deltaLabel} /></div>
      <div className="mt-auto pt-4"><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${card.percent}%` }} /></div></div>
    </div>
  )
}

function TrendBody({ card }: { card: Extract<KpiCardType, { kind: 'trend' }> }) {
  return (
    <div className="mt-2 flex flex-1 flex-col">
      <p className="text-3xl font-bold tracking-tight text-foreground">{card.value}</p>
      <div className="mt-2">
        <DeltaRow delta={card.delta} deltaLabel={card.deltaLabel} />
      </div>
      <div className="mt-auto pt-3">
        <Sparkline id={card.id} data={card.trend} color="var(--chart-4)" height={44} />
      </div>
    </div>
  )
}

function IconBody({ card }: { card: Extract<KpiCardType, { kind: 'icon' }> }) {
  return (
    <div className="mt-2 flex flex-1 items-end justify-between">
      <div>
        <p className="text-3xl font-bold tracking-tight text-foreground">{card.value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{card.caption}</p>
      </div>
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-full',
          iconToneClasses[card.tone],
        )}
      >
        <card.icon className="size-[1.125rem]" strokeWidth={1.75} />
      </span>
    </div>
  )
}
