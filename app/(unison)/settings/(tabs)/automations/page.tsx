import { requireIntegrationsOrRedirect } from '@/features/rights/server'
import { AutomationsPage } from '@/features/platform-automation/components/platform-pages'

export default async function Page() {
  await requireIntegrationsOrRedirect()
  return <AutomationsPage />
}
