import { DomainModuleWorkspace } from '@/features/product-ui/components/domain-module-workspace'
import { moduleFixtures } from '@/features/product-ui/mocks/modules'
import { moduleById } from '@/features/product-ui/registry'

export default function Page() {
  return <DomainModuleWorkspace module={moduleById.quotes} records={moduleFixtures.quotes ?? []} />
}
