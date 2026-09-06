import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { selectClientOptions, selectFrameworkOptions, selectOwnerOptions, selectPhaseOptions } from '../form-options'

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
export async function listProjectFormOptions(
  current: {
    ownerId?: string | null
    clientId?: string | null
    phaseId?: string | null
    frameworkId?: string | null
  } = {},
): Promise<ProjectFormOptions> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [frameworks, phases, clients, members] = await Promise.all([
    // archived_at is selected and filtered in selectFrameworkOptions rather
    // than in SQL, because the project's own framework must survive the
    // filter when it has since been archived. Dropping it from the options
    // left the controlled <select> in ProjectForm with a value matching no
    // option, which a required select refuses to submit — see
    // selectFrameworkOptions for the full failure chain.
    supabase.from('frameworks').select('id, name, archived_at')
      .eq('organization_id', organization.id).order('name'),
    supabase.from('framework_phases').select('id, name, framework_id, archived_at')
      .eq('organization_id', organization.id).order('position'),
    // archived_at is selected and filtered in selectClientOptions rather than in
    // SQL, because the project's own client must survive the filter when it has
    // since been archived. Dropping it from the options silently nulled
    // client_id on the next edit.
    supabase.from('clients').select('id, name, archived_at')
      .eq('organization_id', organization.id).order('name'),
    listOrganizationMembers(),
  ])

  if (frameworks.error) throw frameworks.error
  if (phases.error) throw phases.error
  if (clients.error) throw clients.error

  return {
    frameworks: selectFrameworkOptions(frameworks.data ?? [], current.frameworkId),
    phases: selectPhaseOptions(
      (phases.data ?? []).map((row) => ({
        id: row.id, name: row.name, frameworkId: row.framework_id, archived_at: row.archived_at,
      })),
      current.phaseId,
    ),
    clients: selectClientOptions(clients.data ?? [], current.clientId),
    // Active members, plus this project's own owner when they have since been
    // removed — see selectOwnerOptions for why the second half is not optional.
    members: selectOwnerOptions(members, current.ownerId),
  }
}
