import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ insightId: string }> }) {
  const { insightId } = await params
  return <ModuleRecord module={moduleById.atlas} recordId={insightId} />
}

