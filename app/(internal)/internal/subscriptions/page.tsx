import { SubscriptionRegister } from '@/features/platform-admin/components/internal-screens'
import { listPlatformSubscriptions } from '@/features/platform-admin/queries'

export default async function Page() {
  return <SubscriptionRegister records={await listPlatformSubscriptions()} />
}
