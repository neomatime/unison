import { notFound } from 'next/navigation'

import { FrameworkDetailScreen } from '@/features/delivery/components/framework-detail-screen'
import { getFramework } from '@/features/delivery/queries/get-framework'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function Page({ params }: { params: Promise<{ frameworkId: string }> }) {
  const { frameworkId } = await params
  // Postgres rejects a non-uuid before RLS is consulted, which would surface as
  // a 500 rather than a miss. A malformed id is a miss.
  if (!UUID.test(frameworkId)) notFound()

  const framework = await getFramework(frameworkId)
  if (!framework) notFound()

  return <FrameworkDetailScreen framework={framework} />
}
