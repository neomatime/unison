import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  return <ModuleRecord module={moduleById.leads} recordId={leadId} />
}

