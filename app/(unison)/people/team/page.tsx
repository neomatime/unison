import { requireViewOrRedirect } from '@/features/rights/server'
import { PersistentTeamScreen } from '@/features/operations/components/phase-four-register'

export default async function Page() {
  await requireViewOrRedirect('team')
  return <PersistentTeamScreen />
}
