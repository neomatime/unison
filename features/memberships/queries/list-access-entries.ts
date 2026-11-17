import 'server-only'

import { buildAccessEntries, type AccessEntry } from '../access-model'
import { listOrganizationMembers } from './list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { listDirectoryPeople } from '@/lib/integrations/microsoft-directory'
import { createServerSupabase } from '@/lib/supabase/server'

export type AccessListing = { entries: AccessEntry[]; directoryNotice: string | null }

/**
 * Everyone who has access (members with a login) plus everyone in the HIMARK Microsoft 365 directory who has not signed in yet,
 * so an Owner or Admin can set their rights before they arrive. If the directory cannot be read the members are still listed.
 */
export async function listAccessEntries(): Promise<AccessListing> {
  const { organization, role } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const canSeePending = role === 'owner' || role === 'admin'
  const [members, org, hiddenRows, pendingRows] = await Promise.all([
    listOrganizationMembers(),
    db.from('organizations').select('email_domain').eq('id', organization.id).maybeSingle(),
    db.from('team_hidden_addresses').select('email').eq('organization_id', organization.id),
    canSeePending ? db.from('pending_access').select('email, role_id').eq('organization_id', organization.id) : Promise.resolve({ data: [] }),
  ])
  const directory = await listDirectoryPeople(org.data?.email_domain)
  const pending: Record<string, string> = {}
  for (const row of (pendingRows.data ?? []) as { email: string; role_id: string }[]) pending[row.email] = row.role_id
  return {
    entries: buildAccessEntries({
      members: members.map((member) => ({ userId: member.userId, name: member.displayName, email: member.email, roleId: member.roleId, status: member.status })),
      directory: directory.ok ? directory.people.map((person) => ({ name: person.name, email: person.email })) : [],
      hidden: ((hiddenRows.data ?? []) as { email: string }[]).map((row) => row.email),
      pending,
    }),
    directoryNotice: directory.ok ? null : 'The Microsoft directory could not be read, so only people who have signed in are listed. An administrator must grant UNISON the User.Read.All permission.',
  }
}
