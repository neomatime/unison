import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  return <ModuleForm module={moduleById.tasks} mode="edit" recordId={taskId} />
}

