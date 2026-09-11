import { notFound, redirect } from 'next/navigation'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { AutomationSettingsNav } from '@/features/platform-automation/components/automation-nav'
import { IntegrationForm } from '@/features/platform-automation/components/platform-forms'
import { getIntegrationConnection, getPlatformAutomationAccess } from '@/features/platform-automation/queries'

export default async function Page({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params
  const [connection, access] = await Promise.all([getIntegrationConnection(connectionId), getPlatformAutomationAccess()])
  if (!connection) notFound()
  if (!access.canManage) redirect(`/settings/integrations/${connection.id}`)
  return <><WorkspaceHeader category="Settings" parent={{ label: connection.name, href: `/settings/integrations/${connection.id}` }} title="Edit integration" description="Update the connection identity and inbound event key." /><AutomationSettingsNav /><IntegrationForm connection={connection} /></>
}
