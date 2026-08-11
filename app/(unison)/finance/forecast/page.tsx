import { ModuleWorkspace } from '@/features/product-ui/components/module-workspace'
import { moduleById } from '@/features/product-ui/registry'

export default function Page() {
  return <ModuleWorkspace module={moduleById.forecast} />
}

