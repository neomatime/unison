import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Link2,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'

import { HealthBadge } from './delivery-primitives'
import type { AttentionRow, DeliveryOverview, PhaseColumn } from '../overview-bands'

export function PortfolioHealthCard({ overview }: { overview: DeliveryOverview }) {
  const { activeProjects, healthCounts, portfolioHealth } = overview
  const narrative = portfolioNarrative(overview)
  const breakdown = [
    { label: 'Healthy', value: healthCounts['On track'], color: 'bg-success' },
    { label: 'Watch', value: healthCounts.Watch, color: 'bg-warning' },
    { label: 'At Risk', value: healthCounts['At Risk'], color: 'bg-danger' },
    { label: 'Critical', value: healthCounts.Critical, color: 'bg-red-800' },
    { label: 'Total Projects', value: activeProjects, color: 'bg-foreground' },
  ]

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(16_32_46_/_0.04)] md:col-span-3 xl:col-span-1">
      <header className="flex items-center justify-between gap-4 px-5 pt-4">
        <h2 className="text-base font-semibold text-foreground">Portfolio Health</h2>
        <Link href="/delivery/portfolio" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand/80">
          View portfolio <ArrowUpRight className="size-3.5" />
        </Link>
      </header>

      {portfolioHealth === null ? (
        <ExecutiveEmptyState
          title="No active projects yet"
          description="Create your first governed project to begin tracking portfolio health and lifecycle position."
          action="Create project"
          href="/operations/projects/new"
          compact
        />
      ) : (
        <div className="px-5 pt-3 pb-4">
          <div className="grid gap-4 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center">
            <PortfolioHealthRing value={portfolioHealth} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{narrative.title}</p>
              <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{narrative.description}</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-5">
            {breakdown.map((item) => (
              <div key={item.label} className="min-w-0 text-center sm:text-left">
                <dd className="text-lg font-bold tabular-nums text-foreground">{item.value}</dd>
                <dt className="mt-0.5 flex items-start justify-center gap-1.5 text-[0.625rem] leading-4 text-muted-foreground sm:justify-start">
                  <span aria-hidden="true" className={`mt-1 size-1.5 shrink-0 rounded-full ${item.color}`} />
                  <span>{item.label}</span>
                </dt>
              </div>
            ))}
          </dl>
        </div>
      )}
    </article>
  )
}

function PortfolioHealthRing({ value }: { value: number }) {
  const radius = 50
  const circumference = 2 * Math.PI * radius
  const filled = circumference * (value / 100)

  return (
    <div className="relative mx-auto size-32" aria-label={`${value}% of active projects are on track`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--muted)" strokeWidth="11" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--success)"
          strokeWidth="11"
          strokeLinecap="butt"
          strokeDasharray={`${filled} ${circumference - filled}`}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <strong className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}%</strong>
        <span className="mt-0.5 text-xs font-medium text-muted-foreground">On Track</span>
      </span>
    </div>
  )
}

function portfolioNarrative(overview: DeliveryOverview) {
  const { activeProjects, healthCounts } = overview
  const critical = healthCounts.Critical
  const atRisk = healthCounts['At Risk']
  const watch = healthCounts.Watch

  if (critical > 0) {
    return {
      title: 'Executive intervention is required',
      description: `${critical} critical ${plural('project', critical)} and ${atRisk} at-risk ${plural('project', atRisk)} need focused review across ${activeProjects} active ${plural('project', activeProjects)}.`,
    }
  }
  if (atRisk > 0) {
    return {
      title: 'Delivery needs focused attention',
      description: `${atRisk} at-risk ${plural('project', atRisk)} require review. The remaining portfolio is on track or being watched.`,
    }
  }
  if (watch > 0) {
    return {
      title: 'The portfolio is broadly controlled',
      description: `${watch} ${plural('project', watch)} remain on watch while no active project is currently marked At Risk or Critical.`,
    }
  }
  return {
    title: 'A strong delivery position',
    description: `All ${activeProjects} active ${plural('project', activeProjects)} are currently recorded as on track.`,
  }
}

function plural(word: string, count: number) {
  return count === 1 ? word : `${word}s`
}

export function ExecutiveMetricCard({
  title,
  value,
  description,
  footer,
  icon: Icon,
  href,
}: {
  title: string
  value: string | null
  description: string
  footer: string
  icon: LucideIcon
  href?: string
}) {
  const content = (
    <article className="flex h-full min-h-48 flex-col rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)] transition-colors hover:border-brand/25">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icon className="size-[1.125rem]" /></span>
        {href ? <ChevronRight className="size-4 text-brand" /> : null}
      </div>
      <h2 className="mt-3 text-sm font-semibold text-foreground">{title}</h2>
      <p className={`mt-2 font-bold tracking-tight text-foreground ${value === null ? 'text-xl' : 'text-3xl tabular-nums'}`}>{value ?? 'Not tracked'}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      <p className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-xs font-medium text-brand">
        <Clock3 className="size-3.5" />{footer}
      </p>
    </article>
  )

  return href ? <Link href={href} className="block h-full focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{content}</Link> : content
}

