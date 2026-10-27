// The wording and the small decisions behind the billing plan on the quote page (accept to invoice, stage 1, task 9). Pure: relative
// imports with their extensions only, no directive and no server code, so the panel, the queries, the actions and the unit tests can
// all load it. Staff-facing wording lives here and in billing-terms.ts. UNISON says "approved" for a person's approval, "emailed"
// only when the mail server accepted the message, and "paid" only for an invoice whose payments are on record.
import { formatDocumentDate } from './document-view.ts'

export type PlanStatus = 'active' | 'paused' | 'ended'
export type PlanItemKind = 'first' | 'monthly'
export type PlanTone = 'waiting' | 'attention' | 'done' | 'muted'

/** What the database holds of one month of a plan. `billOn` is a date (YYYY-MM-DD); `approvedAt` is a time, or null. */
export type PlanItemFacts = { kind: PlanItemKind; monthNumber: number; billOn: string; status: 'open' | 'cancelled'; approvedAt: string | null }
export type PlanItemInvoice = { id: string; number: string; status: string }
export type BillingPlanItemView = PlanItemFacts & { id: string; invoice: PlanItemInvoice | null }

/** What the panel shows. `blockers` and `emailed` are only worked out when they can matter (see getBillingPlan). */
export type BillingPlanView = {
  plan: { id: string; status: PlanStatus; statusReason: string | null; startDate: string | null; termMonths: number | null }
  items: BillingPlanItemView[]
  /** What stops the first invoice going out, as codes: only while that invoice is a Draft awaiting approval; otherwise empty. */
  blockers: string[]
  /** An email for the first invoice is on record, so the mail server accepted it. */
  emailed: boolean
  canManage: boolean
}

/** The sentences the panel and the actions say. One place, so the wording cannot drift between them. */
export const BILLING_PLAN_COPY = {
  title: 'Billing plan',
  description: 'The first invoice is approved and emailed here. Monthly invoices are made here and issued by hand; none is sent automatically yet.',
  approveLabel: 'Approve and send',
  approvePendingLabel: 'Approving\u2026',
  approveConfirm: 'Approve this invoice and email it to the client? It gets its number now and can no longer be edited.',
  approveAdminOnly: 'Only an owner or admin can approve the first invoice.',
  blockersHeading: 'What needs attention before this can go out',
  approvedNotEmailed: 'Approved, not yet emailed. Use Email to client on the invoice.',
  createLabel: 'Create invoice',
  draftCreated: 'Draft invoice created.',
  stateDone: { pause: 'Billing plan paused.', resume: 'Billing plan resumed.', end: 'Billing plan ended.' },
  planAdminOnly: 'Only an owner or admin can change a billing plan.',
  fallback: 'That billing step could not be done. Please try again.',
  // Why an approved invoice was not emailed, when the email action did not say (the action's own message is used when it did).
  approvedUnreadable: 'The invoice was approved and issued, but its number could not be read here. Open it from the Invoices list and send it from there.',
  invoiceNotLoaded: 'The invoice could not be loaded.',
  noAddress: 'The client has no email address on file.',
  emailNotPrepared: 'The email could not be prepared.',
  emailDidNotGo: 'The email did not go.',
} as const

/** The three plan controls: the words on each, and whether a reason is required. Ending asks first, because it cannot be undone. */
export const PLAN_STATE_CONTROLS = {
  pause: { label: 'Pause plan', pendingLabel: 'Pausing\u2026', reasonLabel: 'Reason for pausing', reasonRequired: true, confirmText: null, tone: null },
  resume: { label: 'Resume plan', pendingLabel: 'Resuming\u2026', reasonLabel: 'Reason for resuming (optional)', reasonRequired: false, confirmText: null, tone: null },
  end: {
    label: 'End plan',
    pendingLabel: 'Ending\u2026',
    reasonLabel: 'Reason for ending',
    reasonRequired: true,
    confirmText: 'End this billing plan? Months with no invoice are cancelled. Invoices already made are not touched. This cannot be undone.',
    tone: 'danger',
  },
} as const

/** What the invoice Edit form and the line editor say about a Draft that follows an accepted quote: the database allows only the due date and the notes. */
export const PLAN_DRAFT_LOCKED_NOTE = 'This invoice follows its accepted quote. Only the due date and the notes can be changed.'

/** The banner on the first invoice of a plan, in two parts so the page can put the quote number in between as a link. */
export const FIRST_INVOICE_BANNER = {
  before: 'This is the first invoice of the billing plan for quote ',
  after: '. Review and approve it on the quote page.',
} as const

