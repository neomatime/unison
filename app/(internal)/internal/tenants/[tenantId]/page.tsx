import { TenantConfigurationPage } from '@/features/platform-admin/components/internal-screens'
import { getTenantConfiguration } from '@/features/platform-admin/queries'

export default async function Page({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params
  const record = await getTenantConfiguration(tenantId)
  return <TenantConfigurationPage {...record} />
}
