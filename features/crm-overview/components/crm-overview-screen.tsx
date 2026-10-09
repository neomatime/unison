import type { CrmOverview } from '../types'
import { CrmOverviewHeader } from './crm-overview-header'
import { KpiCards } from './kpi-cards'
import { ErrorState, Panel, UnavailableState } from './panel'
import { MyTasks } from './my-tasks'
import { RecentActivity } from './recent-activity'
import { RevenueOverview } from './revenue-overview'
import { SalesPipeline } from './sales-pipeline'
import { MyClients } from './my-clients'
import { RelationshipPriorities } from './relationship-priorities'
import { DashboardPersonalizer } from './dashboard-personalizer'

function RevenuePanel({ revenue }: { revenue: CrmOverview['revenue'] }) {
  if (revenue.status === 'ready') return <RevenueOverview data={revenue.data} />
  return (
    <Panel title="Revenue overview" description="Sales booked (opportunities marked Won), not invoiced or collected cash.">
      {revenue.status === 'error' ? <ErrorState what="The revenue chart" /> : <UnavailableState module="Sales" />}
    </Panel>
  )
}

/**
 * The CRM Overview. A server component: every panel is fed by its own query result
 * and renders its own loading-failed or not-in-plan state, so one failing query
 * leaves the rest of the dashboard standing.
 */
export function CrmOverviewScreen({ overview }: { overview: CrmOverview }) {
  // The leads link only appears for a tenant whose plan includes Leads.
  const showLeadsLink = overview.kpis.status === 'ready' ? overview.kpis.data.leads !== null : true
  const sections = [
    { id: 'performance', label: 'CRM performance', content: <KpiCards kpis={overview.kpis} /> },
    { id: 'relationships', label: 'Relationship priorities and my clients', content: <div className="grid gap-4 xl:grid-cols-2"><RelationshipPriorities relationships={overview.relationships} /><MyClients relationships={overview.relationships} /></div> },
    { id: 'pipeline', label: 'Sales pipeline and revenue', content: <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"><SalesPipeline pipeline={overview.pipeline} showLeadsLink={showLeadsLink} /><RevenuePanel revenue={overview.revenue} /></div> },
    { id: 'activity', label: 'Recent activity and tasks', content: <div className="grid gap-4 xl:grid-cols-2"><RecentActivity activity={overview.activity} /><MyTasks tasks={overview.tasks} /></div> },
  ]
  return (
    <>
      <CrmOverviewHeader />
      <DashboardPersonalizer sections={sections} />
    </>
  )
}
