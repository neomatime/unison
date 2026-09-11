import { redirect } from 'next/navigation'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { AutomationSettingsNav } from '@/features/platform-automation/components/automation-nav'
import { AutomationRuleForm } from '@/features/platform-automation/components/platform-forms'
import { getPlatformAutomationAccess, listIntegrationConnections } from '@/features/platform-automation/queries'

export default async function Page() {
  const [integrations, access] = await Promise.all([listIntegrationConnections(), getPlatformAutomationAccess()])
  if (!access.canManage) redirect('/settings/automations')
  return <><WorkspaceHeader category="Settings" parent={{ label: 'Automations', href: '/settings/automations' }} title="New automation" description="Create a governed trigger and notification action." /><AutomationSettingsNav /><AutomationRuleForm integrations={integrations} /></>
}
