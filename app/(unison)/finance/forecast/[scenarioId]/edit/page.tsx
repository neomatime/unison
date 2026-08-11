import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params
  return <ModuleForm module={moduleById.forecast} mode="edit" recordId={scenarioId} />
}

