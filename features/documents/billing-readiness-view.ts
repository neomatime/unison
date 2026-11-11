// What the quote page says about whether the work may start (accept to invoice, stage 4, task 4). Pure: relative imports with their
// extensions only, no directive and no server code. The rule is the design's (section 8): the work may start when the start date has
// arrived and the first invoice is fully paid, and an owner or admin can decide otherwise, quote by quote, with a reason. The rule lives
// in one database function (billing_readiness); this only words its answer, and never recomputes it.
import { formatAmount, formatDocumentDate } from './document-view.ts'
import type { PlanTone } from './billing-plan-view.ts'

export type ReadinessState = 'no_plan' | 'ended' | 'waiting_start' | 'waiting_payment' | 'ready' | 'overridden'

export type ReadinessFacts = {
  state: ReadinessState
  startDate: string | null
  firstInvoice: { number: string; status: string; balance: number; currency: string } | null
  override: { byName: string | null; reason: string } | null
}

/** The line for the quote page, or null when the quote has no plan and there is nothing to say. */
export function describeReadiness(facts: ReadinessFacts): { line: string; tone: PlanTone } | null {
  switch (facts.state) {
    case 'no_plan':
      return null
    case 'ended':
      return { line: 'The billing plan has ended, so nothing will start from it.', tone: 'muted' }
    case 'ready':
      return { line: 'The work may start: the start date has arrived and the first invoice is paid.', tone: 'done' }
    case 'waiting_start': {
      const date = facts.startDate ? (formatDocumentDate(facts.startDate) ?? facts.startDate) : null
      return { line: date ? `Waiting for the start date, ${date}.` : 'Waiting for the start date.', tone: 'waiting' }
    }
    case 'waiting_payment': {
      const invoice = facts.firstInvoice
      // A first invoice that is not out yet (a Draft, or Cancelled) owes nothing: it has to be approved and paid first.
      if (!invoice || invoice.status === 'Draft' || invoice.status === 'Cancelled') {
        return { line: 'Waiting for the first invoice to be approved and paid.', tone: 'attention' }
      }
      return { line: `Waiting for the first invoice to be paid: ${invoice.number}, ${invoice.currency} ${formatAmount(invoice.balance)} owing.`, tone: 'attention' }
    }
    case 'overridden': {
      const name = facts.override?.byName?.trim() ? facts.override.byName.trim() : 'somebody'
      return { line: `Started by decision of ${name}: ${facts.override?.reason ?? ''}`, tone: 'done' }
    }
  }
}
