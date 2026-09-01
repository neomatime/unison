import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import type { DeliveryOverview } from '../queries/delivery-overview'
import { HealthBadge, MetricGrid, SectionCard } from './delivery-primitives'
import { PhaseDistributionChart } from './phase-distribution-chart'

export function DeliveryOverviewScreen({ overview }: { overview: DeliveryOverview }) {
  const { activeProjects, atRisk, gatesDue, portfolioHealth, framework, columns, attention } = overview

  // Four figures, all of them derived from the projects table. The screen used to
  // show eight; approvals, blockers, requirements and go-lives have no table
  // behind them, and a number with nothing behind it is worse than its absence.
  const metrics = [
    ['Active projects', String(activeProjects), activeProjects === 1 ? '1 in delivery' : `${activeProjects} in delivery`],
    ['At risk', String(atRisk), atRisk === 0 ? 'Nothing flagged' : 'At Risk or Critical'],
    ['Gates due', String(gatesDue), 'Next 30 days'],
    // Null, not zero: with no active projects there is nothing to take a share of,
    // and 0% would read as "everything is failing".
    ['Portfolio health', portfolioHealth === null ? '—' : `${portfolioHealth}%`, 'Share on track'],
  ] as const

  return <>
    <WorkspaceHeader category="Delivery" title="Project Delivery Overview" description="Executive visibility across portfolio health, governance performance and delivery outcomes." />
    <MetricGrid items={metrics} />

    <SectionCard
      title="Delivery lifecycle"
      description={framework
        ? `Where active work sits across ${framework.name}, and where risk is concentrated.`
        : 'Where active work sits across the governed delivery lifecycle.'}
      className="mt-5"
      action={framework
        ? <span className="text-xs font-medium text-muted-foreground">{framework.name}</span>
        : undefined}
    >
      {columns.length > 0
        ? <PhaseDistributionChart columns={columns} frameworkName={framework?.name ?? 'the delivery lifecycle'} />
        : <EmptyLifecycle />}
    </SectionCard>

    <SectionCard
      title="Projects requiring attention"
      description="Active projects flagged At Risk or Critical, worst first."
      className="mt-5"
      action={<Link href="/operations/projects" className="inline-flex items-center gap-1 text-xs font-semibold text-brand">All projects <ArrowUpRight className="size-3.5" /></Link>}
    >
      {attention.length > 0
        ? <div className="divide-y divide-border">
            {attention.map((row) => (
              <Link key={row.id} href={`/operations/projects/${row.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-muted/25">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">{row.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{row.framework} · {row.phase}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{row.due}</span>
                  <HealthBadge>{row.health}</HealthBadge>
                </span>
              </Link>
            ))}
          </div>
        : <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nothing is flagged At Risk or Critical.
          </p>}
    </SectionCard>
  </>
}

/**
 * The empty state names the reason and the next action rather than showing an
 * axis with no bars, which reads as a broken chart rather than an empty one.
 */
function EmptyLifecycle() {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-semibold text-foreground">No active projects yet</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        The lifecycle fills in as projects are created and move through their framework&rsquo;s phases.
      </p>
      <Link href="/operations/projects" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand">
        Go to projects <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  )
}
