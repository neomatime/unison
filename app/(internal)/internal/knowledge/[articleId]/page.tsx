import { KnowledgeDetail } from '@/features/platform-admin/components/knowledge-screens'
import { getInternalKnowledgeArticle } from '@/features/platform-admin/queries'

export default async function Page({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params
  return <KnowledgeDetail scope="internal" article={await getInternalKnowledgeArticle(articleId)} />
}
