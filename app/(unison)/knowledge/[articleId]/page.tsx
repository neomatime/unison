import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params
  return <ModuleRecord module={moduleById.knowledge} recordId={articleId} />
}

