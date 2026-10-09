import 'server-only'
import { entitledModuleIds } from '@/lib/auth/entitlement'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { formatMoney } from '@/features/crm-overview/metrics'
import { formatDate } from '@/lib/utils'

export const CLIENT_TABS = ['projects', 'tasks', 'commercial', 'onboarding', 'documents'] as const
export type ClientTab = (typeof CLIENT_TABS)[number]

export const clientTabLabels: Record<ClientTab, string> = {
  projects: 'Projects',
  tasks: 'Tasks',
  commercial: 'Commercial',
  onboarding: 'Onboarding',
  documents: 'Documents',
}

export type RelatedRow = { id: string; title: string; kind?: string; detail: string; status: string; href: string }

const LIMIT = 25
const date = (value: string | null) => (value ? formatDate(value) : null)
const money = (amount: number | null, currency: string | null) => (amount === null ? null : formatMoney(Number(amount), currency ?? 'ZAR', 'full'))
const join = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(' · ') || '—'

/** The tabs this tenant's plan lets it see: a module outside the plan has no tab, not an empty one. */
export async function availableClientTabs(): Promise<ClientTab[]> {
  const modules = (await entitledModuleIds()) as readonly string[]
  const has = (id: string) => modules.includes(id)
  return CLIENT_TABS.filter((tab) => {
    if (tab === 'projects') return has('projects')
    if (tab === 'commercial') return has('quotes') || has('sales') || has('invoices')
    if (tab === 'onboarding') return has('onboarding')
    return true
  })
}

export async function getClientRelated(clientId: string, tab: Exclude<ClientTab, 'documents'>): Promise<RelatedRow[]> {
  const { organization } = await getSessionContext()
  const supabase = (await createServerSupabase()) as any
  const base = (table: string, columns: string) =>
    supabase.from(table).select(columns).eq('organization_id', organization.id).eq('client_id', clientId).is('archived_at', null)

  if (tab === 'projects') {
    const { data, error } = await base('projects', 'id,name,status,health,due_date').order('created_at', { ascending: false }).limit(LIMIT)
    if (error) throw error
    return (data ?? []).map((r: any) => ({ id: r.id, title: r.name, detail: join(r.health, r.due_date ? `Due ${date(r.due_date)}` : null), status: r.status, href: `/operations/projects/${r.id}` }))
  }

  if (tab === 'tasks') {
    const { data, error } = await base('tasks', 'id,title,status,priority,due_at').order('due_at', { ascending: true, nullsFirst: false }).limit(LIMIT)
    if (error) throw error
    return (data ?? []).map((r: any) => ({ id: r.id, title: r.title, detail: join(r.priority, r.due_at ? `Due ${date(r.due_at)}` : null), status: r.status, href: `/operations/tasks/${r.id}` }))
  }

  if (tab === 'onboarding') {
    const { data, error } = await base('client_onboardings', 'id,onboarding_type,stage,progress_percent,status').order('created_at', { ascending: false }).limit(LIMIT)
    if (error) throw error
    return (data ?? []).map((r: any) => ({ id: r.id, title: r.onboarding_type ?? 'Onboarding', detail: join(r.stage, r.progress_percent === null ? null : `${r.progress_percent}% complete`), status: r.status, href: `/operations/onboarding/${r.id}` }))
  }

  const modules = (await entitledModuleIds()) as readonly string[]
  const none = { data: [], error: null }
  const [quotes, deals, invoices] = await Promise.all([
    modules.includes('quotes') ? base('quotes', 'id,quote_number,status,total_amount,currency').limit(LIMIT) : none,
    modules.includes('sales') ? base('sales_opportunities', 'id,name,stage,expected_value,currency').limit(LIMIT) : none,
    modules.includes('invoices') ? base('invoices', 'id,invoice_number,status,total_amount,currency').limit(LIMIT) : none,
  ])
  for (const result of [quotes, deals, invoices]) if (result.error) throw result.error
  return [
    ...(quotes.data ?? []).map((r: any) => ({ id: r.id, title: r.quote_number, kind: 'Quote', detail: join(money(r.total_amount, r.currency)), status: r.status, href: `/commercial/quotes/${r.id}` })),
    ...(deals.data ?? []).map((r: any) => ({ id: r.id, title: r.name, kind: 'Opportunity', detail: join(money(r.expected_value, r.currency)), status: r.stage, href: `/commercial/sales/${r.id}` })),
    ...(invoices.data ?? []).map((r: any) => ({ id: r.id, title: r.invoice_number, kind: 'Invoice', detail: join(money(r.total_amount, r.currency)), status: r.status, href: `/finance/invoices/${r.id}` })),
  ]
}
