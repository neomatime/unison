import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  return <ModuleRecord module={moduleById.team} recordId={employeeId} />
}

