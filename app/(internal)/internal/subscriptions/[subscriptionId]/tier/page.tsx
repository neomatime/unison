import { InternalTierChangePage } from '@/features/internal-provisioning/components/internal-action-pages'

export default async function Page({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params
  return <InternalTierChangePage source="subscriptions" recordId={subscriptionId} />
}
