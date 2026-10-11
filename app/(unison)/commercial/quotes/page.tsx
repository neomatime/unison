import { PhaseSixRegister } from '@/features/commercial-finance/components/phase-six-register'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <PhaseSixRegister kind="quote" searchParams={await searchParams} />
}
