import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { assessRelationship, recommendationKey, type RelationshipAssessment } from '../relationship-intelligence'

export type ClientContact = {
  id: string
  fullName: string
  jobTitle: string | null
  email: string | null
  phone: string | null
  relationshipRole: string
  preferredCommunication: string | null
  isPrimary: boolean
}

export type ClientInteraction = {
  id: string
  type: string
  occurredAt: string
  summary: string
  nextAction: string | null
  nextActionDueAt: string | null
  concernRecorded: boolean
  confidentiality: string
  contactName: string | null
  teamMemberName: string | null
}

export type ClientMilestone = {
  id: string
  name: string
  type: string
  date: string
  recurringAnnually: boolean
  notes: string | null
  status: string
}

export type RelatedRecord = {
  id: string
  title: string
  subtitle: string | null
  status: string
  href: string
  occurredAt?: string | null
  amount?: number
  currency?: string
}

export type ClientTimelineEvent = {
  id: string
  kind: string
  title: string
  description: string | null
  occurredAt: string
  href: string | null
}

export type ClientRecommendation = {
  key: string
  title: string
  reason: string
  href: string
  actionLabel: string
}

export type Client360 = {
  ownerName: string | null
  primaryContact: ClientContact | null
  lastInteractionAt: string | null
  nextFollowUp: RelatedRecord | null
  nextMeeting: RelatedRecord | null
  relationship: RelationshipAssessment
  contacts: ClientContact[]
  interactions: ClientInteraction[]
  milestones: ClientMilestone[]
  timeline: ClientTimelineEvent[]
  commercial: {
    leads: RelatedRecord[]
    opportunities: RelatedRecord[]
    quotes: RelatedRecord[]
    invoices: RelatedRecord[]
  }
  onboardings: RelatedRecord[]
  followUps: RelatedRecord[]
  documents: Array<{
    id: string
    displayName: string
    classification: string
    confidentiality: string
    fileSize: number
    version: number
    createdAt: string
    description: string | null
  }>
  recommendations: ClientRecommendation[]
}

const OPEN_TASKS = ['Backlog', 'Planned', 'In Progress', 'Blocked']
const OPEN_OPPORTUNITIES = ['Discovery', 'Qualified', 'Proposal', 'Negotiation']

const relation = <T>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] ?? null : value ?? null

