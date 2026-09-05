import { WorkspaceHeader } from '@/components/shared/workspace-header'
import type { DeliveryOverview } from '../queries/delivery-overview'
import {
  AttentionProjects,
  DeliveryLifecycleSummary,
  ExecutiveMetricCard,
  overviewMetricIcons,
  PortfolioHealthCard,
  UpcomingGovernance,
} from './delivery-overview-components'

export function DeliveryOverviewScreen({ overview }: { overview: DeliveryOverview }) {
  const { projectDatesDue, projectDatesDueThisWeek } = overview

  return (
    <>
      <WorkspaceHeader
        category="Delivery"
        title="Delivery"
        breadcrumbLabel="Overview"
        description="Portfolio health, governance and delivery intervention."
      />

      <section aria-label="Executive delivery summary" className="grid gap-3 md:grid-cols-3 xl:grid-cols-[2fr_repeat(3,minmax(0,1fr))]">
        <PortfolioHealthCard overview={overview} />
        <ExecutiveMetricCard
          title="Decisions Required"
          value={null}
          description="Decision records are not yet available from the current delivery model."
          footer="No decision register connected"
          icon={overviewMetricIcons.decisions}
        />
        <ExecutiveMetricCard
          title="Project Dates Due"
          value={String(projectDatesDue)}
          description="Active project target dates in the next 30 days."
          footer={projectDatesDueThisWeek === 0 ? 'Nothing due this week' : `${projectDatesDueThisWeek} due this week`}
          icon={overviewMetricIcons.projectDates}
          href="/operations/projects"
        />
        <ExecutiveMetricCard
          title="Critical Dependencies"
          value={null}
          description="Project dependencies are not yet represented in the current delivery model."
          footer="No dependency register connected"
          icon={overviewMetricIcons.dependencies}
        />
      </section>

      <AttentionProjects rows={overview.attention} />

      <div className="mt-4 grid gap-4 2xl:grid-cols-[1.05fr_0.95fr]">
        <DeliveryLifecycleSummary columns={overview.columns} frameworkName={overview.framework?.name ?? null} />
        <UpcomingGovernance />
      </div>
    </>
  )
}
