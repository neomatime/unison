import { OnboardingEditForm } from '@/features/delivery/components/onboarding-edit-form'

export default async function Page({ params }: { params: Promise<{ onboardingId: string }> }) {
  const { onboardingId } = await params
  return <OnboardingEditForm onboardingId={onboardingId} />
}
