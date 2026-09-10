import { PhaseFourForm } from '@/features/operations/components/phase-four-form'
import { getPhaseFourOptions } from '@/features/operations/queries/phase-four'

export default async function Page() {
  return <PhaseFourForm kind="team-member" options={await getPhaseFourOptions()} />
}
