import { TenantConfigurationRegister } from '@/features/platform-admin/components/internal-screens'
import { listTenantConfigurations } from '@/features/platform-admin/queries'

export default async function Page() {
  return <TenantConfigurationRegister records={await listTenantConfigurations()} />
}
