import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  return <ModuleRecord module={moduleById.quotes} recordId={quoteId} />
}

