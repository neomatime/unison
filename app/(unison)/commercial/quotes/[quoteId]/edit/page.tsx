import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  return <ModuleForm module={moduleById.quotes} mode="edit" recordId={quoteId} />
}

