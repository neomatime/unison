import { requireViewOrRedirect } from '@/features/rights/server'
import { TermsListScreen } from '@/features/terms/components/terms-list-screen'

export default async function Page() {
  await requireViewOrRedirect('settings')
  return <TermsListScreen />
}
