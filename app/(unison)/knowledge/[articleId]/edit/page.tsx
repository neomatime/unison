import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params
  return <ModuleForm module={moduleById.knowledge} mode="edit" recordId={articleId} />
}

