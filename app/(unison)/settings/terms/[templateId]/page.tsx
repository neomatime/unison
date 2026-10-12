import { notFound } from 'next/navigation'

import { TermsTemplateScreen } from '@/features/terms/components/terms-template-screen'
import { isUuid } from '@/lib/utils'

export default async function Page({ params, searchParams }: { params: Promise<{ templateId: string }>; searchParams: Promise<{ version?: string | string[] }> }) {
  const { templateId } = await params
  const { version } = await searchParams
  if (!isUuid(templateId)) notFound()
  return <TermsTemplateScreen templateId={templateId} versionId={typeof version === 'string' && isUuid(version) ? version : undefined} />
}
