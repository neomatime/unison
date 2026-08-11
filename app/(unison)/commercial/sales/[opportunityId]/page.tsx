import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params
  return <ModuleRecord module={moduleById.sales} recordId={opportunityId} />
}

