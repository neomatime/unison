import { KnowledgeEditor } from '@/features/platform-admin/components/knowledge-screens'
import { requireTenantKnowledgeAdministrator } from '@/features/platform-admin/authorization'

export default async function Page() {
  await requireTenantKnowledgeAdministrator()
  return <KnowledgeEditor scope="tenant" />
}
