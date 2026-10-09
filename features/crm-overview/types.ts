// Shapes the CRM Overview passes from its queries to its screens. Plain types with
// no directive and no imports, so the server query, the client chart and the unit
// tests can all share them.

export type Money = { currency: string; amount: number }

/**
 * Every dashboard section loads on its own and ends in exactly one of these, so a
 * failure, a tenant plan that excludes the module, and a genuine zero can never be
 * mistaken for one another.
 */
export type Section<T> =
  | { status: 'ready'; data: T }
  | { status: 'unavailable' }
  | { status: 'error' }

export type ClientsKpi = { total: number; atPreviousMonthEnd: number }
export type LeadsKpi = { open: number; createdThisMonth: number }
export type QuotesKpi = { active: number; sent: number }
export type RevenueCurrencyKpi = { currency: string; yearToDate: number; previousYearToDate: number; deals: number }
export type RevenueKpi = { byCurrency: RevenueCurrencyKpi[]; wonWithoutDate: number }

/** A null member means the tenant's plan does not include that module. */
export type KpiData = {
  clients: ClientsKpi | null
  leads: LeadsKpi | null
  quotes: QuotesKpi | null
  revenue: RevenueKpi | null
}

export const OPEN_STAGES = ['Discovery', 'Qualified', 'Proposal', 'Negotiation'] as const
export type OpenStage = (typeof OPEN_STAGES)[number]

export type PipelinePreview = {
  id: string
  name: string
  clientName: string
  value: number
  currency: string
}
export type PipelineStage = { stage: OpenStage; count: number; totals: Money[]; previews: PipelinePreview[] }
export type PipelineWon = { count: number; totals: Money[]; previews: PipelinePreview[] }
export type PipelineData = { stages: PipelineStage[]; won: PipelineWon }

export type BucketRow = { key: string; currency: string; amount: number; deals: number }
export type RevenueChartData = {
  /** The reporting timezone's current calendar position, never the viewer's clock. */
  currentYear: number
  currentMonth: number
  wonByMonth: BucketRow[]
  wonThisMonthByWeek: BucketRow[]
  pipelineByMonth: BucketRow[]
  pipelineThisMonthByWeek: BucketRow[]
  pipelineNotCharted: { noCloseDate: number; pastCloseDate: number; nextYearOrLater: number }
}

export type ActivityEvent = {
  kind: string
  recordId: string
  title: string
  subtitle: string | null
  occurredAt: string
}

export type TaskRow = {
  id: string
  title: string
  priority: string
  status: string
  dueAt: string | null
  related: string | null
}
export type TasksData = {
  /** False when the signed-in user has no team profile, so nothing can be assigned to them. */
  linked: boolean
  openCount: number
  tasks: TaskRow[]
}

export type RelationshipPriority = {
  key: string
  clientId: string
  clientName: string
  title: string
  reason: string
  href: string
  actionLabel: string
  category: 'Follow-up' | 'Onboarding' | 'Invoice' | 'Quote' | 'Relationship'
  dueAt: string | null
}

export type MyClientRow = {
  id: string
  name: string
  status: string
  indicator: 'Strong' | 'Stable' | 'Needs Attention' | 'Insufficient Data'
  reason: string
  nextFollowUpAt: string | null
}

export type UpcomingClientMilestone = {
  id: string
  clientId: string
  clientName: string
  name: string
  type: string
  date: string
}

export type RelationshipOverviewData = {
  assigned: number
  active: number
  upcomingFollowUps: number
  requiringAttention: number
  clients: MyClientRow[]
  priorities: RelationshipPriority[]
  milestones: UpcomingClientMilestone[]
}

export type CrmOverview = {
  kpis: Section<KpiData>
  pipeline: Section<PipelineData>
  revenue: Section<RevenueChartData>
  activity: Section<ActivityEvent[]>
  tasks: Section<TasksData>
  relationships: Section<RelationshipOverviewData>
}
