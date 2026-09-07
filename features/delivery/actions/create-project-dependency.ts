'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { projectDependencyInputSchema } from '../schemas/project-dependency'

export async function createProjectDependencyAction(
  dependentProjectId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const parsed = projectDependencyInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Refused here as well as by project_dependencies_no_self_check, because a
  // constraint violation is not a sentence a PM can act on.
  if (parsed.data.prerequisiteProjectId === dependentProjectId) {
    return { error: 'A project cannot be its own prerequisite.' }
  }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  // Read from the prerequisite rather than accept from the form:
  // project_dependencies_prerequisite_framework_fkey would refuse a mismatch
  // anyway, and a value the caller cannot influence is one fewer to validate.
  const { data: prerequisite, error: lookupError } = await supabase
    .from('projects').select('framework_id')
    .eq('id', parsed.data.prerequisiteProjectId).eq('organization_id', organization.id).maybeSingle()
  if (lookupError) return { error: 'The dependency could not be created.' }
  if (!prerequisite) return { error: 'That prerequisite project no longer exists, or is not yours.' }

  const { error } = await supabase.from('project_dependencies').insert({
    organization_id: organization.id,
    dependent_project_id: dependentProjectId,
    prerequisite_project_id: parsed.data.prerequisiteProjectId,
    prerequisite_framework_id: prerequisite.framework_id,
    relationship_type: 'Prerequisite',
    required_status: parsed.data.requiredStatus,
    required_phase_id: parsed.data.requiredPhaseId,
    dependency_owner_id: parsed.data.dependencyOwnerId,
    criticality: parsed.data.criticality,
    required_by_date: parsed.data.requiredByDate,
    notes: parsed.data.notes,
  }).select('id').single()

  // The cycle trigger raises check_violation with its own sentence. Surfacing
  // it as the generic message would hide the one refusal a PM most needs to
  // understand -- which is why §6's rules are worth naming individually.
  if (error?.message.includes('circular dependency')) {
    return { error: 'That dependency would create a circular dependency between projects.' }
  }
  if (error?.code === '23505') {
    return { error: 'That dependency already exists.' }
  }
  if (error) {
    return { error: 'The dependency could not be created. Check the prerequisite, required state and owner.' }
  }

  // Both ends of the edge change what they show: the dependent project gains
  // a row under "This project depends on", and the prerequisite gains one
  // under "Projects that depend on this". Revalidating only the dependent's
  // page would leave the prerequisite's page stale in the router cache.
  revalidatePath(`/operations/projects/${dependentProjectId}`)
  revalidatePath(`/operations/projects/${parsed.data.prerequisiteProjectId}`)
  return {}
}