export async function getClient360(clientId: string): Promise<Client360> {
  const { organization, user } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const org = organization.id

  const [clientResult, contactsResult, interactionsResult, onboardingsResult, tasksResult, eventsResult, opportunitiesResult, quotesResult, invoicesResult, documentsResult, milestonesResult, dismissalsResult] = await Promise.all([
    db.from('clients').select('id,name,contact_name,contact_email,contact_phone,owner_id,created_at,relationship_started_on').eq('organization_id', org).eq('id', clientId).maybeSingle(),
    db.from('client_contacts').select('*').eq('organization_id', org).eq('client_id', clientId).is('archived_at', null).order('is_primary', { ascending: false }).order('full_name'),
    db.from('client_interactions').select('*,client_contacts(full_name),team_members(full_name)').eq('organization_id', org).eq('client_id', clientId).is('archived_at', null).order('occurred_at', { ascending: false }),
    db.from('client_onboardings').select('id,client_name,stage,progress_percent,health,status,created_at,updated_at').eq('organization_id', org).eq('client_id', clientId).is('archived_at', null).order('created_at', { ascending: false }),
    db.from('tasks').select('id,title,description,status,priority,due_at,completed_at,created_at,updated_at').eq('organization_id', org).eq('client_id', clientId).is('archived_at', null).order('due_at', { ascending: true, nullsFirst: false }),
    db.from('calendar_events').select('id,title,event_type,start_at,status,created_at').eq('organization_id', org).eq('client_id', clientId).is('archived_at', null).order('start_at'),
    db.from('sales_opportunities').select('id,name,lead_id,stage,expected_value,currency,expected_close,won_at,created_at,updated_at').eq('organization_id', org).eq('client_id', clientId).is('archived_at', null).order('created_at', { ascending: false }),
    db.from('quotes').select('id,quote_number,status,total_amount,currency,valid_until,sent_at,accepted_at,created_at,updated_at').eq('organization_id', org).eq('client_id', clientId).is('archived_at', null).order('created_at', { ascending: false }),
    db.from('invoices').select('id,invoice_number,status,total_amount,balance_amount,currency,issue_date,due_date,paid_at,created_at,updated_at').eq('organization_id', org).eq('client_id', clientId).is('archived_at', null).order('created_at', { ascending: false }),
    db.from('documents').select('id,display_name,classification,confidentiality,file_size,version,created_at,description').eq('organization_id', org).eq('linked_record_type', 'clients').eq('linked_record_id', clientId).is('archived_at', null).order('created_at', { ascending: false }),
    db.from('client_milestones').select('*').eq('organization_id', org).eq('client_id', clientId).is('archived_at', null).order('milestone_date'),
    db.from('client_recommendation_dismissals').select('recommendation_key').eq('organization_id', org).eq('client_id', clientId).eq('dismissed_by', user.id),
  ])

  for (const result of [clientResult, contactsResult, interactionsResult, onboardingsResult, tasksResult, eventsResult, opportunitiesResult, quotesResult, invoicesResult, documentsResult, milestonesResult, dismissalsResult]) {
    if (result.error) throw result.error
  }
  const client = clientResult.data
  if (!client) throw new Error('Client not found')

  const opportunityRows: any[] = opportunitiesResult.data ?? []
  const leadIds = [...new Set(opportunityRows.map((row) => row.lead_id).filter(Boolean))]
  const [leadsResult, ownerResult] = await Promise.all([
    leadIds.length
      ? db.from('leads').select('id,company_name,status,estimated_value,currency,created_at,updated_at').eq('organization_id', org).in('id', leadIds).is('archived_at', null)
      : Promise.resolve({ data: [], error: null }),
    client.owner_id
      ? db.from('team_members').select('full_name').eq('organization_id', org).eq('user_id', client.owner_id).is('archived_at', null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (leadsResult.error) throw leadsResult.error
  if (ownerResult.error) throw ownerResult.error

  const contacts: ClientContact[] = (contactsResult.data ?? []).map((row: any) => ({
    id: row.id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    email: row.email,
    phone: row.phone,
    relationshipRole: row.relationship_role,
    preferredCommunication: row.preferred_communication,
    isPrimary: row.is_primary,
  }))
  const primaryContact = contacts.find((contact) => contact.isPrimary) ?? (client.contact_name ? {
    id: 'client-primary-contact',
    fullName: client.contact_name,
    jobTitle: null,
    email: client.contact_email,
    phone: client.contact_phone,
    relationshipRole: 'Primary Contact',
    preferredCommunication: null,
    isPrimary: true,
  } : null)

  const interactions: ClientInteraction[] = (interactionsResult.data ?? []).map((row: any) => ({
    id: row.id,
    type: row.interaction_type,
    occurredAt: row.occurred_at,
    summary: row.summary,
    nextAction: row.next_action,
    nextActionDueAt: row.next_action_due_at,
    concernRecorded: row.concern_recorded,
    confidentiality: row.confidentiality,
    contactName: relation<{ full_name: string }>(row.client_contacts)?.full_name ?? null,
    teamMemberName: relation<{ full_name: string }>(row.team_members)?.full_name ?? null,
  }))

  const now = new Date()
  const taskRows: any[] = tasksResult.data ?? []
  const openTasks = taskRows.filter((row) => OPEN_TASKS.includes(row.status))
  const overdueTasks = openTasks.filter((row) => row.due_at && new Date(row.due_at) < now)
  const onboardingRows: any[] = onboardingsResult.data ?? []
  const onboardingIssues = onboardingRows.filter((row) => row.status !== 'Complete' && (row.health === 'At Risk' || Number(row.progress_percent) < 100))
  const invoiceRows: any[] = invoicesResult.data ?? []
  const overdueInvoices = invoiceRows.filter((row) => row.status === 'Overdue' || (row.due_date && new Date(`${row.due_date}T23:59:59`) < now && Number(row.balance_amount) > 0 && !['Paid', 'Cancelled'].includes(row.status)))
  const lastInteractionAt = interactions[0]?.occurredAt ?? null
  const relationship = assessRelationship({
    lastInteractionAt,
    overdueFollowUps: overdueTasks.length,
    onboardingIssues: onboardingIssues.length,
    overdueInvoices: overdueInvoices.length,
    activeOpportunities: opportunityRows.filter((row) => OPEN_OPPORTUNITIES.includes(row.stage)).length,
    recordedConcerns: interactions.filter((row) => row.concernRecorded).length,
    completedInteractions: interactions.length,
  }, now)

  const relatedTask = (row: any): RelatedRecord => ({
    id: row.id, title: row.title, subtitle: row.description, status: row.status,
    href: `/operations/tasks/${row.id}`, occurredAt: row.due_at,
  })
  const opportunities: RelatedRecord[] = opportunityRows.map((row) => ({
    id: row.id, title: row.name, subtitle: row.expected_close ? `Expected close ${row.expected_close}` : null,
    status: row.stage, href: `/commercial/sales/${row.id}`, amount: Number(row.expected_value), currency: row.currency,
    occurredAt: row.won_at ?? row.created_at,
  }))
  const quotes: RelatedRecord[] = (quotesResult.data ?? []).map((row: any) => ({
    id: row.id, title: row.quote_number, subtitle: row.valid_until ? `Valid until ${row.valid_until}` : null,
    status: row.status, href: `/commercial/quotes/${row.id}`, amount: Number(row.total_amount), currency: row.currency,
    occurredAt: row.sent_at ?? row.created_at,
  }))
  const invoices: RelatedRecord[] = invoiceRows.map((row) => ({
    id: row.id, title: row.invoice_number, subtitle: row.due_date ? `Due ${row.due_date}` : null,
    status: row.status, href: `/finance/invoices/${row.id}`, amount: Number(row.total_amount), currency: row.currency,
    occurredAt: row.issue_date ?? row.created_at,
  }))
  const leads: RelatedRecord[] = (leadsResult.data ?? []).map((row: any) => ({
    id: row.id, title: row.company_name, subtitle: null, status: row.status,
    href: `/commercial/leads/${row.id}`, amount: Number(row.estimated_value), currency: row.currency,
    occurredAt: row.created_at,
  }))
  const onboardings: RelatedRecord[] = onboardingRows.map((row) => ({
    id: row.id, title: row.client_name, subtitle: `${row.progress_percent}% complete · ${row.stage}`,
    status: row.status, href: `/operations/onboarding/${row.id}`, occurredAt: row.created_at,
  }))

  const timeline: ClientTimelineEvent[] = [
    { id: `client-${client.id}`, kind: 'Client', title: 'Client relationship created', description: client.name, occurredAt: client.created_at, href: null },
    ...interactions.map((row) => ({ id: `interaction-${row.id}`, kind: row.type, title: row.type, description: row.summary, occurredAt: row.occurredAt, href: null })),
    ...onboardingRows.map((row) => ({ id: `onboarding-${row.id}`, kind: 'Onboarding', title: row.status === 'Complete' ? 'Onboarding completed' : 'Onboarding started', description: row.stage, occurredAt: row.status === 'Complete' ? row.updated_at : row.created_at, href: `/operations/onboarding/${row.id}` })),
    ...quotes.map((row) => ({ id: `quote-${row.id}`, kind: 'Quote', title: `Quote ${row.status.toLowerCase()}`, description: row.title, occurredAt: row.occurredAt!, href: row.href })),
    ...opportunities.map((row) => ({ id: `sale-${row.id}`, kind: 'Sale', title: row.status === 'Won' ? 'Sale completed' : 'Opportunity created', description: row.title, occurredAt: row.occurredAt!, href: row.href })),
    ...invoices.map((row) => ({ id: `invoice-${row.id}`, kind: 'Invoice', title: 'Invoice issued', description: row.title, occurredAt: row.occurredAt!, href: row.href })),
    ...taskRows.filter((row) => row.completed_at).map((row) => ({ id: `task-${row.id}`, kind: 'Follow-up', title: 'Follow-up completed', description: row.title, occurredAt: row.completed_at, href: `/operations/tasks/${row.id}` })),
  ].filter((row) => Boolean(row.occurredAt)).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  const dismissed = new Set<string>((dismissalsResult.data ?? []).map((row: any) => row.recommendation_key))
  const recommendations: ClientRecommendation[] = []
  for (const row of overdueTasks) recommendations.push({
    key: recommendationKey('overdue-follow-up', row.id), title: 'Complete the overdue follow-up',
    reason: `${row.title} is past its due date.`, href: `/operations/tasks/${row.id}`, actionLabel: 'Open task',
  })
  for (const row of overdueInvoices) recommendations.push({
    key: recommendationKey('overdue-invoice', row.id), title: 'Review the overdue invoice',
    reason: `${row.invoice_number} has an outstanding balance of ${row.currency} ${Number(row.balance_amount).toLocaleString('en-ZA')}.`,
    href: `/finance/invoices/${row.id}`, actionLabel: 'Open invoice',
  })
  for (const row of onboardingIssues) recommendations.push({
    key: recommendationKey('onboarding-review', row.id), title: 'Review the onboarding process',
    reason: `${row.progress_percent}% is complete and the current health is ${row.health}.`,
    href: `/operations/onboarding/${row.id}`, actionLabel: 'Open onboarding',
  })
  for (const row of (quotesResult.data ?? []).filter((quote: any) => quote.status === 'Sent' && quote.sent_at && now.getTime() - new Date(quote.sent_at).getTime() >= 7 * 86_400_000)) recommendations.push({
    key: recommendationKey('quote-follow-up', row.id), title: 'Follow up on the quotation',
    reason: `${row.quote_number} has been awaiting a response for at least seven days.`,
    href: `/commercial/quotes/${row.id}`, actionLabel: 'Open quote',
  })

  const upcomingEvents: any[] = (eventsResult.data ?? []).filter((row: any) => !['Cancelled', 'Complete'].includes(row.status) && new Date(row.start_at) >= now)
  return {
    ownerName: ownerResult.data?.full_name ?? null,
    primaryContact,
    lastInteractionAt,
    nextFollowUp: openTasks.find((row) => row.due_at) ? relatedTask(openTasks.find((row) => row.due_at)) : null,
    nextMeeting: upcomingEvents[0] ? { id: upcomingEvents[0].id, title: upcomingEvents[0].title, subtitle: upcomingEvents[0].event_type, status: upcomingEvents[0].status, href: `/operations/calendar/${upcomingEvents[0].id}`, occurredAt: upcomingEvents[0].start_at } : null,
    relationship,
    contacts,
    interactions,
    milestones: (milestonesResult.data ?? []).map((row: any) => ({ id: row.id, name: row.name, type: row.milestone_type, date: row.milestone_date, recurringAnnually: row.recurring_annually, notes: row.notes, status: row.status })),
    timeline,
    commercial: { leads, opportunities, quotes, invoices },
    onboardings,
    followUps: taskRows.map(relatedTask),
    documents: (documentsResult.data ?? []).map((row: any) => ({ id: row.id, displayName: row.display_name, classification: row.classification, confidentiality: row.confidentiality, fileSize: Number(row.file_size), version: row.version, createdAt: row.created_at, description: row.description })),
    recommendations: recommendations.filter((row) => !dismissed.has(row.key)).slice(0, 8),
  }
}
