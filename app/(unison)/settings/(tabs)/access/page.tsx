import { roles } from '@/config/roles'
import { canSendResetLink } from '@/features/auth-ui/password-policy'
import { mayChangeRole, mayChooseAdvanceRole, ADVANCE_ROLES } from '@/features/memberships/access-model'
import { AccessScreen, type AccessRow } from '@/features/memberships/components/access-screen'
import { listAccessEntries } from '@/features/memberships/queries/list-access-entries'
import { getSessionContext } from '@/lib/auth/get-session-context'

// The Users tab. The heading, organisation card and tab bar come from the settings layout.
export default async function Page() {
  const [{ role, user }, { entries, directoryNotice }] = await Promise.all([getSessionContext(), listAccessEntries()])
  const canManage = role === 'owner' || role === 'admin'
  const labelOf = (id: string) => roles.find((candidate) => candidate.id === id)?.label ?? id
  const rows: AccessRow[] = entries.map((entry) => ({
    key: entry.key,
    userId: entry.userId,
    name: entry.name,
    email: entry.email,
    roleId: entry.roleId,
    roleLabel: labelOf(entry.roleId),
    signedIn: entry.signedIn,
    chosenInAdvance: entry.chosenInAdvance,
    canReset: entry.signedIn && Boolean(entry.email) && canSendResetLink(role, entry.roleId) && entry.userId !== user.id,
    roleOptions: entry.userId
      ? (mayChangeRole(role, user.id, entry.userId) ? roles.map((candidate) => ({ id: candidate.id, label: candidate.label })) : [])
      : (ADVANCE_ROLES.filter((id) => mayChooseAdvanceRole(role, id)).map((id) => ({ id, label: labelOf(id) }))),
  }))
  return <AccessScreen rows={rows} canManage={canManage} notice={directoryNotice} />
}
