import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ insightId: string }> }) {
  const { insightId } = await params
  return <ModuleForm module={moduleById.atlas} mode="edit" recordId={insightId} />
}

