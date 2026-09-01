import { DeliveryOverviewScreen } from '@/features/delivery/components/delivery-overview-screen'
import { getDeliveryOverview } from '@/features/delivery/queries/delivery-overview'

export default async function Page() {
  const overview = await getDeliveryOverview()
  return <DeliveryOverviewScreen overview={overview} />
}
