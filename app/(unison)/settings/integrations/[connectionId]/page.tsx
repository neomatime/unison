import { notFound } from 'next/navigation'

import { IntegrationDetailPage } from '@/features/platform-automation/components/platform-pages'
import { getIntegrationConnection } from '@/features/platform-automation/queries'

export default async function Page({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params
  const connection = await getIntegrationConnection(connectionId)
  if (!connection) notFound()
  return <IntegrationDetailPage connection={connection} />
}
