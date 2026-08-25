import { ProvisioningWizard } from '@/features/internal-provisioning/components/provisioning-wizard'

export default async function Page({ params }: { params: Promise<{ provisioningId: string }> }) {
  const { provisioningId } = await params

  return <ProvisioningWizard provisioningId={provisioningId} />
}
