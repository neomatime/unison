import { roles } from '@/config/roles'
import { canSendResetLink } from '@/features/auth-ui/password-policy'
import { mayChangeRole, mayChooseAdvanceRole, ADVANCE_ROLES } from '@/features/memberships/access-model'
import type { AccessRow } from '@/features/memberships/components/access-screen'
import { listAccessEntries } from '@/features/memberships/queries/list-access-entries'
import { AccessWorkspace } from '@/features/rights/components/access-workspace'
import type { ManagedUser } from '@/features/rights/components/rights-manager'
import { mayEditRights } from '@/features/rights/model'
import { listRightsData } from '@/features/rights/queries'
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

  // User rights: only Owners and Admins see them (the settings pages are closed to everyone else, and the database says the same).
  const { rights, audit } = canManage ? await listRightsData() : { rights: {}, audit: [] }
  const managed: ManagedUser[] = entries.map((entry) => ({
    key: entry.key,
    userId: entry.userId,
    email: entry.email,
    name: entry.name,
    roleId: entry.roleId,
    roleLabel: labelOf(entry.roleId),
    signedIn: entry.signedIn,
    editable: mayEditRights(role, user.id, entry.roleId, entry.userId),
    overrides: rights[entry.key]?.overrides ?? {},
    scopes: rights[entry.key]?.scopes ?? {},
    restrictions: rights[entry.key]?.restrictions ?? [],
  }))
  return <AccessWorkspace rows={rows} canManage={canManage} notice={directoryNotice} managed={managed} audit={audit} actorRole={String(role)} actorId={user.id} />
}