/**
 * The words either side of the quote number. While the plan is active the first invoice is reviewed and approved on the quote page; a
 * paused or ended plan cannot approve it, so the banner says so and sends the reader to the quote to see why.
 */
export function firstInvoiceBannerParts(planStatus: PlanStatus = 'active'): { before: string; after: string } {
  if (planStatus === 'active') return { before: FIRST_INVOICE_BANNER.before, after: FIRST_INVOICE_BANNER.after }
  return { before: FIRST_INVOICE_BANNER.before, after: `. The plan is ${planStatus}, so it cannot be approved. Open the quote to see why.` }
}

export function firstInvoiceBannerText(quoteNumber: string, planStatus: PlanStatus = 'active'): string {
  const parts = firstInvoiceBannerParts(planStatus)
  return `${parts.before}${quoteNumber}${parts.after}`
}

/** True for a real calendar day written YYYY-MM-DD ("2026-02-30" is not one). */
function isRealDay(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * A month is due on its day and every day after. Both are YYYY-MM-DD, which sort as dates once the shape is known to be right.
 * A date that cannot be read is not due: nobody is nudged to invoice a month on a day nobody can read (the database decides too).
 */
function isDue(billOn: string, today: string): boolean {
  return isRealDay(billOn) && isRealDay(today) && billOn <= today
}

/**
 * What to say about one month of a plan, and how loudly. `today` is the South African day, YYYY-MM-DD. The first month with no
 * invoice yet is "not made yet" whatever its date, because it is billed on the day the plan is made. A first invoice that is still a
 * Draft does not wait for approval when its plan is paused or ended: nobody can approve it, so it is just a draft. A monthly month that
 * is due, with no invoice, is not a prompt to invoice while the first invoice has not been approved (`firstApproved` false): it waits,
 * because no monthly invoice goes out before the first one is approved. `firstApproved` is true when it is left out.
 */
export function describePlanItem(item: PlanItemFacts, invoice: PlanItemInvoice | null, today: string, planStatus: PlanStatus = 'active', firstApproved = true): { label: string; tone: PlanTone } {
  if (item.status === 'cancelled') return { label: 'Cancelled', tone: 'muted' }
  if (!invoice) {
    if (item.kind === 'first') return { label: 'Draft invoice not made yet', tone: 'attention' }
    if (isDue(item.billOn, today)) {
      if (!firstApproved) return { label: 'Waiting for the first invoice to be approved', tone: 'waiting' }
      return { label: "Due: create this month's invoice", tone: 'attention' }
    }
    if (!isRealDay(item.billOn)) return { label: 'Scheduled', tone: 'muted' }
    return { label: `Scheduled for ${formatDocumentDate(item.billOn) ?? item.billOn}`, tone: 'muted' }
  }
  switch (invoice.status) {
    case 'Draft':
      if (item.kind !== 'first') return { label: 'Draft invoice', tone: 'waiting' }
      return planStatus === 'active' ? { label: 'Waiting for your approval', tone: 'attention' } : { label: `Draft invoice (plan ${planStatus})`, tone: 'muted' }
    case 'Issued':
    case 'Partially Paid':
    case 'Overdue':
      return { label: `Invoiced: ${invoice.number}, ${invoice.status}`, tone: 'done' }
    case 'Paid':
      return { label: 'Paid', tone: 'done' }
    case 'Cancelled':
      return { label: `Invoice ${invoice.number} cancelled`, tone: 'muted' }
    default:
      return { label: `Invoice ${invoice.number}, ${invoice.status}`, tone: 'muted' }
  }
}

/**
 * "Create invoice" is offered on the first month, or a month that is due, that has no invoice, while the plan is active. A monthly month
 * is not offered until the first invoice has been approved (`firstApproved`, true when left out); the first month is not held by it.
 */
export function canCreateItemInvoice(item: PlanItemFacts, invoice: PlanItemInvoice | null, planStatus: PlanStatus, today: string, firstApproved = true): boolean {
  if (planStatus !== 'active' || item.status !== 'open' || invoice) return false
  if (item.kind === 'first') return true
  return firstApproved && isDue(item.billOn, today)
}

/** The first invoice awaits an owner's or admin's approval while it is an open Draft of an active plan that has not been approved. */
export function isAwaitingApproval(item: PlanItemFacts, invoice: PlanItemInvoice | null, planStatus: PlanStatus): boolean {
  return item.kind === 'first' && item.status === 'open' && item.approvedAt === null && planStatus === 'active' && invoice?.status === 'Draft'
}

/** The first invoice of a plan is not issued with the Issue invoice button while it is a Draft: it is approved from the quote page. */
export function isFirstPlanDraft(itemKind: string | null | undefined, invoiceStatus: string): boolean {
  return itemKind === 'first' && invoiceStatus === 'Draft'
}

/** "Active", "Paused: <reason>", "Ended: <reason>"; the reason is left off when there is none. */
export function planStatusLine(plan: { status: PlanStatus; statusReason: string | null }): string {
  if (plan.status === 'active') return 'Active'
  const word = plan.status === 'paused' ? 'Paused' : 'Ended'
  const reason = (plan.statusReason ?? '').trim()
  return reason ? `${word}: ${reason}` : word
}

export function planStatusTone(status: PlanStatus): 'brand' | 'warning' | 'neutral' {
  return status === 'active' ? 'brand' : status === 'paused' ? 'warning' : 'neutral'
}

// What is missing before the first invoice can go out: the codes of private.billing_invoice_blockers
// (20261026102000_billing_first_invoice_approval.sql), each as the sentence the page lists.
const BLOCKER_SENTENCES: Readonly<Record<string, string>> = {
  COMPANY_NAME_MISSING: 'The company name is not set. Add it under Settings, Company details.',
  COMPANY_PREFIX_MISSING: 'The document prefix is not set. Add it under Settings, Company details.',
  COMPANY_VAT_NUMBER_MISSING: 'The company VAT number is not set, and this invoice charges VAT. Add it under Settings, Company details.',
  BANK_DETAILS_MISSING: 'The bank details are incomplete: the bank name, account name, account number and branch code are all needed. Add them under Settings, Company details.',
  CLIENT_MISSING: 'This invoice has no client. The quote needs a client from your client list.',
  CLIENT_EMAIL_MISSING: 'The client has no valid billing email, and its primary contact has none either. Add one to the client.',
  CLIENT_ADDRESS_MISSING: 'The client has no address. Add the first address line to the client.',
  NO_LINES: 'This invoice has no lines. Check the lines on the quote.',
  TOTAL_NOT_POSITIVE: 'The invoice total must be more than zero.',
}

const BLOCKER_GENERAL = 'Something on this invoice needs attention.'

export function blockerSentence(code: string): string {
  return typeof code === 'string' && Object.hasOwn(BLOCKER_SENTENCES, code) ? BLOCKER_SENTENCES[code] : BLOCKER_GENERAL
}

const CHECKS_FAILED = /BILLING_CHECKS_FAILED:\s*([A-Z][A-Z0-9_]*(?:\s*,\s*[A-Z][A-Z0-9_]*)*)/

/** The codes in a "BILLING_CHECKS_FAILED: CODE,CODE" refusal; none when the message is anything else. */
export function parseChecksFailed(message: string | null | undefined): string[] {
  if (typeof message !== 'string') return []
  const found = CHECKS_FAILED.exec(message)
  return found ? found[1].split(',').map((code) => code.trim()).filter(Boolean) : []
}

/** What the email action says when it did send the message but could not write it down (features/documents/actions/email.ts). */
export const EMAIL_SENT_NOT_RECORDED = "Sent, but we couldn't record it."

/** What the email action says when the mail server did not accept the message and may or may not have kept it (actions/email.ts). */
export const EMAIL_MAY_NOT_HAVE_SENT = 'The mail server did not accept the message. It may not have been sent; check Emails sent and your mailbox before trying again.'

/**
 * The first invoice is approved and issued for good, but the email did not go: say so, with the email action's reason, and where to
 * send it from. Two messages of the email action are not "did not go" and get a sentence of their own, because sending again could
 * mean a second email to the client: one that did go out but could not be recorded, and one where the mail server did not accept the
 * message but may still have sent it. Both tell the person to check what was sent first.
 */
export function approvedNotEmailedSentence(number: string, reason: string): string {
  const text = reason.trim()
  if (text === EMAIL_SENT_NOT_RECORDED) {
    return `Invoice ${number} is approved and issued and the email was sent, but it could not be recorded. Check Emails sent and your mailbox before sending it again.`
  }
  if (text === EMAIL_MAY_NOT_HAVE_SENT) {
    return `Invoice ${number} is approved and issued. The mail server did not accept the message and it may not have been sent; check Emails sent and your mailbox before sending it again.`
  }
  const why = /[.!?]$/.test(text) ? text : `${text}.`
  return `Invoice ${number} is approved and issued, but the email did not go: ${why} Send it from the invoice page.`
}
