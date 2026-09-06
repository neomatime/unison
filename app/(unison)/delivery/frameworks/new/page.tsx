import { FrameworkForm } from '@/features/delivery/components/framework-form'
import { createFrameworkAction } from '@/features/delivery/actions/create-framework'

export default function Page() {
  return <FrameworkForm mode="create" action={createFrameworkAction} />
}
