import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params
  return <ModuleForm module={moduleById.hr} mode="edit" recordId={recordId} />
}

