import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  return <ModuleForm module={moduleById.leads} mode="edit" recordId={leadId} />
}

