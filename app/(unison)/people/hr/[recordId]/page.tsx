import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params
  return <ModuleRecord module={moduleById.hr} recordId={recordId} />
}

