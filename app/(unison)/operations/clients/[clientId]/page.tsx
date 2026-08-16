import { notFound } from 'next/navigation'

import { ClientDetail } from '@/features/clients/components/client-detail'
import { getClient } from '@/features/clients/queries/get-client'

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  const client = await getClient(clientId)
  if (!client) notFound()
  return <ClientDetail client={client} />
}
