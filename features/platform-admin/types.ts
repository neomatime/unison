export type PlatformOrganization = {
  id: string
  name: string
  slug: string
  status: string
  tier: string
}

export type TenantConfiguration = {
  organization_id: string
  operating_model: string
  default_currency: string
  timezone: string
  data_region: string
  retention_days: number
  approval_escalation_hours: number
  evidence_required: boolean
  project_visibility: string
  strategic_objectives: string[]
  updated_at: string
}

export type PlatformSubscription = {
  id: string
  organization_id: string
  plan_key: string
  status: string
  billing_cycle: string
  seat_limit: number
  starts_on: string
  renews_on: string | null
  amount: number
  currency: string
  billing_email: string | null
  notes: string | null
  created_at: string
  updated_at: string
  organization_name?: string
}

export type SubscriptionEvent = {
  id: number
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

export type SupportCase = {
  id: string
  organization_id: string
  support_ticket_id: string | null
  case_number: number
  subject: string
  category: string
  priority: string
  status: string
  assignee_name: string | null
  sla_due_at: string | null
  internal_notes: string | null
  resolution: string | null
  created_at: string
  updated_at: string
  organization_name?: string
}

export type SupportTicketOption = {
  id: string
  organization_id: string
  ticket_number: number
  subject: string
  category: string
  priority: string
  status: string
  organization_name?: string
}

export type KnowledgeArticle = {
  id: string
  organization_id: string
  title: string
  slug: string
  summary: string | null
  content: string
  category: string
  visibility: string
  status: string
  tags: string[]
  version: number
  published_at: string | null
  created_at: string
  updated_at: string
}
