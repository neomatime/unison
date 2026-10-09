import { notFound } from 'next/navigation'

import { ClientForm } from '@/features/clients/components/client-form'
import { getClient, listClientOwners } from '@/features/clients/queries/get-client'
import { updateClientAction } from '@/features/clients/actions/update-client'

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  const [client, owners] = await Promise.all([getClient(clientId), listClientOwners()])
  if (!client) notFound()
  return <ClientForm mode="edit" client={client} action={updateClientAction.bind(null, clientId)} owners={owners} />
}
