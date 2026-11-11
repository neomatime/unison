import 'server-only'

import { roleHasPermission } from '@/config/roles'
import { isUuid } from '@/lib/utils'
import type { ReadinessFacts } from '../billing-readiness-view'
import { documentContext } from '../server-context'

export type BillingReadinessView = ReadinessFacts & { canManage: boolean; onboardingHref: string | null }

/**
 * Whether the work on a quote may start (accept to invoice, stage 4), as the one database function billing_readiness answers it; null
 * for a quote with no billing plan. Read with the member's own client, so row level security and the function's own membership check
 * limit it to the caller's organisation, and nothing is written. The rule (the start date has arrived and the first invoice is paid) is
 * never recomputed here: this only maps the answer for the page.
 */
export async function getBillingReadiness(quoteId: string): Promise<BillingReadinessView | null> {
  if (!isUuid(quoteId)) return null
  const { role, db } = await documentContext()
  const result = await db.rpc('billing_readiness', { p_quote_id: quoteId })
  if (result.error) throw result.error
  const answer = (result.data ?? {}) as Record<string, any>
  if (answer.state === 'no_plan' || !answer.state) return null

  const invoice = answer.first_invoice as Record<string, any> | null
  const override = answer.override as Record<string, any> | null
  return {
    state: answer.state,
    startDate: answer.start_date ?? null,
    firstInvoice: invoice
      ? { number: String(invoice.number ?? ''), status: String(invoice.status ?? ''), balance: Number(invoice.balance ?? 0), currency: String(invoice.currency ?? 'ZAR') }
      : null,
    override: override ? { byName: override.by_name ? String(override.by_name) : null, reason: String(override.reason ?? '') } : null,
    canManage: roleHasPermission(role, 'company.manage'),
    onboardingHref: typeof answer.onboarding_id === 'string' && isUuid(answer.onboarding_id) ? `/operations/onboarding/${answer.onboarding_id}` : null,
  }
}
