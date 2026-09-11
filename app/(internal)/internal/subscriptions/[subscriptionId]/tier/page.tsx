import { redirect } from 'next/navigation'

export default async function Page({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params
  redirect(`/internal/subscriptions/${subscriptionId}/edit`)
}
