import 'server-only'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Candidates for a new dependency on `projectId`.
 *
 * Every picker on the add form is populated from here. There is no retention
 * logic, unlike form-options.ts: this form only ever creates, so every select
 * starts empty and there is no recorded value for a missing option to silently
 * overwrite. When an edit path is added, retention comes with it.
 */
export async function listDependencyFormOptions(projectId: string): Promise<{
  projects: { id: string; name: string; frameworkId: string }[]
  phases: { id: string; name: string; frameworkId: string; position: number }[]
  members: { id: string; name: string }[]
}> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [projectResult, phaseResult, members] = await Promise.all([
    // Unarchived projects, excluding this one -- self-dependency is refused, so
    // offering it would be offering a choice that cannot be saved.
    supabase.from('projects').select('id, name, framework_id')
      .eq('organization_id', organization.id).is('archived_at', null)
      .neq('id', projectId).order('name'),
    // Every unarchived phase in the organisation. The form filters client-side
    // by the chosen prerequisite's framework, the way ProjectForm already
    // filters phases when the framework changes.
    supabase.from('framework_phases').select('id, name, framework_id, position')
      .eq('organization_id', organization.id).is('archived_at', null)
      .order('position'),
    listOrganizationMembers(),
  ])
  if (projectResult.error) throw projectResult.error
  if (phaseResult.error) throw phaseResult.error

  return {
    projects: (projectResult.data ?? []).map((row) => ({ id: row.id, name: row.name, frameworkId: row.framework_id })),
    phases: (phaseResult.data ?? []).map((row) => ({ id: row.id, name: row.name, frameworkId: row.framework_id, position: row.position })),
    members: members.filter((member) => member.status === 'active')
      .map((member) => ({ id: member.userId, name: member.displayName })),
  }
}
