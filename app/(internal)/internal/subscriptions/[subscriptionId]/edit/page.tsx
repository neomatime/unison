import { SubscriptionPage } from '@/features/platform-admin/components/internal-screens'
import { getPlatformSubscription, listPlatformOrganizations } from '@/features/platform-admin/queries'

export default async function Page({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params
  const [record, organizations] = await Promise.all([getPlatformSubscription(subscriptionId), listPlatformOrganizations()])
  return <SubscriptionPage organizations={organizations} {...record} />
}
