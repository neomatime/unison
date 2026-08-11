import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default function Page() {
  return <ModuleForm module={moduleById.sales} mode="create" />
}

