import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export type FrameworkSummary = {
  id: string
  name: string
  type: string | null
  version: string | null
  /** Unarchived phases. */
  phaseCount: number
  /** Unarchived projects, of any status. */
  projectCount: number
}

/**
 * Counts are tallied here rather than through PostgREST embeds because three
 * small selects are predictable and easy to reason about at this data size —
 * a tenant typically has around six frameworks and fifty phases.
 */
export async function listFrameworks(): Promise<FrameworkSummary[]> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [frameworks, phases, projects] = await Promise.all([
    supabase.from('frameworks').select('id, name, type, version')
      .eq('organization_id', organization.id).is('archived_at', null).order('name'),
    supabase.from('framework_phases').select('framework_id')
      .eq('organization_id', organization.id).is('archived_at', null),
    supabase.from('projects').select('framework_id')
      .eq('organization_id', organization.id).is('archived_at', null),
  ])
  if (frameworks.error) throw frameworks.error
  if (phases.error) throw phases.error
  if (projects.error) throw projects.error

  const phaseCounts = tally(phases.data ?? [])
  const projectCounts = tally(projects.data ?? [])

  return (frameworks.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    version: row.version,
    phaseCount: phaseCounts.get(row.id) ?? 0,
    projectCount: projectCounts.get(row.id) ?? 0,
  }))
}

function tally(rows: ReadonlyArray<{ framework_id: string | null }>) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.framework_id) continue
    counts.set(row.framework_id, (counts.get(row.framework_id) ?? 0) + 1)
  }
  return counts
}
