import 'server-only'

import { entitledModuleIds } from '@/lib/auth/entitlement'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { currentYearMonth } from '../metrics'
import { normalizeActivity, normalizeKpis, normalizePipeline, normalizeRevenue } from '../normalize'
import type { CrmOverview, Section, TasksData } from '../types'
import { loadRelationshipOverview } from './get-relationship-overview'

/**
 * The organisation has no timezone setting, so reports use the platform default
 * that automation schedules already use. One constant, so adding the setting later
 * is a one-line change.
 */
export const REPORTING_TIME_ZONE = 'Africa/Johannesburg'

const OPEN_TASK_STATUSES = ['Backlog', 'Planned', 'In Progress', 'Blocked']
const TASK_LIMIT = 5

/**
 * Each section loads on its own and ends in `ready`, `unavailable` (the plan
 * excludes the module) or `error`. A throw here must never reach the page: one
 * broken query should blank one panel, not the dashboard.
 */
async function section<T>(label: string, load: () => Promise<T | null>): Promise<Section<T>> {
  try {
    const data = await load()
    return data === null ? { status: 'unavailable' } : { status: 'ready', data }
  } catch (error) {
    console.error(`[crm-overview] ${label} failed`, error)
    return { status: 'error' }
  }
}

async function call(db: any, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(name, args)
  if (error) throw error
  return data
}

async function loadTasks(db: any, organizationId: string, userId: string): Promise<TasksData> {
  const profiles = await db
    .from('team_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .is('archived_at', null)
  if (profiles.error) throw profiles.error
  const assigneeIds: string[] = (profiles.data ?? []).map((row: { id: string }) => row.id)
  if (assigneeIds.length === 0) return { linked: false, openCount: 0, tasks: [] }

  const result = await db
    .from('tasks')
    .select('id,title,priority,status,due_at,client_id,onboarding_id', { count: 'exact' })
    .eq('organization_id', organizationId)
    .in('assignee_id', assigneeIds)
    .is('archived_at', null)
    .in('status', OPEN_TASK_STATUSES)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(TASK_LIMIT)
  if (result.error) throw result.error
  const rows: Array<{ id: string; title: string; priority: string; status: string; due_at: string | null; client_id: string | null; onboarding_id: string | null }> = result.data ?? []
  if (typeof result.count !== 'number') throw new Error('crm-overview: the open task count was not returned')

  const clientIds = [...new Set(rows.map((row) => row.client_id).filter((id): id is string => Boolean(id)))]
  const onboardingIds = [...new Set(rows.map((row) => row.onboarding_id).filter((id): id is string => Boolean(id)))]
  const [clients, onboardings] = await Promise.all([
    clientIds.length
      ? db.from('clients').select('id,name').eq('organization_id', organizationId).in('id', clientIds)
      : Promise.resolve({ data: [], error: null }),
    onboardingIds.length
      ? db.from('client_onboardings').select('id,client_name').eq('organization_id', organizationId).in('id', onboardingIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (clients.error) throw clients.error
  if (onboardings.error) throw onboardings.error
  const clientNames = new Map<string, string>((clients.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]))
  const onboardingNames = new Map<string, string>((onboardings.data ?? []).map((row: { id: string; client_name: string }) => [row.id, row.client_name]))

  return {
    linked: true,
    openCount: result.count,
    tasks: rows.map((row) => {
      const clientName = row.client_id ? clientNames.get(row.client_id) : undefined
      const onboardingName = row.onboarding_id ? onboardingNames.get(row.onboarding_id) : undefined
      return {
        id: row.id,
        title: row.title,
        priority: row.priority,
        status: row.status,
        dueAt: row.due_at,
        related: clientName ?? (onboardingName ? `Onboarding: ${onboardingName}` : null),
      }
    }),
  }
}

export async function getCrmOverview(): Promise<CrmOverview> {
  const { organization, user } = await getSessionContext()
  const modules = await entitledModuleIds()
  const db = (await createServerSupabase()) as any
  const scope = { p_organization_id: organization.id, p_modules: modules }
  const timed = { ...scope, p_timezone: REPORTING_TIME_ZONE }

  const [kpis, pipeline, revenue, activity, tasks, relationships] = await Promise.all([
    section('kpis', async () => normalizeKpis(await call(db, 'crm_overview_kpis', timed))),
    section('pipeline', async () => normalizePipeline(await call(db, 'crm_overview_pipeline', timed))),
    section('revenue', async () => normalizeRevenue(await call(db, 'crm_overview_revenue', timed), currentYearMonth(REPORTING_TIME_ZONE))),
    section('activity', async () => normalizeActivity(await call(db, 'crm_overview_activity', { ...scope, p_limit: 8 }))),
    section('tasks', () => loadTasks(db, organization.id, user.id)),
    section('relationships', () => loadRelationshipOverview(db, organization.id, user.id)),
  ])

  return { kpis, pipeline, revenue, activity, tasks, relationships }
}
