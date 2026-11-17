import { requireViewOrRedirect } from '@/features/rights/server'
import { PhaseFourRegister } from '@/features/operations/components/phase-four-register'

export default async function Page() {
  await requireViewOrRedirect('vendors')
  return <PhaseFourRegister kind="vendor" slim />
}