export function AttentionProjects({ rows }: { rows: AttentionRow[] }) {
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
      <header className="relative flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-danger">
        <div>
          <h2 className="text-base font-semibold text-foreground">Projects Requiring Attention</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rows.length > 0
              ? `${rows.length} active ${plural('project', rows.length)} are recorded as At Risk or Critical.`
              : 'Intervention signals across active delivery.'}
          </p>
        </div>
        <Link href="/operations/projects" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand/80">
          View all projects <ArrowUpRight className="size-3.5" />
        </Link>
      </header>

      {rows.length > 0 ? (
        <div className="divide-y divide-border">
          {rows.map((row) => <AttentionProjectRow key={row.id} row={row} />)}
        </div>
      ) : (
        <ExecutiveEmptyState
          title="Nothing currently requires intervention"
          description="All active projects are within their current recorded health thresholds."
          compact
        />
      )}
    </section>
  )
}

export function AttentionProjectRow({ row }: { row: AttentionRow }) {
  return (
    <Link
      href={`/operations/projects/${row.id}`}
      aria-label={`Review ${row.name}`}
      className="grid gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand md:grid-cols-[minmax(0,1fr)_minmax(175px,auto)] md:items-center lg:grid-cols-[minmax(220px,1.15fr)_auto_minmax(220px,1.1fr)_minmax(175px,0.7fr)_auto]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger"><BriefcaseBusiness className="size-[1.125rem]" /></span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{row.name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.client} · {row.framework} · {row.phase}</span>
        </span>
      </span>

      <span className="md:justify-self-start"><HealthBadge>{row.health}</HealthBadge></span>

      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{row.note ?? `${row.health} health assessment requires review`}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{row.note ? 'Latest project note' : 'No intervention reason has been recorded.'}</span>
      </span>

      <span className="flex items-center gap-2 border-border md:border-l md:pl-4">
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block text-[0.65rem] text-muted-foreground">Recorded next gate</span>
          <span className="block truncate text-xs font-semibold text-foreground">{row.nextGate ?? 'Not recorded'}</span>
          <span className="block text-[0.65rem] text-muted-foreground">Project target · {row.targetDateLabel}</span>
        </span>
      </span>

      <span className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap text-brand md:col-start-2 md:justify-self-start lg:col-start-auto">Review project <ArrowUpRight className="size-3.5" /></span>
    </Link>
  )
}

export function DeliveryLifecycleSummary({ columns, frameworkName }: { columns: PhaseColumn[]; frameworkName: string | null }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Delivery Lifecycle</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Active projects across the governed delivery lifecycle.</p>
        </div>
        {frameworkName ? <span className="text-xs font-medium text-muted-foreground">{frameworkName}</span> : null}
      </header>

      {columns.length > 0 ? (
        <div className="overflow-x-auto px-4 py-4">
          <ol className="grid min-w-[36rem] grid-flow-col auto-cols-fr gap-1.5" aria-label={`Project distribution across ${frameworkName ?? 'the delivery lifecycle'}`}>
            {columns.map((column) => {
              const riskCount = column.counts['At Risk'] + column.counts.Critical
              return (
                <li key={column.phase} className="flex min-w-0 items-stretch">
                  <div className="flex w-full min-w-0 flex-col items-center justify-center rounded-lg border border-border bg-muted/45 px-2 py-3 text-center">
                    <span className="max-w-24 truncate text-[0.6875rem] font-semibold text-foreground" title={column.phase}>{column.phase}</span>
                    <strong className="mt-1.5 text-xl font-bold tabular-nums text-foreground">{column.total}</strong>
                    <span className={`mt-1 text-[0.625rem] ${riskCount > 0 ? 'text-danger' : 'text-muted-foreground'}`}>
                      {riskCount > 0 ? `${riskCount} need attention` : column.total === 0 ? 'No projects' : 'Within threshold'}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      ) : (
        <ExecutiveEmptyState
          title="No active projects yet"
          description="Projects will appear here as they move through their framework phases."
          action="Go to projects"
          href="/operations/projects"
          compact
        />
      )}
    </section>
  )
}

export function UpcomingGovernance() {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Upcoming Governance</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Dated gates and decisions expected in the next 30 days.</p>
        </div>
        <Link href="/operations/projects" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand/80">
          Review projects <ArrowUpRight className="size-3.5" />
        </Link>
      </header>
      <ExecutiveEmptyState
        icon={CalendarClock}
        title="No dated governance events available"
        description="Project records can name a next gate, but dedicated gate dates and decision requirements are not currently recorded."
        compact
      />
    </section>
  )
}

export function ExecutiveEmptyState({
  title,
  description,
  action,
  href,
  icon: Icon = ClipboardCheck,
  compact = false,
}: {
  title: string
  description: string
  action?: string
  href?: string
  icon?: LucideIcon
  compact?: boolean
}) {
  return (
    <div className={`px-5 text-center ${compact ? 'py-5' : 'py-10'}`}>
      <span className="mx-auto flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-[1.125rem]" /></span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{description}</p>
      {action && href ? (
        <Link href={href} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand">
          {action} <ArrowUpRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  )
}

export const overviewMetricIcons = {
  decisions: ClipboardCheck,
  projectDates: CalendarDays,
  dependencies: Link2,
} as const
