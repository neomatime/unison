import { PhaseSixForm } from '@/features/commercial-finance/components/phase-six-form'
import { getPhaseSixOptions } from '@/features/commercial-finance/queries/phase-six'

export default async function Page() {
  return <PhaseSixForm kind="lead" options={await getPhaseSixOptions()} />
}
