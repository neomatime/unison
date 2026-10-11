// Stated once for the server actions and the client forms. Plain constants with no
// directive. tests/unit/crm-workspace-vocabulary.test.ts reads the matching database
// checks and fails if these drift from them.

/** Matches the logged kinds in activities_kind_check and the activities_insert policy. */
export const LOGGED_ACTIVITY_KINDS = ['call', 'meeting', 'email', 'note'] as const

/** Written only by triggers and convert_lead. */
export const SYSTEM_ACTIVITY_KINDS = [
  'lead.converted',
  'client.created_from_lead',
  'opportunity.created_from_lead',
  'opportunity.stage_changed',
  'quote.sent',
  'quote.accepted',
  'quote.emailed',
  'invoice.emailed',
  'quote.invoiced',
  'payment.recorded',
  'payment.voided',
  'invoice.overdue',
  'billing.package_set',
  'billing.tier_changed',
  'billing.support_added',
  'billing.document_built',
] as const

/** Matches sales_opportunities_stage_check. */
export const OPPORTUNITY_STAGES = ['Discovery', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const

/** Matches tasks_priority_check. */
export const FOLLOW_UP_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const

export const ACTIVITY_LABELS: Record<string, string> = {
  call: 'Call',
  meeting: 'Meeting',
  email: 'Email',
  note: 'Note',
  'lead.converted': 'Lead converted',
  'client.created_from_lead': 'Client created',
  'opportunity.created_from_lead': 'Opportunity created',
  'opportunity.stage_changed': 'Stage changed',
  'quote.sent': 'Quote sent',
  'quote.accepted': 'Quote accepted',
  'quote.emailed': 'Quote emailed',
  'invoice.emailed': 'Invoice emailed',
  'quote.invoiced': 'Invoice created',
  'payment.recorded': 'Payment recorded',
  'payment.voided': 'Payment voided',
  'invoice.overdue': 'Invoice overdue',
  'billing.package_set': 'Package recorded',
  'billing.tier_changed': 'Tier changed',
  'billing.support_added': 'Support service recorded',
  'billing.document_built': 'Billing document built',
}
