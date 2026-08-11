import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  return <ModuleForm module={moduleById.clients} mode="edit" recordId={clientId} />
}

