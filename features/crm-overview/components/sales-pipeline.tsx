import Link from 'next/link'
import type { ReactNode } from 'react'

import { InitialAvatar } from '@/components/ui/initial-avatar'
import { cn } from '@/lib/utils'
import { formatMoney, formatMoneyList, initialsOf } from '../metrics'
import type { Money, PipelineData, PipelinePreview, Section } from '../types'
import { EmptyState, ErrorState, Panel, UnavailableState } from './panel'

type Column = {
  title: string
  note?: string
  count: number
  totals: Money[]
  previews: PipelinePreview[]
  closed?: boolean
}

function Opportunity({ preview }: { preview: PipelinePreview }) {
  return (
    <Link
      href={`/commercial/sales/${preview.id}`}
      className="flex items-center gap-2.5 border border-border bg-card px-2.5 py-2 transition-colors hover:border-brand/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <InitialAvatar initials={initialsOf(preview.clientName)} className="size-8 text-[0.625rem]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-foreground">{preview.clientName}</span>
        <span className="block truncate text-[0.6875rem] text-[var(--briefing-muted)]">{preview.name}</span>
      </span>
      {/* A stored 0 cannot be told from "no value entered", so it is not shown as R0. */}
      <span className="shrink-0 text-xs font-medium text-foreground">
        {preview.value > 0 ? formatMoney(preview.value, preview.currency, 'compact') : <span className="text-[var(--briefing-muted)]">No value</span>}
      </span>
    </Link>
  )
}

function StageColumn({ column }: { column: Column }) {
  const total = formatMoneyList(column.totals, 'compact')
  const hidden = column.count - column.previews.length
  return (
    <li className={cn('flex min-w-0 flex-col border-t-2 px-1 pt-3', column.closed ? 'border-success bg-[var(--success-soft)]/60' : 'border-brand/50')}>
      <div className="px-2">
        <h3 className={cn('text-xs font-semibold', column.closed ? 'text-success' : 'text-foreground')}>{column.title}</h3>
        {column.note ? <p className="text-[0.6875rem] text-[var(--briefing-muted)]">{column.note}</p> : null}
        <p className="font-brand mt-1 text-2xl leading-none font-medium text-foreground">{column.count}</p>
        <p className="mt-1 min-h-4 text-xs text-[var(--briefing-muted)]">
          {column.count === 0 ? '' : total || 'No value recorded'}
        </p>
      </div>
      <ul className="mt-3 flex flex-col gap-2 px-1 pb-3">
        {column.previews.map((preview) => (
          <li key={preview.id}><Opportunity preview={preview} /></li>
        ))}
        {column.count === 0 ? <li className="px-1 text-xs text-[var(--briefing-muted)]">None</li> : null}
        {hidden > 0 ? (
          <li>
            <Link href="/commercial/sales" className="block px-1 text-xs font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              + {hidden} more
            </Link>
          </li>
        ) : null}
      </ul>
    </li>
  )
}

export function SalesPipeline({ pipeline, showLeadsLink }: { pipeline: Section<PipelineData>; showLeadsLink: boolean }) {
  const linkClass = 'text-xs font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
  const action = (
    <div className="flex items-center gap-4">
      {showLeadsLink ? <Link href="/commercial/leads" className={linkClass}>View all leads →</Link> : null}
      <Link href="/commercial/sales" className={linkClass}>View all opportunities →</Link>
    </div>
  )

  let body: ReactNode
  if (pipeline.status === 'error') body = <ErrorState what="The sales pipeline" />
  else if (pipeline.status === 'unavailable') body = <UnavailableState module="Sales" />
  else {
    const { stages, won } = pipeline.data
    const openCount = stages.reduce((total, stage) => total + stage.count, 0)
    const columns: Column[] = [
      ...stages.map((stage) => ({ title: stage.stage, count: stage.count, totals: stage.totals, previews: stage.previews })),
      { title: 'Closed Won', note: 'This year', count: won.count, totals: won.totals, previews: won.previews, closed: true },
    ]
    body = (
      <>
        {openCount === 0 && won.count === 0 ? (
          <EmptyState>
            No opportunities yet. <Link href="/commercial/sales/new" className="font-semibold text-brand hover:underline">Create the first one</Link>.
          </EmptyState>
        ) : null}
        <div className="px-4 py-4">
          <ul aria-label="Pipeline stages" className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-x-3 gap-y-5">
            {columns.map((column) => <StageColumn key={column.title} column={column} />)}
          </ul>
        </div>
      </>
    )
  }

  return (
    <Panel title="Sales pipeline" description="Open opportunities by stage. Closed Won is this year's wins, kept apart from the open pipeline." action={action}>
      {body}
    </Panel>
  )
}
