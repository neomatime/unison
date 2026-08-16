import { ModuleWorkspace } from '@/features/product-ui/components/module-workspace'
import { moduleFixtures } from '@/features/product-ui/mocks/modules'
import { moduleById } from '@/features/product-ui/registry'

export default function Page() {
  return <ModuleWorkspace module={moduleById.calendar} records={moduleFixtures.calendar ?? []} />
}
