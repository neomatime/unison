import { requireViewOrRedirect } from '@/features/rights/server'
import { PhaseFourRegister } from '@/features/operations/components/phase-four-register'

// ?view=board shows cards in a column per stage; anything else is the list register.
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireViewOrRedirect('onboarding')
  const { view } = await searchParams
  return <PhaseFourRegister kind="onboarding" slim view={view === 'board' ? 'board' : 'list'} />
}
