import { KnowledgeRegister } from '@/features/platform-admin/components/knowledge-screens'
import { listInternalKnowledgeArticles } from '@/features/platform-admin/queries'

export default async function Page() {
  return <KnowledgeRegister scope="internal" records={await listInternalKnowledgeArticles()} />
}
