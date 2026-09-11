import { notFound, redirect } from 'next/navigation'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { AutomationSettingsNav } from '@/features/platform-automation/components/automation-nav'
import { AutomationRuleForm } from '@/features/platform-automation/components/platform-forms'
import { getAutomationRule, getPlatformAutomationAccess, listIntegrationConnections } from '@/features/platform-automation/queries'

export default async function Page({ params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await params
  const [rule, integrations, access] = await Promise.all([getAutomationRule(ruleId), listIntegrationConnections(), getPlatformAutomationAccess()])
  if (!rule) notFound()
  if (!access.canManage) redirect(`/settings/automations/${rule.id}`)
  return <><WorkspaceHeader category="Settings" parent={{ label: rule.name, href: `/settings/automations/${rule.id}` }} title="Edit automation" description="Update trigger, schedule, and notification behavior." /><AutomationSettingsNav /><AutomationRuleForm rule={rule} integrations={integrations} /></>
}
