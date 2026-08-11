import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  return <ModuleForm module={moduleById.team} mode="edit" recordId={employeeId} />
}

