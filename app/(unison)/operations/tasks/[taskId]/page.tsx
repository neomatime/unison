import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  return <ModuleRecord module={moduleById.tasks} recordId={taskId} />
}

