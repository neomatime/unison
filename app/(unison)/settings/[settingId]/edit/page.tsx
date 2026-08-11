import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ settingId: string }> }) {
  const { settingId } = await params
  return <ModuleForm module={moduleById.settings} mode="edit" recordId={settingId} />
}

