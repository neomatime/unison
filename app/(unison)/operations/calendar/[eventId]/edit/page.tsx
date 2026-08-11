import { ModuleForm } from '@/features/product-ui/components/module-form'
import { moduleById } from '@/features/product-ui/registry'

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <ModuleForm module={moduleById.calendar} mode="edit" recordId={eventId} />
}

