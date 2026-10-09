import { CrmOverviewScreen } from '@/features/crm-overview/components/crm-overview-screen'
import { getCrmOverview } from '@/features/crm-overview/queries/get-crm-overview'

export default async function Page() {
  const overview = await getCrmOverview()
  return <CrmOverviewScreen overview={overview} />
}
