import type { DeliveryOverview } from '../queries/delivery-overview'
import {
  DeliveryHorizon,
  InterventionList,
  OverallPositionBrief,
} from './delivery-overview-components'
import { DeliveryBriefingHeader } from './delivery-briefing-header'

export function DeliveryOverviewScreen({ overview }: { overview: DeliveryOverview }) {
  const today = new Date().toISOString().slice(0, 10)
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${today}T00:00:00Z`))

  return (
    <>
      <DeliveryBriefingHeader dateTime={today} dateLabel={dateLabel} />
      <div className="space-y-4">
        <OverallPositionBrief overview={overview} />
        <InterventionList rows={overview.attention} />
        <DeliveryHorizon overview={overview} />
      </div>
    </>
  )
}
