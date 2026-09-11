import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Link2,
  PlayCircle,
  Workflow,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { ContentPanel } from '@/components/ui/content-panel'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  getAutomationMetrics,
  getPlatformAutomationAccess,
  listAutomationRules,
  listAutomationRuns,
  listAutomationSchedules,
  listIntegrationConnections,
} from '../queries'
import type { AutomationRule, AutomationRunStatus, IntegrationConnection } from '../types'
import { AutomationSettingsNav } from './automation-nav'
import { AutomationControls, IntegrationControls, IntegrationSecretControl } from './platform-forms'

export async function IntegrationsPage() {
  const [connections, access] = await Promise.all([listIntegrationConnections(), getPlatformAutomationAccess()])
  const connected = connections.filter((connection) => connection.status === 'connected').length
  const errors = connections.filter((connection) => connection.status === 'error').length
  return <>
    <WorkspaceHeader category="Settings" title="Integrations" description="Connect external systems to authenticated UNISON event channels." action={access.canManage ? 'New integration' : undefined} actionHref={access.canManage ? '/settings/integrations/new' : undefined} />
    <AutomationSettingsNav />
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Connections" value={connections.length} detail="Tenant-owned integration endpoints" /><Metric label="Active" value={connected} detail="Enabled for inbound events" /><Metric label="Needs attention" value={errors} detail="Connections reporting an error" /></div>
    <section className="mt-5 overflow-hidden border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="unison-section-title text-sm">Connection register</h2><p className="mt-1 text-xs text-muted-foreground">Secrets remain masked after generation.</p></div></header>
      {connections.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="bg-muted/30 text-xs text-muted-foreground"><th className="px-5 py-3">Connection</th><th className="px-5 py-3">Provider</th><th className="px-5 py-3">Event key</th><th className="px-5 py-3">Last event</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{connections.map((connection) => <tr key={connection.id} className="border-t border-border"><td className="px-5 py-4"><Link href={`/settings/integrations/${connection.id}`} className="font-semibold hover:text-brand">{connection.name}</Link>{connection.lastError ? <p className="mt-1 max-w-sm truncate text-xs text-destructive">{connection.lastError}</p> : null}</td><td className="px-5 py-4 text-sm">{connection.provider}</td><td className="px-5 py-4"><code className="text-xs text-muted-foreground">{connection.eventKey}</code></td><td className="px-5 py-4 text-sm text-muted-foreground">{dateTime(connection.lastEventAt)}</td><td className="px-5 py-4"><ConnectionStatus status={connection.status} /></td></tr>)}</tbody></table></div> : <Empty icon={Link2} title="No integrations connected" description="Create an integration to receive external events and connect them to automation rules." href={access.canManage ? '/settings/integrations/new' : undefined} action="Create integration" />}
    </section>
  </>
}

