import { notFound } from 'next/navigation'

import { PhaseFourForm } from '@/features/operations/components/phase-four-form'
import { getPhaseFourOptions, getPhaseFourRecord } from '@/features/operations/queries/phase-four'

export default async function Page({ params }: { params: Promise<{ onboardingId: string }> }) {
  const { onboardingId } = await params
  const [record, options] = await Promise.all([getPhaseFourRecord('onboarding', onboardingId), getPhaseFourOptions()])
  if (!record) notFound()
  return <PhaseFourForm kind="onboarding" record={record} options={options} />
}
