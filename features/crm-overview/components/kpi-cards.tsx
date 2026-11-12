import { ArrowDownRight, ArrowUpRight, FileText, Minus, Target, TrendingUp, Users, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { buildKpiCards, type KpiBody, type KpiCardId } from '../kpi-model'
import type { Delta } from '../metrics'
import type { KpiData, Section } from '../types'
import { RefreshButton } from './refresh-button'

const icons: Record<KpiCardId, LucideIcon> = { clients: Users, leads: Target, quotes: FileText, revenue: TrendingUp }

function Card({ label, icon: Icon, href, body }: { label: string; icon: LucideIcon; href: string; body: KpiBody }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon aria-hidden="true" className="size-[1.125rem] shrink-0 text-muted-foreground/70" strokeWidth={1.5} />
      </div>
      {body.state === 'ready' ? (
        <div className="mt-3">
          <p className="font-brand text-[2rem] leading-none font-light tracking-tight break-words text-foreground" title={body.valueTitle}>{body.value}</p>
          <DeltaLine delta={body.delta} label={body.deltaLabel} reason={body.noComparisonReason} />
          <p className="mt-1 text-xs text-[var(--briefing-muted)]">{body.caption}</p>
        </div>
      ) : body.state === 'unavailable' ? (
        <p className="mt-3 text-sm text-[var(--briefing-muted)]">Not included in your plan.</p>
      ) : (
        <div role="alert" className="mt-3 space-y-2">
          <p className="text-sm text-foreground">This figure could not be loaded.</p>
          <RefreshButton />
        </div>
      )}
    </>
  )
  const frame = 'relative block overflow-hidden rounded-none border border-border bg-card px-3.5 py-3 sm:px-5 sm:py-4'
  // Only a loaded card is a link: a failed one holds a Retry button, and a link
  // cannot contain another interactive control.
  return body.state === 'ready' ? (
    <Link href={href} className={cn(frame, 'transition-colors hover:border-brand/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand')}>{content}</Link>
  ) : (
    <div className={frame}>{content}</div>
  )
}

function DeltaLine({ delta, label, reason }: { delta: Delta | null; label: string; reason?: string }) {
  if (!delta) {
    return (
      <p className="mt-2 flex items-center gap-1 text-xs text-[var(--briefing-muted)]">
        <Minus aria-hidden="true" className="size-3.5" />
        {reason ?? (
          <>
            <span aria-hidden="true" className="sm:hidden">No prior data</span>
            <span className="max-sm:sr-only">No comparison available</span>
          </>
        )}
      </p>
    )
  }
  const Arrow = delta.direction === 'down' ? ArrowDownRight : delta.direction === 'up' ? ArrowUpRight : Minus
  return (
    <p className="mt-2 flex items-center gap-1 text-xs">
      <span className={cn('inline-flex items-center gap-0.5 font-semibold', delta.direction === 'up' && 'text-success', delta.direction === 'down' && 'text-destructive', delta.direction === 'flat' && 'text-muted-foreground')}>
        <Arrow aria-hidden="true" className="size-3.5" />
        {delta.text}
        <span className="sr-only">{delta.direction === 'up' ? ' increase' : delta.direction === 'down' ? ' decrease' : ' no change'}</span>
      </span>
      <span className="text-[var(--briefing-muted)]">{label}</span>
    </p>
  )
}

export function KpiCards({ kpis }: { kpis: Section<KpiData> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {buildKpiCards(kpis).map((card) => (
        <Card key={card.id} label={card.label} icon={icons[card.id]} href={card.href} body={card.body} />
      ))}
    </div>
  )
}
