export type IntegrationStatus = 'pending' | 'connected' | 'disabled' | 'error'
export type AutomationStatus = 'draft' | 'active' | 'paused'
export type AutomationTrigger = 'manual' | 'schedule' | 'integration_event'
export type AutomationRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type IntegrationConnection = {
  id: string
  name: string
  provider: string
  status: IntegrationStatus
  eventKey: string
  secretHint: string | null
  lastEventAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type AutomationRule = {
  id: string
  integrationConnectionId: string | null
  integrationName: string | null
  name: string
  description: string | null
  triggerType: AutomationTrigger
  triggerConfig: Record<string, unknown>
  actionConfig: Record<string, unknown>
  status: AutomationStatus
  runCount: number
  lastRunAt: string | null
  schedule: AutomationSchedule | null
  createdAt: string
  updatedAt: string
}

export type AutomationSchedule = {
  id: string
  ruleId: string
  ruleName: string
  intervalMinutes: number
  timezone: string
  nextRunAt: string
  enabled: boolean
  lastEnqueuedAt: string | null
}

export type AutomationRun = {
  id: string
  ruleId: string
  ruleName: string
  triggerType: AutomationTrigger
  status: AutomationRunStatus
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export type AutomationMetrics = {
  activeRules: number
  enabledSchedules: number
  runsLast24Hours: number
  succeededLast24Hours: number
  failedLast24Hours: number
  queuedLast24Hours: number
}
