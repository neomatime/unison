import { Quote } from 'lucide-react'

import { TopNav } from '@/components/layout/top-nav'
import { application } from '@/config/constants'
import { kpiCards } from '@/features/overview/data'
import { AtlasInsightsPanel } from './atlas-insights-panel'
import { AutomationStatusPanel } from './automation-status-panel'
import { ClientActivityPanel } from './client-activity-panel'
import { KpiCard } from './kpi-card'
import { PrioritiesPanel } from './priorities-panel'
import { ProjectsPanel } from './projects-panel'
import { RecentActivityPanel } from './recent-activity-panel'
import { ExecutiveSnapshots } from './executive-snapshots'

export function OverviewScreen() {
  return (
    <>
      <TopNav greeting="Good Morning, Neo." subtitle="Everything is in sync." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        {kpiCards.map((card) => (
          <div
            key={card.id}
            className={
              card.kind === 'gauge' || card.kind === 'trend'
                ? 'col-span-2 xl:col-span-1'
                : 'col-span-1'
            }
          >
            <KpiCard card={card} />
          </div>
        ))}
      </div>

      <ExecutiveSnapshots />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <PrioritiesPanel />
        <ProjectsPanel />
        <ClientActivityPanel />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <AtlasInsightsPanel />
        <AutomationStatusPanel />
        <RecentActivityPanel />
      </div>

      <footer className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-[0_1px_2px_0_rgb(16_32_46_/_0.04)]">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Quote className="size-4 text-muted-foreground/60" />
          {application.tagline}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-brand" />
          All systems operational
        </p>
      </footer>
    </>
  )
}
