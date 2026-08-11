import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return <ModuleRecord module={moduleById.projects} recordId={projectId} />
}

