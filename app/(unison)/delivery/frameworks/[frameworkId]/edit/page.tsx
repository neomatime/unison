import { notFound } from 'next/navigation'

import { FrameworkForm } from '@/features/delivery/components/framework-form'
import { getFramework } from '@/features/delivery/queries/get-framework'
import { updateFrameworkAction } from '@/features/delivery/actions/update-framework'

export default async function Page({ params }: { params: Promise<{ frameworkId: string }> }) {
  const { frameworkId } = await params
  const framework = await getFramework(frameworkId)
  if (!framework) notFound()
  return <FrameworkForm mode="edit" framework={framework} action={updateFrameworkAction.bind(null, frameworkId)} />
}
