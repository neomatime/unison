import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  return <ModuleRecord module={moduleById.clients} recordId={clientId} />
}

