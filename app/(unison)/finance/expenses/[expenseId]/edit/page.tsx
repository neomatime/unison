import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ expenseId: string }> }) {
  const { expenseId } = await params
  return <ModuleForm module={moduleById.expenses} mode="edit" recordId={expenseId} />
}

