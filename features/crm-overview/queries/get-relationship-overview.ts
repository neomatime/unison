import 'server-only'

import { assessRelationship, recommendationKey } from '@/features/clients/relationship-intelligence'
import type { RelationshipOverviewData, RelationshipPriority } from '../types'

const OPEN_TASKS = ['Backlog', 'Planned', 'In Progress', 'Blocked']
const OPEN_OPPORTUNITIES = ['Discovery', 'Qualified', 'Proposal', 'Negotiation']
const day = 86_400_000

function nextMilestoneDate(value: string, recurring: boolean, now: Date): string {
  if (!recurring) return value
  const original = new Date(`${value}T12:00:00Z`)
  let candidate = new Date(Date.UTC(now.getUTCFullYear(), original.getUTCMonth(), original.getUTCDate(), 12))
  if (candidate < now) candidate = new Date(Date.UTC(now.getUTCFullYear() + 1, original.getUTCMonth(), original.getUTCDate(), 12))
  return candidate.toISOString().slice(0, 10)
}

export async function loadRelationshipOverview(db: any, organizationId: string, userId: string): Promise<RelationshipOverviewData> {
  const clientsResult = await db.from('clients').select('id,name,status').eq('organization_id', organizationId).eq('owner_id', userId).is('archived_at', null).order('name')
  if (clientsResult.error) throw clientsResult.error
  const clients: Array<{ id: string; name: string; status: string }> = clientsResult.data ?? []
  if (!clients.length) return { assigned: 0, active: 0, upcomingFollowUps: 0, requiringAttention: 0, clients: [], priorities: [], milestones: [] }
  const ids = clients.map((client) => client.id)
  const now = new Date()
  const [interactions, tasks, onboardings, invoices, opportunities, quotes, milestones, dismissals] = await Promise.all([
    db.from('client_interactions').select('id,client_id,occurred_at,concern_recorded').eq('organization_id', organizationId).in('client_id', ids).is('archived_at', null),
    db.from('tasks').select('id,client_id,title,status,due_at').eq('organization_id', organizationId).in('client_id', ids).is('archived_at', null).in('status', OPEN_TASKS),
    db.from('client_onboardings').select('id,client_id,client_name,progress_percent,health,status').eq('organization_id', organizationId).in('client_id', ids).is('archived_at', null),
    db.from('invoices').select('id,client_id,invoice_number,status,due_date,balance_amount,currency').eq('organization_id', organizationId).in('client_id', ids).is('archived_at', null),
    db.from('sales_opportunities').select('id,client_id,stage').eq('organization_id', organizationId).in('client_id', ids).is('archived_at', null),
    db.from('quotes').select('id,client_id,quote_number,status,sent_at').eq('organization_id', organizationId).in('client_id', ids).is('archived_at', null),
    db.from('client_milestones').select('id,client_id,name,milestone_type,milestone_date,recurring_annually,status').eq('organization_id', organizationId).in('client_id', ids).is('archived_at', null).eq('status', 'Upcoming'),
    db.from('client_recommendation_dismissals').select('recommendation_key').eq('organization_id', organizationId).eq('dismissed_by', userId),
  ])
  for (const result of [interactions, tasks, onboardings, invoices, opportunities, quotes, milestones, dismissals]) if (result.error) throw result.error

  const rowsFor = (result: any, clientId: string) => (result.data ?? []).filter((row: any) => row.client_id === clientId)
  const dismissed = new Set<string>((dismissals.data ?? []).map((row: any) => row.recommendation_key))
  const priorities: RelationshipPriority[] = []
  const clientRows = clients.map((client) => {
    const interactionRows = rowsFor(interactions, client.id).sort((a: any, b: any) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    const taskRows = rowsFor(tasks, client.id)
    const onboardingRows = rowsFor(onboardings, client.id)
    const invoiceRows = rowsFor(invoices, client.id)
    const opportunityRows = rowsFor(opportunities, client.id)
    const quoteRows = rowsFor(quotes, client.id)
    const overdueTasks = taskRows.filter((row: any) => row.due_at && new Date(row.due_at) < now)
    const onboardingIssues = onboardingRows.filter((row: any) => row.status !== 'Complete' && (row.health === 'At Risk' || Number(row.progress_percent) < 100))
    const overdueInvoices = invoiceRows.filter((row: any) => row.status === 'Overdue' || (row.due_date && new Date(`${row.due_date}T23:59:59`) < now && Number(row.balance_amount) > 0 && !['Paid', 'Cancelled'].includes(row.status)))
    const assessment = assessRelationship({
      lastInteractionAt: interactionRows[0]?.occurred_at ?? null,
      overdueFollowUps: overdueTasks.length,
      onboardingIssues: onboardingIssues.length,
      overdueInvoices: overdueInvoices.length,
      activeOpportunities: opportunityRows.filter((row: any) => OPEN_OPPORTUNITIES.includes(row.stage)).length,
      recordedConcerns: interactionRows.filter((row: any) => row.concern_recorded).length,
      completedInteractions: interactionRows.length,
    }, now)
    for (const row of overdueTasks) priorities.push({ key: recommendationKey('overdue-follow-up', row.id), clientId: client.id, clientName: client.name, title: 'Complete the overdue follow-up', reason: `${row.title} is past its due date.`, href: `/operations/tasks/${row.id}`, actionLabel: 'Open task', category: 'Follow-up', dueAt: row.due_at })
    for (const row of overdueInvoices) priorities.push({ key: recommendationKey('overdue-invoice', row.id), clientId: client.id, clientName: client.name, title: 'Review the overdue invoice', reason: `${row.invoice_number} has an outstanding balance of ${row.currency} ${Number(row.balance_amount).toLocaleString('en-ZA')}.`, href: `/finance/invoices/${row.id}`, actionLabel: 'Open invoice', category: 'Invoice', dueAt: row.due_date })
    for (const row of onboardingIssues) priorities.push({ key: recommendationKey('onboarding-review', row.id), clientId: client.id, clientName: client.name, title: 'Review the onboarding process', reason: `${row.progress_percent}% is complete and current health is ${row.health}.`, href: `/operations/onboarding/${row.id}`, actionLabel: 'Open onboarding', category: 'Onboarding', dueAt: null })
    for (const row of quoteRows.filter((quote: any) => quote.status === 'Sent' && quote.sent_at && now.getTime() - new Date(quote.sent_at).getTime() >= 7 * day)) priorities.push({ key: recommendationKey('quote-follow-up', row.id), clientId: client.id, clientName: client.name, title: 'Follow up on the quotation', reason: `${row.quote_number} has been awaiting a response for at least seven days.`, href: `/commercial/quotes/${row.id}`, actionLabel: 'Open quote', category: 'Quote', dueAt: row.sent_at })
    return {
      id: client.id, name: client.name, status: client.status, indicator: assessment.indicator, reason: assessment.reason,
      nextFollowUpAt: taskRows.filter((row: any) => row.due_at && new Date(row.due_at) >= now).sort((a: any, b: any) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())[0]?.due_at ?? null,
    }
  })

  const upcomingMilestones = (milestones.data ?? []).map((row: any) => ({ ...row, nextDate: nextMilestoneDate(row.milestone_date, row.recurring_annually, now) })).filter((row: any) => {
    const time = new Date(`${row.nextDate}T23:59:59Z`).getTime()
    return time >= now.getTime() && time <= now.getTime() + 90 * day
  }).sort((a: any, b: any) => a.nextDate.localeCompare(b.nextDate)).slice(0, 6)
  const names = new Map(clients.map((client) => [client.id, client.name]))
  return {
    assigned: clients.length,
    active: clients.filter((client) => client.status === 'Active').length,
    upcomingFollowUps: (tasks.data ?? []).filter((row: any) => row.due_at && new Date(row.due_at) >= now).length,
    requiringAttention: clientRows.filter((client) => client.indicator === 'Needs Attention').length,
    clients: clientRows.sort((a, b) => Number(b.indicator === 'Needs Attention') - Number(a.indicator === 'Needs Attention') || a.name.localeCompare(b.name)).slice(0, 6),
    priorities: priorities.filter((priority) => !dismissed.has(priority.key)).sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')).slice(0, 8),
    milestones: upcomingMilestones.map((row: any) => ({ id: row.id, clientId: row.client_id, clientName: names.get(row.client_id) ?? 'Client', name: row.name, type: row.milestone_type, date: row.nextDate })),
  }
}
