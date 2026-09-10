import { PhaseFourForm } from '@/features/operations/components/phase-four-form'
import { getPhaseFourOptions } from '@/features/operations/queries/phase-four'

export default async function Page({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const { member } = await searchParams
  return <PhaseFourForm kind="assignment" options={await getPhaseFourOptions()} defaults={{ teamMemberId: member }} />
}
