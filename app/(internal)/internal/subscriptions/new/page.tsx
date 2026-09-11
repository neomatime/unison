import { SubscriptionPage } from '@/features/platform-admin/components/internal-screens'
import { listPlatformOrganizations } from '@/features/platform-admin/queries'

export default async function Page() {
  return <SubscriptionPage organizations={await listPlatformOrganizations()} />
}
