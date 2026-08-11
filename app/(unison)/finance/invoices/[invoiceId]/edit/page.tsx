import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  return <ModuleForm module={moduleById.invoices} mode="edit" recordId={invoiceId} />
}

