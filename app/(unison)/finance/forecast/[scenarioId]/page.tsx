import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params
  return <ModuleRecord module={moduleById.forecast} recordId={scenarioId} />
}

