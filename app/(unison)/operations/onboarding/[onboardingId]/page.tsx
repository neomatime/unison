import { OnboardingDetailScreen } from '@/features/delivery/components/onboarding-detail-screen'

export default async function Page({ params }: { params: Promise<{ onboardingId:string }> }) { const { onboardingId } = await params; return <OnboardingDetailScreen onboardingId={onboardingId} /> }
