import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'
import type {
  AutomationMetrics,
  AutomationRule,
  AutomationRun,
  AutomationSchedule,
  IntegrationConnection,
} from './types'

async function tenantDatabase() {
  const { organization } = await getSessionContext()
  return { organization, db: (await createServerSupabase()) as any }
}

export async function getPlatformAutomationAccess() {
  const { role } = await getSessionContext()
  return { canManage: ['owner', 'admin'].includes(role.toLowerCase()) }
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function mapIntegration(row: any): IntegrationConnection {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    status: row.status,
    eventKey: row.event_key,
    secretHint: row.secret_hint,
    lastEventAt: row.last_event_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSchedule(row: any): AutomationSchedule {
  const rule = one<any>(row.automation_rules)
  return {
    id: row.id,
    ruleId: row.rule_id,
    ruleName: rule?.name ?? 'Deleted automation',
    intervalMinutes: row.interval_minutes,
    timezone: row.timezone,
    nextRunAt: row.next_run_at,
    enabled: row.enabled,
    lastEnqueuedAt: row.last_enqueued_at,
  }
}

function mapRule(row: any): AutomationRule {
  const connection = one<any>(row.integration_connections)
  const scheduleRow = one<any>(row.automation_schedules)
  return {
    id: row.id,
    integrationConnectionId: row.integration_connection_id,
    integrationName: connection?.name ?? null,
    name: row.name,
    description: row.description,
    triggerType: row.trigger_type,
    triggerConfig: row.trigger_config ?? {},
    actionConfig: row.action_config ?? {},
    status: row.status,
    runCount: row.run_count ?? 0,
    lastRunAt: row.last_run_at,
    schedule: scheduleRow ? mapSchedule({ ...scheduleRow, automation_rules: { name: row.name } }) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listIntegrationConnections(): Promise<IntegrationConnection[]> {
  const { organization, db } = await tenantDatabase()
  const { data, error } = await db.from('integration_connections').select('*')
    .eq('organization_id', organization.id).order('name')
  if (error) throw error
  return (data ?? []).map(mapIntegration)
}

export async function getIntegrationConnection(id: string): Promise<IntegrationConnection | null> {
  if (!isUuid(id)) return null
  const { organization, db } = await tenantDatabase()
  const { data, error } = await db.from('integration_connections').select('*')
    .eq('organization_id', organization.id).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapIntegration(data) : null
}

export async function listAutomationRules(): Promise<AutomationRule[]> {
  const { organization, db } = await tenantDatabase()
  const { data, error } = await db.from('automation_rules')
    .select('*,integration_connections(name),automation_schedules(*)')
    .eq('organization_id', organization.id).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRule)
}

export async function getAutomationRule(id: string): Promise<AutomationRule | null> {
  if (!isUuid(id)) return null
  const { organization, db } = await tenantDatabase()
  const { data, error } = await db.from('automation_rules')
    .select('*,integration_connections(name),automation_schedules(*)')
    .eq('organization_id', organization.id).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapRule(data) : null
}

export async function listAutomationSchedules(): Promise<AutomationSchedule[]> {
  const { organization, db } = await tenantDatabase()
  const { data, error } = await db.from('automation_schedules')
    .select('*,automation_rules(name)').eq('organization_id', organization.id)
    .order('next_run_at')
  if (error) throw error
  return (data ?? []).map(mapSchedule)
}

export async function listAutomationRuns(limit = 100): Promise<AutomationRun[]> {
  const { organization, db } = await tenantDatabase()
  const { data, error } = await db.from('automation_runs').select('*,automation_rules(name)')
    .eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 200))
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    ruleId: row.rule_id,
    ruleName: one<any>(row.automation_rules)?.name ?? 'Deleted automation',
    triggerType: row.trigger_type,
    status: row.status,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  }))
}

export async function getAutomationMetrics(): Promise<AutomationMetrics> {
  const { organization, db } = await tenantDatabase()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [rules, schedules, runs] = await Promise.all([
    db.from('automation_rules').select('id', { count: 'exact', head: true })
      .eq('organization_id', organization.id).eq('status', 'active'),
    db.from('automation_schedules').select('id', { count: 'exact', head: true })
      .eq('organization_id', organization.id).eq('enabled', true),
    db.from('automation_runs').select('status').eq('organization_id', organization.id).gte('created_at', since),
  ])
  for (const result of [rules, schedules, runs]) if (result.error) throw result.error
  const statuses = (runs.data ?? []).map((run: any) => run.status)
  return {
    activeRules: rules.count ?? 0,
    enabledSchedules: schedules.count ?? 0,
    runsLast24Hours: statuses.length,
    succeededLast24Hours: statuses.filter((status: string) => status === 'succeeded').length,
    failedLast24Hours: statuses.filter((status: string) => status === 'failed').length,
    queuedLast24Hours: statuses.filter((status: string) => status === 'queued' || status === 'running').length,
  }
}
