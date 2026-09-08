import { notFound } from 'next/navigation'

import { SubscriptionEditPage } from '@/features/internal-provisioning/components/subscription-edit-page'
import { subscriptions } from '@/features/internal-provisioning/data'

export default async function Page({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params
  const subscription = subscriptions.find((item) => item.id === subscriptionId)
  if (!subscription) notFound()
  return <SubscriptionEditPage subscription={subscription} />
}
