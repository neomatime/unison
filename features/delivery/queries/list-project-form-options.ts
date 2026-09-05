import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'

export type ProjectFormOptions = {
  frameworks: Array<{ id: string; name: string }>
  phases: Array<{ id: string; name: string; frameworkId: string }>
  clients: Array<{ id: string; name: string }>
  members: Array<{ id: string; name: string }>
}

/**
 * Everything the project form's four pickers need, in one round trip each.
 *
 * Phases for every framework load together — six frameworks of roughly eight
 * phases is under fifty rows — and the form filters them client-side when the
 * framework changes. A round trip per change would cost more than the data.
 */
export async function listProjectFormOptions(): Promise<ProjectFormOptions> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [frameworks, phases, clients, members] = await Promise.all([
    // An archived framework must not be offered. archived_at was never filtered
    // here, so an archived framework's name still reached the register.
    supabase.from('frameworks').select('id, name')
      .eq('organization_id', organization.id).is('archived_at', null).order('name'),
    supabase.from('framework_phases').select('id, name, framework_id')
      .eq('organization_id', organization.id).order('position'),
    supabase.from('clients').select('id, name')
      .eq('organization_id', organization.id).is('archived_at', null).order('name'),
    listOrganizationMembers(),
  ])

  if (frameworks.error) throw frameworks.error
  if (phases.error) throw phases.error
  if (clients.error) throw clients.error

  return {
    frameworks: frameworks.data ?? [],
    phases: (phases.data ?? []).map((row) => ({ id: row.id, name: row.name, frameworkId: row.framework_id })),
    clients: clients.data ?? [],
    // Only active members are offered. An existing owner who has since been
    // removed still displays on the record; they are simply not a new choice.
    members: members.filter((member) => member.status === 'active')
      .map((member) => ({ id: member.userId, name: member.displayName })),
  }
}
