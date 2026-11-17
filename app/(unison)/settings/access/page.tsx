import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { roles } from '@/config/roles'
import { canSendResetLink } from '@/features/auth-ui/password-policy'
import { AccessScreen, type AccessRow } from '@/features/memberships/components/access-screen'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { AutomationSettingsNav } from '@/features/platform-automation/components/automation-nav'
import { getSessionContext } from '@/lib/auth/get-session-context'

export default async function Page() {
  const [{ role, user }, members] = await Promise.all([getSessionContext(), listOrganizationMembers()])
  const canManage = role === 'owner' || role === 'admin'
  const rows: AccessRow[] = members
    .filter((member) => member.status === 'active')
    .map((member) => ({
      userId: member.userId,
      name: member.displayName,
      email: member.email,
      roleLabel: roles.find((candidate) => candidate.id === member.roleId)?.label ?? member.roleId,
      status: member.status,
      canReset: Boolean(member.email) && canSendResetLink(role, member.roleId) && member.userId !== user.id,
    }))
  return <>
    <WorkspaceHeader category="Settings" title="Users & access" description="Who has access to this workspace, and their passwords." />
    <AutomationSettingsNav />
    <AccessScreen rows={rows} canManage={canManage} />
  </>
}
