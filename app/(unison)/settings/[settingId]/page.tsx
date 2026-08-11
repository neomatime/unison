import { ModuleRecord } from '@/features/product-ui/components/module-record'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ settingId: string }> }) {
  const { settingId } = await params
  return <ModuleRecord module={moduleById.settings} recordId={settingId} />
}

