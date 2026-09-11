import { SupportCasePage } from '@/features/platform-admin/components/internal-screens'
import { getSupportCase, listPlatformOrganizations } from '@/features/platform-admin/queries'

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const [supportCase, organizations] = await Promise.all([getSupportCase(caseId), listPlatformOrganizations()])
  return <SupportCasePage organizations={organizations} supportCase={supportCase} />
}
