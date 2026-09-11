import { KnowledgeDetail } from '@/features/platform-admin/components/knowledge-screens'
import { canManageTenantKnowledge, getTenantKnowledgeArticle } from '@/features/platform-admin/queries'

export default async function Page({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params
  const [article, canManage] = await Promise.all([getTenantKnowledgeArticle(articleId), canManageTenantKnowledge()])
  return <KnowledgeDetail scope="tenant" article={article} canManage={canManage} />
}
