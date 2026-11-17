import { requireViewOrRedirect } from '@/features/rights/server'
import { CrmOverviewScreen } from '@/features/crm-overview/components/crm-overview-screen'
import { getCrmOverview } from '@/features/crm-overview/queries/get-crm-overview'
import { getMarketIntelligence } from '@/features/market-intelligence/queries/get-market-intelligence'

export default async function Page() {
  await requireViewOrRedirect('overview')
  const [overview, market] = await Promise.all([getCrmOverview(), getMarketIntelligence()])
  return <CrmOverviewScreen overview={overview} market={market} />
}
