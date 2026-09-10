import { PhaseFourDetail } from '@/features/operations/components/phase-four-detail'

export default async function Page({ params }: { params: Promise<{ onboardingId:string }> }) { const { onboardingId } = await params; return <PhaseFourDetail kind="onboarding" id={onboardingId} /> }
