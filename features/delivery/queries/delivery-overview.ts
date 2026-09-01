import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  bandFor,
  type AttentionRow,
  type DeliveryOverview,
  type PhaseColumn,
} from '../overview-bands'

export type { AttentionRow, DeliveryOverview, PhaseColumn }

const GATE_WINDOW_DAYS = 30

export async function getDeliveryOverview(): Promise<DeliveryOverview> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, status, health, due_date, framework_id, frameworks(id, name), framework_phases(id, name, position)')
    .eq('organization_id', organization.id)
    .is('archived_at', null)
  if (error) throw error

  const rows = data ?? []
  const active = rows.filter((row) => row.status === 'Active')

  const horizon = new Date(Date.now() + GATE_WINDOW_DAYS * 86_400_000)
  const gatesDue = active.filter((row) => row.due_date && new Date(row.due_date) <= horizon).length
  const onTrack = active.filter((row) => bandFor(row.health) === 'On track').length

  // The lifecycle axis belongs to one framework: phases are defined per framework,
  // so "Initiate…Measure" and "Welcome…Go Live" are different vocabularies that
  // cannot share an axis. Chart whichever framework carries the most active work.
  const byFramework = new Map<string, { name: string; count: number }>()
  for (const row of active) {
    if (!row.frameworks) continue
    const entry = byFramework.get(row.frameworks.id) ?? { name: row.frameworks.name, count: 0 }
    entry.count += 1
    byFramework.set(row.frameworks.id, entry)
  }
  const leading = [...byFramework.entries()].sort((a, b) => b[1].count - a[1].count)[0]

  let framework: DeliveryOverview['framework'] = null
  let columns: PhaseColumn[] = []

  if (leading) {
    const [frameworkId, { name }] = leading
    framework = { id: frameworkId, name }

    // Every phase of the framework appears, including those holding nothing — an
    // empty column is the useful part of a distribution, not a gap to omit.
    const { data: phases, error: phaseError } = await supabase
      .from('framework_phases')
      .select('id, name, position')
      .eq('framework_id', frameworkId)
      .order('position', { ascending: true })
    if (phaseError) throw phaseError

    columns = (phases ?? []).map((phase) => {
      const counts: PhaseColumn['counts'] = { 'On track': 0, Watch: 0, 'At Risk': 0, Critical: 0 }
      let total = 0
      for (const row of active) {
        if (row.framework_phases?.id !== phase.id) continue
        counts[bandFor(row.health)] += 1
        total += 1
      }
      return { phase: phase.name, position: phase.position, total, counts }
    })
  }

  const attention: AttentionRow[] = active
    .filter((row) => row.health === 'At Risk' || row.health === 'Critical')
    // Critical before At Risk, then soonest gate first — the order an executive
    // would triage in.
    .sort((a, b) => {
      if (a.health !== b.health) return a.health === 'Critical' ? -1 : 1
      return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')
    })
    .map((row) => ({
      id: row.id,
      name: row.name,
      health: row.health,
      phase: row.framework_phases?.name ?? '—',
      framework: row.frameworks?.name ?? '—',
      due: row.due_date
        ? new Date(row.due_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—',
    }))

  return {
    activeProjects: active.length,
    atRisk: attention.length,
    gatesDue,
    portfolioHealth: active.length === 0 ? null : Math.round((onTrack / active.length) * 100),
    framework,
    columns,
    attention,
  }
}
