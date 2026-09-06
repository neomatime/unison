import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export type FrameworkPhase = {
  id: string
  name: string
  position: number
  archivedAt: string | null
  /** Unarchived projects currently in this phase. */
  projectCount: number
}

export type FrameworkProject = {
  id: string
  name: string
  status: string
  health: string
  phase: string | null
}

export type FrameworkDetail = {
  id: string
  name: string
  type: string | null
  version: string | null
  archivedAt: string | null
  /** Every phase, archived included, in stored order. */
  phases: FrameworkPhase[]
  projects: FrameworkProject[]
}

/**
 * Org-scoped, so "belongs to another organisation" and "does not exist" both
 * arrive as null and both mean 404 — the same rule getProject follows.
 *
 * Archived frameworks ARE returned: the register hides them, but the detail
 * page is where one is unarchived, so it must be reachable by URL.
 */
export async function getFramework(frameworkId: string): Promise<FrameworkDetail | null> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data: framework, error } = await supabase
    .from('frameworks')
    .select('id, name, type, version, archived_at')
    .eq('id', frameworkId)
    .eq('organization_id', organization.id)
    .maybeSingle()
  if (error) throw error
  if (!framework) return null

  const [phases, projects] = await Promise.all([
    supabase.from('framework_phases').select('id, name, position, archived_at')
      .eq('framework_id', frameworkId).eq('organization_id', organization.id)
      .order('position', { ascending: true }),
    supabase.from('projects').select('id, name, status, health, phase_id, framework_phases(name)')
      .eq('framework_id', frameworkId).eq('organization_id', organization.id)
      .is('archived_at', null).order('name'),
  ])
  if (phases.error) throw phases.error
  if (projects.error) throw projects.error

  const projectsByPhase = new Map<string, number>()
  for (const row of projects.data ?? []) {
    if (!row.phase_id) continue
    projectsByPhase.set(row.phase_id, (projectsByPhase.get(row.phase_id) ?? 0) + 1)
  }

  return {
    id: framework.id,
    name: framework.name,
    type: framework.type,
    version: framework.version,
    archivedAt: framework.archived_at,
    phases: (phases.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      archivedAt: row.archived_at,
      projectCount: projectsByPhase.get(row.id) ?? 0,
    })),
    projects: (projects.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      health: row.health,
      phase: row.framework_phases?.name ?? null,
    })),
  }
}