export async function IntegrationDetailPage({ connection }: { connection: IntegrationConnection }) {
  const access = await getPlatformAutomationAccess()
  return <>
    <WorkspaceHeader category="Settings" parent={{ label: 'Integrations', href: '/settings/integrations' }} title={connection.name} description={`${connection.provider} integration connection`} />
    <AutomationSettingsNav />
    {access.canManage ? <div className="mb-5"><IntegrationControls connection={connection} /></div> : null}
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <ContentPanel title="Connection details"><dl className="divide-y divide-border"><Detail label="Provider" value={connection.provider} /><Detail label="Event key" value={connection.eventKey} code /><Detail label="Status" value={titleCase(connection.status)} /><Detail label="Last inbound event" value={dateTime(connection.lastEventAt)} /><Detail label="Last updated" value={dateTime(connection.updatedAt)} /></dl>{connection.lastError ? <div className="mt-4 flex gap-3 border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{connection.lastError}</div> : null}</ContentPanel>
      {access.canManage ? <IntegrationSecretControl connectionId={connection.id} secretHint={connection.secretHint} /> : <ContentPanel title="Inbound secret"><p className="text-sm text-muted-foreground">Only organization administrators can generate or rotate integration credentials.</p></ContentPanel>}
    </div>
  </>
}

export async function AutomationsPage() {
  const [rules, metrics, access] = await Promise.all([listAutomationRules(), getAutomationMetrics(), getPlatformAutomationAccess()])
  return <>
    <WorkspaceHeader category="Settings" title="Automations" description="Turn manual, scheduled, and integration events into persistent UNISON actions." action={access.canManage ? 'New automation' : undefined} actionHref={access.canManage ? '/settings/automations/new' : undefined} />
    <AutomationSettingsNav />
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Rules" value={rules.length} detail="Configured automation rules" /><Metric label="Active" value={metrics.activeRules} detail="Rules accepting triggers" /><Metric label="Runs (24h)" value={metrics.runsLast24Hours} detail="Real queued and completed runs" /></div>
    <section className="mt-5 overflow-hidden border border-border bg-card">
      <header className="border-b border-border px-5 py-4"><h2 className="unison-section-title text-sm">Automation register</h2><p className="mt-1 text-xs text-muted-foreground">Every execution is queued and retained in run history.</p></header>
      {rules.length ? <div className="divide-y divide-border">{rules.map((rule) => <Link key={rule.id} href={`/settings/automations/${rule.id}`} className="grid gap-3 px-5 py-4 transition-colors hover:bg-muted/25 md:grid-cols-[minmax(0,1fr)_9rem_8rem_7rem] md:items-center"><div><p className="font-semibold">{rule.name}</p><p className="mt-1 text-xs text-muted-foreground">{rule.description || `${titleCase(rule.triggerType)} trigger · Notification action`}</p></div><span className="text-sm text-muted-foreground">{rule.integrationName ?? 'UNISON'}</span><span className="text-sm tabular-nums text-muted-foreground">{rule.runCount} runs</span><RuleStatus status={rule.status} /></Link>)}</div> : <Empty icon={Workflow} title="No automation rules" description="Create the first rule to connect a manual, scheduled, or external event to a notification action." href={access.canManage ? '/settings/automations/new' : undefined} action="Create automation" />}
    </section>
  </>
}

export async function AutomationDetailPage({ rule }: { rule: AutomationRule }) {
  const access = await getPlatformAutomationAccess()
  return <>
    <WorkspaceHeader category="Settings" parent={{ label: 'Automations', href: '/settings/automations' }} title={rule.name} description={rule.description || 'Persistent automation rule'} />
    <AutomationSettingsNav />
    {access.canManage ? <div className="mb-5"><AutomationControls rule={rule} /></div> : null}
    <div className="grid gap-5 xl:grid-cols-2">
      <ContentPanel title="Rule configuration"><dl className="divide-y divide-border"><Detail label="Status" value={titleCase(rule.status)} /><Detail label="Trigger" value={titleCase(rule.triggerType)} /><Detail label="Integration" value={rule.integrationName ?? 'No external connection'} /><Detail label="Execution count" value={String(rule.runCount)} /><Detail label="Last run" value={dateTime(rule.lastRunAt)} /></dl></ContentPanel>
      <ContentPanel title="Notification action"><dl className="divide-y divide-border"><Detail label="Title" value={stringValue(rule.actionConfig.title) || '—'} /><Detail label="Category" value={stringValue(rule.actionConfig.category) || 'System'} /><Detail label="Message" value={stringValue(rule.actionConfig.body) || 'No message body'} /></dl></ContentPanel>
      {rule.schedule ? <ContentPanel title="Schedule" className="xl:col-span-2"><dl className="grid gap-4 sm:grid-cols-4"><CompactDetail label="Interval" value={duration(rule.schedule.intervalMinutes)} /><CompactDetail label="Timezone" value={rule.schedule.timezone} /><CompactDetail label="Next run" value={dateTime(rule.schedule.nextRunAt)} /><CompactDetail label="Last queued" value={dateTime(rule.schedule.lastEnqueuedAt)} /></dl></ContentPanel> : null}
    </div>
  </>
}

export async function JobsPage({ queued = false }: { queued?: boolean }) {
  const [metrics, schedules, runs] = await Promise.all([getAutomationMetrics(), listAutomationSchedules(), listAutomationRuns()])
  return <>
    <WorkspaceHeader category="Settings" title="Jobs & schedules" description="Observe durable automation execution, failures, retries, and upcoming scheduled work." />
    <AutomationSettingsNav />
    {queued ? <div role="status" className="mb-5 flex items-center gap-2 border border-success/25 bg-success-soft/40 px-4 py-3 text-sm text-success"><CheckCircle2 className="size-4" />Automation queued for background execution.</div> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Enabled schedules" value={metrics.enabledSchedules} detail="Eligible for background enqueue" /><Metric label="Runs (24h)" value={metrics.runsLast24Hours} detail="All triggers" /><Metric label="Successful (24h)" value={metrics.succeededLast24Hours} detail="Completed without error" /><Metric label="Failed (24h)" value={metrics.failedLast24Hours} detail="Require review or retry" /></div>
    <div className="mt-5 grid gap-5 2xl:grid-cols-[0.75fr_1.25fr]">
      <ContentPanel title="Upcoming schedules">{schedules.length ? <div className="divide-y divide-border">{schedules.map((schedule) => <div key={schedule.id} className="py-4 first:pt-1"><div className="flex items-center justify-between gap-3"><Link href={`/settings/automations/${schedule.ruleId}`} className="text-sm font-semibold hover:text-brand">{schedule.ruleName}</Link><StatusBadge tone={schedule.enabled ? 'brand' : 'neutral'}>{schedule.enabled ? 'Enabled' : 'Paused'}</StatusBadge></div><p className="mt-1 text-xs text-muted-foreground">Every {duration(schedule.intervalMinutes)} · {schedule.timezone}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="size-3.5" />Next: {dateTime(schedule.nextRunAt)}</p></div>)}</div> : <Empty icon={CalendarClock} title="No scheduled automations" description="Rules using a schedule trigger will appear here." />}</ContentPanel>
      <ContentPanel title="Run history">{runs.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="text-xs text-muted-foreground"><th className="pb-3">Automation</th><th className="pb-3">Trigger</th><th className="pb-3">Queued</th><th className="pb-3">Duration</th><th className="pb-3">Status</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id} className="border-t border-border"><td className="py-3 pr-4"><Link href={`/settings/automations/${run.ruleId}`} className="text-sm font-semibold hover:text-brand">{run.ruleName}</Link>{run.errorMessage ? <p className="mt-1 max-w-xs truncate text-xs text-destructive">{run.errorMessage}</p> : null}</td><td className="py-3 pr-4 text-xs text-muted-foreground">{titleCase(run.triggerType)}</td><td className="py-3 pr-4 text-xs text-muted-foreground">{dateTime(run.createdAt)}</td><td className="py-3 pr-4 text-xs tabular-nums text-muted-foreground">{runDuration(run.startedAt, run.completedAt)}</td><td className="py-3"><RunStatus status={run.status} /></td></tr>)}</tbody></table></div> : <Empty icon={Activity} title="No automation runs" description="Manual, scheduled, and integration-triggered executions will be recorded here." />}</ContentPanel>
    </div>
  </>
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) { return <article className="border border-border bg-card p-5"><p className="unison-metric-label text-[0.68rem] text-muted-foreground">{label}</p><p className="mt-3 font-brand text-2xl font-medium tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article> }
function Detail({ label, value, code = false }: { label: string; value: string; code?: boolean }) { return <div className="grid gap-1 py-3 text-sm sm:grid-cols-[10rem_1fr]"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{code ? <code>{value}</code> : value}</dd></div> }
function CompactDetail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div> }
function Empty({ icon: Icon, title, description, href, action }: { icon: typeof Link2; title: string; description: string; href?: string; action?: string }) { return <div className="px-6 py-12 text-center"><Icon className="mx-auto size-7 text-muted-foreground" /><h3 className="mt-4 font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>{href && action ? <Link href={href} className="mt-5 inline-flex bg-brand px-4 py-2 text-sm font-semibold text-white">{action}</Link> : null}</div> }
function ConnectionStatus({ status }: { status: IntegrationConnection['status'] }) { return <StatusBadge tone={status === 'connected' ? 'brand' : status === 'error' ? 'warning' : 'neutral'}>{titleCase(status)}</StatusBadge> }
function RuleStatus({ status }: { status: AutomationRule['status'] }) { return <StatusBadge tone={status === 'active' ? 'brand' : 'neutral'}>{titleCase(status)}</StatusBadge> }
function RunStatus({ status }: { status: AutomationRunStatus }) { const Icon = status === 'succeeded' ? CheckCircle2 : status === 'failed' ? XCircle : status === 'running' ? PlayCircle : Clock3; return <StatusBadge tone={status === 'succeeded' ? 'brand' : status === 'failed' ? 'warning' : 'neutral'}><Icon className="mr-1 size-3" />{titleCase(status)}</StatusBadge> }
function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function stringValue(value: unknown) { return typeof value === 'string' ? value : '' }
function dateTime(value: string | null) { return value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(value)) : 'Never' }
function duration(minutes: number) { if (minutes < 60) return `${minutes} minutes`; if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`; if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`; return `${minutes} minutes` }
function runDuration(start: string | null, end: string | null) { if (!start) return 'Waiting'; if (!end) return 'Running'; const elapsed = Math.max(0, new Date(end).valueOf() - new Date(start).valueOf()); return elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s` }
