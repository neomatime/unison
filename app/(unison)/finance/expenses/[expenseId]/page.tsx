import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ expenseId: string }> }) {
  const { expenseId } = await params
  return <ModuleRecord module={moduleById.expenses} recordId={expenseId} />
}

