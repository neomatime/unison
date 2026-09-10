import { PhaseSixForm } from '@/features/commercial-finance/components/phase-six-form'
import { getPhaseSixOptions } from '@/features/commercial-finance/queries/phase-six'

export default async function Page() {
  return <PhaseSixForm kind="forecast" options={await getPhaseSixOptions()} />
}
