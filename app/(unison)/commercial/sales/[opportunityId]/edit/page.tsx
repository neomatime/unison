import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params
  return <ModuleForm module={moduleById.sales} mode="edit" recordId={opportunityId} />
}

