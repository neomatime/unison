import { OrganisationsScreen } from '@/features/internal-provisioning/components/internal-registers'
import { listOrganizations } from '@/features/internal-provisioning/queries/list-organizations'

export default async function Page() {
  const records = await listOrganizations()
  return <OrganisationsScreen records={records} />
}
