import { KnowledgeEditor } from '@/features/platform-admin/components/knowledge-screens'
import { requireTenantKnowledgeAdministrator } from '@/features/platform-admin/authorization'
import { getTenantKnowledgeArticle } from '@/features/platform-admin/queries'

export default async function Page({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params
  await requireTenantKnowledgeAdministrator()
  return <KnowledgeEditor scope="tenant" article={await getTenantKnowledgeArticle(articleId)} />
}
