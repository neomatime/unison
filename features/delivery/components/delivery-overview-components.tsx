import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Layers,
  Milestone,
  OctagonX,
  ShieldAlert,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { positionNarrative, type AttentionRow, type DeliveryOverview, type PhaseColumn, type UpcomingProjectDate } from '../overview-bands'
import { HealthBadge } from './delivery-primitives'

export function OverallPositionBrief({ overview }: { overview: DeliveryOverview }) {
  const narrative = positionNarrative(overview)
  const metrics = [
    { label: 'Active projects', value: overview.activeProjects, dot: null },
    { label: 'On Track / Healthy', value: overview.healthCounts['On Track / Healthy'], dot: 'bg-emerald-600' },
    ...(overview.healthCounts.Watch > 0
      ? [{ label: 'Watch', value: overview.healthCounts.Watch, dot: 'bg-blue-500' }]
      : []),
    { label: 'At Risk', value: overview.healthCounts['At Risk'], dot: 'bg-amber-500' },
    { label: 'Critical', value: overview.healthCounts.Critical, dot: 'bg-red-600' },
  ]

  return (
    <section aria-labelledby="overall-position-heading" className="overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_1px_2px_rgb(16_32_46_/_0.025)]">
      <div className="grid xl:grid-cols-[1.08fr_0.92fr]">
        <div className="p-5 sm:p-6 xl:border-r xl:border-border xl:p-7">
          <p className="text-xs font-semibold tracking-[0.1em] text-brand uppercase">Overall position</p>
          <h2 id="overall-position-heading" className="mt-2 text-[1.625rem] leading-tight font-bold tracking-[-0.035em] text-foreground sm:text-[1.875rem]">
            {narrative.headline}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--briefing-muted)] sm:text-[0.9375rem]">
            {narrative.description}
          </p>

          {overview.activeProjects === 0 ? (
            <Link href="/operations/projects/new" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-brand/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              Create project <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <>
              <dl className={cn('mt-6 grid grid-cols-2 gap-y-4', metrics.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4')}>
                {metrics.map((metric, index) => (
                  <div key={metric.label} className={cn('flex min-w-0 flex-col', index > 0 && 'sm:border-l sm:border-border sm:pl-4')}>
                    <dt className="order-2 mt-1 flex items-center gap-2 text-xs text-[var(--briefing-muted)]">
                      {metric.dot ? <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', metric.dot)} /> : null}
                      {metric.label}
                    </dt>
                    <dd className="order-1 text-2xl font-bold tabular-nums tracking-[-0.03em] text-foreground">{metric.value}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/delivery/portfolio" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-brand/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                View portfolio <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </>
          )}
        </div>

        <KeyFocusList overview={overview} />
      </div>
    </section>
  )
}

function KeyFocusList({ overview }: { overview: DeliveryOverview }) {
  if (overview.activeProjects === 0) {
    return (
      <div className="p-5 sm:p-6 xl:p-7">
        <h3 className="text-xs font-semibold tracking-[0.1em] text-[var(--briefing-muted)] uppercase">Key focus areas</h3>
        <BriefingEmptyState
          icon={CheckCircle2}
          title="No delivery signals yet"
          description="The briefing will surface intervention, ownership and date signals when active projects are available."
        />
      </div>
    )
  }

  const interventionCount = overview.attention.length
  const criticalCount = overview.healthCounts.Critical
  const ownershipOrGateGap = overview.unassignedOwnerCount + overview.missingNextGateCount
  const focusItems: FocusItem[] = [
    {
      icon: interventionCount > 0 ? AlertCircle : CheckCircle2,
      tone: interventionCount > 0 ? 'danger' : 'success',
      title: interventionCount > 0
        ? `${interventionCount} ${plural('project', interventionCount)} require intervention`
        : 'No projects require intervention',
      detail: interventionCount > 0
        ? `${criticalCount} critical and ${overview.healthCounts['At Risk']} at-risk health ${plural('record', interventionCount)}.`
        : 'No active project is currently marked At Risk or Critical.',
    },
    {
      icon: overview.overdueProjectDates > 0 ? Clock3 : CheckCircle2,
      tone: overview.overdueProjectDates > 0 ? 'danger' : 'success',
      title: overview.overdueProjectDates > 0
        ? `${overview.overdueProjectDates} overdue project target ${plural('date', overview.overdueProjectDates)}`
        : 'No overdue project target dates',
      detail: 'Based on dates recorded against active projects.',
    },
    {
      icon: CalendarDays,
      tone: 'brand',
      title: `${overview.projectDatesNext30} project target ${plural('date', overview.projectDatesNext30)} in the next 30 days`,
      detail: `${overview.projectDatesNext7} fall within the next 7 days.`,
    },
    {
      icon: ownershipOrGateGap > 0 ? UserRoundX : Milestone,
      tone: ownershipOrGateGap > 0 ? 'warning' : 'brand',
      title: ownershipOrGateGap > 0 ? `${ownershipOrGateGap} delivery record ${plural('gap', ownershipOrGateGap)}` : 'Ownership and next gates are recorded',
      detail: ownershipOrGateGap > 0
        ? `${overview.unassignedOwnerCount} without an owner and ${overview.missingNextGateCount} without a recorded next gate.`
        : 'Every active project has an owner and a recorded next gate.',
    },
    {
      icon: overview.blockedItemCount > 0 ? OctagonX : overview.activeItemCount > 0 ? CheckCircle2 : Layers,
      tone: overview.blockedItemCount > 0 ? 'danger' : overview.activeItemCount > 0 ? 'success' : 'brand',
      title: overview.blockedItemCount > 0
        ? `${overview.blockedItemCount} delivery ${plural('item', overview.blockedItemCount)} blocked across ${overview.blockedItemProjectCount} ${plural('project', overview.blockedItemProjectCount)}`
        : overview.activeItemCount > 0
          ? 'No delivery items are blocked'
          : 'No delivery items are recorded',
      detail: overview.blockedItemCount > 0
        ? 'Blocked is the one delivery-item status with no project-level equivalent.'
        : overview.activeItemCount > 0
          ? `None of the ${overview.activeItemCount} recorded delivery ${plural('item', overview.activeItemCount)} is currently blocked.`
          : 'Blocked work cannot be reported until delivery items are recorded against active projects.',
    },
  ]

  return (
    <div className="p-5 sm:p-6 xl:p-7">
      <h3 className="text-xs font-semibold tracking-[0.1em] text-[var(--briefing-muted)] uppercase">Key focus areas</h3>
      <ul className="mt-4 space-y-4">
        {focusItems.map((item) => <FocusListItem key={item.title} item={item} />)}
      </ul>
    </div>
  )
}

type FocusItem = {
  icon: LucideIcon
  tone: 'brand' | 'success' | 'warning' | 'danger'
  title: string
  detail: string
}

const focusToneClasses: Record<FocusItem['tone'], string> = {
  brand: 'text-brand',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-red-600',
}

function FocusListItem({ item }: { item: FocusItem }) {
  const Icon = item.icon
  return (
    <li className="flex items-start gap-3.5">
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', focusToneClasses[item.tone])} strokeWidth={1.8} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{item.title}</p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--briefing-muted)]">{item.detail}</p>
      </div>
    </li>
  )
}

export function InterventionList({ rows }: { rows: AttentionRow[] }) {
  const visibleRows = rows.slice(0, 3)

  return (
    <section aria-labelledby="intervention-heading" className="overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_1px_2px_rgb(16_32_46_/_0.025)]">
      <header className="relative flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-danger">
        {/* The count is disclosed because the list is capped at three. A
            section titled "Requires intervention" showing three of eleven rows,
            with no number anywhere in its own header, reads as complete. */}
        <h2 id="intervention-heading" className="text-xs font-bold tracking-[0.12em] text-foreground uppercase">
          Requires intervention{rows.length > visibleRows.length ? ` · showing ${visibleRows.length} of ${rows.length}` : ''}
        </h2>
        <Link href="/operations/projects" className="inline-flex items-center gap-2 text-xs font-semibold text-brand hover:text-brand/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          View all projects <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </header>

      {visibleRows.length === 0 ? (
        <BriefingEmptyState
          icon={CheckCircle2}
          title="Nothing requires intervention"
          description="No active projects are currently marked At Risk or Critical."
        />
      ) : (
        <>
          <div className="divide-y divide-border min-[1360px]:hidden">
            {visibleRows.map((row) => <InterventionCard key={row.id} row={row} />)}
          </div>
          <div className="hidden min-[1360px]:block">
            <table className="w-full table-fixed text-left">
              <caption className="sr-only">Active projects marked At Risk or Critical</caption>
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[9%]" />
                <col className="w-[20%]" />
                <col className="w-[13%]" />
                <col className="w-[16%]" />
                <col className="w-[13%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead className="bg-muted/35 text-[0.6875rem] font-semibold tracking-[0.04em] text-[var(--briefing-muted)] uppercase">
                <tr>
                  {['Project', 'Health', 'Latest note', 'Impact', 'Next checkpoint', 'Owner', 'Action'].map((label) => (
                    <th key={label} scope="col" className="px-4 py-3">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleRows.map((row) => <InterventionTableRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function InterventionTableRow({ row }: { row: AttentionRow }) {
  return (
    <tr className="align-top transition-colors hover:bg-muted/20">
      <td className="px-4 py-3.5">
        <p className="text-sm font-semibold text-foreground">{row.name}</p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--briefing-muted)]">{row.client} · {row.framework} · {row.phase}</p>
      </td>
      <td className="px-4 py-3.5"><HealthBadge>{row.health}</HealthBadge></td>
      <td className="px-4 py-3.5 text-xs leading-5 text-foreground"><p className="line-clamp-2">{row.note ?? 'No project note recorded.'}</p></td>
      <td className="px-4 py-3.5 text-xs leading-5 text-[var(--briefing-muted)]"><p className="line-clamp-2">Not structured in the current project model.</p></td>
      <td className="px-4 py-3.5">
        <p className="text-xs font-semibold text-foreground">{row.nextGate ?? 'No next gate recorded'}</p>
        <p className="mt-0.5 text-xs text-[var(--briefing-muted)]">Project target · {row.targetDateLabel}</p>
      </td>
      <td className="px-4 py-3.5 text-xs font-medium text-foreground">{row.owner}</td>
      <td className="px-4 py-3.5">
        <Link href={`/operations/projects/${row.id}`} className="inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          Review
        </Link>
      </td>
    </tr>
  )
}

function InterventionCard({ row }: { row: AttentionRow }) {
  return (
    <article className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{row.name}</h3>
          <p className="mt-0.5 text-xs leading-5 text-[var(--briefing-muted)]">{row.client} · {row.framework} · {row.phase}</p>
        </div>
        <HealthBadge>{row.health}</HealthBadge>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <BriefingDatum label="Latest project note" value={row.note ?? 'No project note recorded.'} clamp />
        <BriefingDatum label="Impact" value="Not structured in the current project model." muted clamp />
        <BriefingDatum label="Next checkpoint" value={row.nextGate ?? 'No next gate recorded'} detail={`Project target · ${row.targetDateLabel}`} />
        <BriefingDatum label="Owner" value={row.owner} />
      </dl>
      <Link href={`/operations/projects/${row.id}`} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand hover:text-brand/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        Review project <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </article>
  )
}

function BriefingDatum({ label, value, detail, muted = false, clamp = false }: { label: string; value: string; detail?: string; muted?: boolean; clamp?: boolean }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold tracking-wide text-[var(--briefing-muted)] uppercase">{label}</dt>
      <dd className={cn('mt-1 text-xs leading-5', muted ? 'text-[var(--briefing-muted)]' : 'font-medium text-foreground', clamp && 'line-clamp-3')}>{value}</dd>
      {detail ? <dd className="mt-0.5 text-xs text-[var(--briefing-muted)]">{detail}</dd> : null}
    </div>
  )
}

export function DeliveryHorizon({ overview }: { overview: DeliveryOverview }) {
  return (
    <section aria-labelledby="delivery-horizon-heading" className="overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_1px_2px_rgb(16_32_46_/_0.025)]">
      <header className="relative flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-brand">
        <h2 id="delivery-horizon-heading" className="text-xs font-bold tracking-[0.12em] text-foreground uppercase">Delivery horizon</h2>
        <Link href="/operations/projects" className="inline-flex items-center gap-2 text-xs font-semibold text-brand hover:text-brand/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          View all projects <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </header>

      <div className="grid min-[1360px]:grid-cols-3">
        <UpcomingKeyDates rows={overview.upcomingProjectDates} />
        <PhaseDistribution
          activeProjects={overview.activeProjects}
          itemColumns={overview.itemPhaseColumns}
          frameworkName={overview.framework?.name ?? null}
          itemCount={overview.leadingFrameworkItemCount}
          itemsWithoutPhaseCount={overview.itemsWithoutPhaseCount}
        />
        <TopRisksDependencies />
      </div>
    </section>
  )
}

function UpcomingKeyDates({ rows }: { rows: UpcomingProjectDate[] }) {
  const visibleRows = rows.slice(0, 4)
  return (
    <div className="border-b border-border p-5 sm:p-6 min-[1360px]:border-r min-[1360px]:border-b-0">
      <h3 className="text-xs font-semibold tracking-[0.08em] text-[var(--briefing-muted)] uppercase">
        Upcoming project dates{rows.length > visibleRows.length ? ` · showing ${visibleRows.length} of ${rows.length}` : ''}
      </h3>
      {visibleRows.length === 0 ? (
        <BriefingEmptyState
          icon={CalendarDays}
          title="No upcoming project dates"
          description="No active project target dates fall within the next 30 days."
        />
      ) : (
        <ol className="relative mt-4 space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[6.85rem] before:w-px before:bg-border">
          {visibleRows.map((row) => (
            <li key={row.id} className="relative grid grid-cols-[6.25rem_0.75rem_minmax(0,1fr)] items-start gap-2.5">
              <time dateTime={row.dueDate} className="pt-0.5 text-xs font-medium tabular-nums text-foreground">{row.dueDateLabel}</time>
              <span aria-hidden="true" className={cn('relative z-10 mt-1 size-2.5 rounded-full ring-4 ring-card', timelineDotClass(row.health))} />
              <div className="min-w-0">
                <Link href={`/operations/projects/${row.id}`} className="block truncate text-xs font-semibold text-foreground hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{row.name}</Link>
                <p className="mt-0.5 text-xs leading-5 text-[var(--briefing-muted)]">{row.nextGate ? `Recorded next gate · ${row.nextGate}` : 'No next gate recorded'}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Link href="/operations/projects" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-brand hover:text-brand/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        View project dates <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  )
}

function PhaseDistribution({
  activeProjects,
  itemColumns,
  frameworkName,
  itemCount,
  itemsWithoutPhaseCount,
}: {
  activeProjects: number
  itemColumns: PhaseColumn[]
  frameworkName: string | null
  itemCount: number
  itemsWithoutPhaseCount: number
}) {
  const totalAssigned = itemColumns.reduce((total, column) => total + column.total, 0)
  const segmentColors = ['#6f86a3', '#83a8d4', '#64a6ea', '#3f8fe5', '#85baf0', '#a7caef', '#c4d9ee', '#dce6ef']
  const coloredColumns = itemColumns.map((column, index) => ({
    ...column,
    color: segmentColors[index % segmentColors.length],
  }))

  return (
    <div className="border-b border-border p-5 sm:p-6 min-[1360px]:border-r min-[1360px]:border-b-0">
      <h3 className="text-xs font-semibold tracking-[0.08em] text-[var(--briefing-muted)] uppercase">Delivery by phase</h3>
      {itemColumns.length === 0 ? (
        <BriefingEmptyState
          icon={Milestone}
          title={activeProjects === 0
            ? 'No active lifecycle yet'
            : itemCount > 0
              ? 'No lifecycle phases available'
              : 'No delivery items recorded'}
          description={activeProjects === 0
            ? 'Active projects will appear here when delivery begins.'
            : frameworkName === null
              ? 'No active project is connected to a delivery framework.'
              : itemCount > 0
                ? `${frameworkName} has no configured phase sequence to display.`
                : `No delivery items are recorded against ${frameworkName} projects yet.`}
        />
      ) : (
        <>
          <div
            role="img"
            aria-label={`${totalAssigned} delivery ${plural('item', totalAssigned)} across ${itemColumns.length} phases in ${frameworkName}`}
            className="mt-5 flex h-4 overflow-hidden rounded-md bg-muted"
          >
            {coloredColumns.filter((column) => column.total > 0).map((column) => (
              <span
                key={column.phase}
                title={`${column.phase}: ${column.total}`}
                style={{ flexGrow: column.total, backgroundColor: column.color }}
                className="border-r border-card last:border-r-0"
              />
            ))}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-2.5">
            {coloredColumns.map((column) => (
              <div key={column.phase} className="flex items-center justify-between gap-3 text-xs">
                <dt className="flex min-w-0 items-center gap-2 text-[var(--briefing-muted)]">
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: column.color }} />
                  <span className="truncate">{column.phase}</span>
                </dt>
                <dd className="font-semibold tabular-nums text-foreground">{column.total}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-[var(--briefing-muted)]">
            {itemCount} delivery {plural('item', itemCount)} across {frameworkName}.
            {itemsWithoutPhaseCount > 0 ? ` ${itemsWithoutPhaseCount} ${plural('item', itemsWithoutPhaseCount)} ${itemsWithoutPhaseCount === 1 ? 'has' : 'have'} no phase recorded.` : ''}
          </p>
        </>
      )}
    </div>
  )
}

function TopRisksDependencies() {
  return (
    <div className="p-5 sm:p-6">
      <h3 className="text-xs font-semibold tracking-[0.08em] text-[var(--briefing-muted)] uppercase">Top risks &amp; dependencies</h3>
      <BriefingEmptyState
        icon={ShieldAlert}
        title="No structured register is connected"
        description="Risks, dependencies and downstream impacts are not persisted in the current delivery model. Current project health signals remain visible in the intervention queue."
      />
      <Link href="/operations/projects" className="inline-flex items-center gap-2 text-xs font-semibold text-brand hover:text-brand/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        Review project health <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  )
}

function BriefingEmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="py-5">
      <Icon aria-hidden="true" className="size-5 text-[var(--briefing-muted)]" strokeWidth={1.7} />
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-[var(--briefing-muted)]">{description}</p>
    </div>
  )
}

function timelineDotClass(health: string) {
  if (health === 'Critical') return 'bg-danger'
  if (health === 'At Risk' || health === 'Watch') return 'bg-warning'
  return 'bg-brand'
}

function plural(word: string, count: number) {
  return count === 1 ? word : `${word}s`
}
