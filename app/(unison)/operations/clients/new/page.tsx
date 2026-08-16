import { ClientForm } from '@/features/clients/components/client-form'
import { createClientAction } from '@/features/clients/actions/create-client'

export default function Page() {
  return <ClientForm mode="create" action={createClientAction} />
}
