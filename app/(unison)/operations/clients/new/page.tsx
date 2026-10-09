import { ClientForm } from '@/features/clients/components/client-form'
import { createClientAction } from '@/features/clients/actions/create-client'
import { listClientOwners } from '@/features/clients/queries/get-client'

export default async function Page() {
  const owners = await listClientOwners()
  return <ClientForm mode="create" action={createClientAction} owners={owners} />
}
