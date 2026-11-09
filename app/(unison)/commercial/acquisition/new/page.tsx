import { WorkPage } from '@/components/shared/work-page'
import { getAcquisitionAdminData } from '@/features/prospect-engagement/admin-data'
import { NewLinkForm } from '@/features/prospect-engagement/components/new-link-form'

export default async function Page() {
  const data = await getAcquisitionAdminData()
  return <WorkPage category="Commercial" title="New engagement link" description="Create a non-sensitive, attributable public link and its QR assets." parent={{ label: 'Acquisition', href: '/commercial/acquisition' }}>{data.canManage ? <NewLinkForm members={data.members} versions={data.versions} /> : <p className="border border-border bg-card p-6 text-sm text-muted-foreground">Only owners and administrators can create acquisition links.</p>}</WorkPage>
}

