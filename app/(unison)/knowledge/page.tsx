import { KnowledgeRegister } from '@/features/platform-admin/components/knowledge-screens'
import { canManageTenantKnowledge, listTenantKnowledgeArticles } from '@/features/platform-admin/queries'

export default async function Page() {
  const [records, canManage] = await Promise.all([listTenantKnowledgeArticles(), canManageTenantKnowledge()])
  return <KnowledgeRegister scope="tenant" records={records} canManage={canManage} />
}
