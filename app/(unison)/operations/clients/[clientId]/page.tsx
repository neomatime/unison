import { notFound } from 'next/navigation'

import { ClientDetail } from '@/features/clients/components/client-detail'
import { getClient } from '@/features/clients/queries/get-client'
import { getRecordWorkspace } from '@/features/crm-workspace/queries/get-record-workspace'

export default async function Page({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { clientId } = await params
  const search = await searchParams
  const client = await getClient(clientId)
  if (!client) notFound()
  const workspace = await getRecordWorkspace('client', clientId)
  return <ClientDetail client={client} workspace={workspace} confirmArchive={search.confirm === 'archive'} archiveError={search.archiveError === '1'} />
}
