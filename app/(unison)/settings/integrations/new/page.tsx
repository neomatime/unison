import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { AutomationSettingsNav } from '@/features/platform-automation/components/automation-nav'
import { IntegrationForm } from '@/features/platform-automation/components/platform-forms'

export default function Page() { return <><WorkspaceHeader category="Settings" parent={{ label: 'Integrations', href: '/settings/integrations' }} title="New integration" description="Create a secure event connection for an external system." /><AutomationSettingsNav /><IntegrationForm /></> }
