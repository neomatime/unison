import { InternalTierChangePage } from '@/features/internal-provisioning/components/internal-action-pages'

export default async function Page({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params
  return <InternalTierChangePage source="tenants" recordId={tenantId} />
}
