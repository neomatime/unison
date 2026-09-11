import { notFound } from 'next/navigation'

import { AutomationDetailPage } from '@/features/platform-automation/components/platform-pages'
import { getAutomationRule } from '@/features/platform-automation/queries'

export default async function Page({ params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await params
  const rule = await getAutomationRule(ruleId)
  if (!rule) notFound()
  return <AutomationDetailPage rule={rule} />
}
