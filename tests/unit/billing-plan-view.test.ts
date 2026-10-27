import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BILLING_PLAN_COPY,
  EMAIL_MAY_NOT_HAVE_SENT,
  EMAIL_SENT_NOT_RECORDED,
  FIRST_INVOICE_BANNER,
  PLAN_STATE_CONTROLS,
  approvedNotEmailedSentence,
  billingPlanDescription,
  blockerSentence,
  canCreateItemInvoice,
  describePlanItem,
  firstInvoiceBannerParts,
  firstInvoiceBannerText,
  isAwaitingApproval,
  isFirstPlanDraft,
  parseChecksFailed,
  planStatusLine,
  planStatusTone,
  type PlanItemFacts,
  type PlanItemInvoice,
} from '../../features/documents/billing-plan-view.ts'

// Accept to invoice, stage 1, task 9: the wording and the small decisions behind the billing plan panel on the quote page.
// Pure: no database, no page. The panel, the queries and the actions are guarded in billing-plan-actions.test.ts.

const TODAY = '2026-10-27'

const first = (overrides: Partial<PlanItemFacts> = {}): PlanItemFacts => ({ kind: 'first', monthNumber: 1, billOn: '2026-10-27', status: 'open', approvedAt: null, ...overrides })
const monthly = (overrides: Partial<PlanItemFacts> = {}): PlanItemFacts => ({ kind: 'monthly', monthNumber: 2, billOn: '2026-12-15', status: 'open', approvedAt: null, ...overrides })
const invoice = (status: string, number = 'HSGC-INV-2026-0007'): PlanItemInvoice => ({ id: '00000000-0000-4000-8000-000000000001', number, status })

test('a cancelled month says Cancelled, whatever else is true of it', () => {
  const expected = { label: 'Cancelled', tone: 'muted' }
  assert.deepEqual(describePlanItem(first({ status: 'cancelled' }), null, TODAY), expected)
  assert.deepEqual(describePlanItem(monthly({ status: 'cancelled', billOn: '2026-01-01' }), null, TODAY), expected)
  assert.deepEqual(describePlanItem(monthly({ status: 'cancelled' }), invoice('Draft'), TODAY), expected)
})

test('no invoice yet: the first month needs its draft, a later month is scheduled or due', () => {
  assert.deepEqual(describePlanItem(first(), null, TODAY), { label: 'Draft invoice not made yet', tone: 'attention' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-12-15' }), null, TODAY), { label: 'Scheduled for 15 December 2026', tone: 'muted' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-11-03' }), null, TODAY), { label: 'Scheduled for 3 November 2026', tone: 'muted' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-10-01' }), null, TODAY), { label: "Due: create this month's invoice", tone: 'attention' })
})

test('the date boundary: a month due today is due, a month due tomorrow is scheduled', () => {
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-10-27' }), null, '2026-10-27'), { label: "Due: create this month's invoice", tone: 'attention' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-10-28' }), null, '2026-10-27'), { label: 'Scheduled for 28 October 2026', tone: 'muted' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-10-26' }), null, '2026-10-27'), { label: "Due: create this month's invoice", tone: 'attention' })
  // The dates are compared as text, which sorts as dates for YYYY-MM-DD, across a month and a year end.
  assert.deepEqual(describePlanItem(monthly({ billOn: '2027-01-01' }), null, '2026-12-31'), { label: 'Scheduled for 1 January 2027', tone: 'muted' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-12-31' }), null, '2027-01-01'), { label: "Due: create this month's invoice", tone: 'attention' })
})

test('a draft: the first invoice waits for approval, a monthly one is just a draft', () => {
  assert.deepEqual(describePlanItem(first(), invoice('Draft', 'DRAFT-1a2b3c4d'), TODAY), { label: 'Waiting for your approval', tone: 'attention' })
  assert.deepEqual(describePlanItem(monthly(), invoice('Draft', 'DRAFT-1a2b3c4d'), TODAY), { label: 'Draft invoice', tone: 'waiting' })
})

test('an issued invoice says which invoice and what state it is in; Paid says Paid; Cancelled says cancelled', () => {
  for (const status of ['Issued', 'Partially Paid', 'Overdue']) {
    assert.deepEqual(describePlanItem(first({ approvedAt: '2026-10-27T08:00:00Z' }), invoice(status), TODAY), { label: `Invoiced: HSGC-INV-2026-0007, ${status}`, tone: 'done' })
    assert.deepEqual(describePlanItem(monthly(), invoice(status), TODAY), { label: `Invoiced: HSGC-INV-2026-0007, ${status}`, tone: 'done' })
  }
  assert.deepEqual(describePlanItem(first(), invoice('Paid'), TODAY), { label: 'Paid', tone: 'done' })
  assert.deepEqual(describePlanItem(monthly(), invoice('Paid'), TODAY), { label: 'Paid', tone: 'done' })
  assert.deepEqual(describePlanItem(first(), invoice('Cancelled'), TODAY), { label: 'Invoice HSGC-INV-2026-0007 cancelled', tone: 'muted' })
  assert.deepEqual(describePlanItem(monthly(), invoice('Cancelled'), TODAY), { label: 'Invoice HSGC-INV-2026-0007 cancelled', tone: 'muted' })
})

test('an unreadable date never throws and never nudges anyone to invoice a month on a bad date', () => {
  for (const billOn of ['', 'not a date', '2026-13-45', '15/12/2026', '2026-12-15T00:00:00Z']) {
    const described = describePlanItem(monthly({ billOn }), null, TODAY)
    assert.equal(typeof described.label, 'string', billOn)
    assert.ok(described.label.length > 0, billOn)
    assert.equal(described.tone, 'muted', billOn)
    assert.doesNotMatch(described.label, /^Due:/, billOn)
  }
  // And an unreadable "today" does not throw either.
  assert.doesNotThrow(() => describePlanItem(monthly(), null, ''))
  assert.doesNotThrow(() => describePlanItem(monthly(), null, 'whenever'))
})

test('the labels never claim a payment that was not recorded', () => {
  for (const status of ['Draft', 'Issued', 'Partially Paid', 'Overdue', 'Cancelled']) {
    for (const item of [first(), monthly()]) {
      assert.doesNotMatch(describePlanItem(item, invoice(status), TODAY).label.replace('Partially Paid', ''), /\bpaid\b/i, `${item.kind} ${status}`)
    }
  }
  for (const item of [first(), monthly({ billOn: '2026-12-15' }), monthly({ billOn: '2026-10-01' })]) {
    assert.doesNotMatch(describePlanItem(item, null, TODAY).label, /\bpaid\b/i)
  }
})

const BLOCKERS: Array<[string, string]> = [
  ['COMPANY_NAME_MISSING', 'The company name is not set. Add it under Settings, Company details.'],
  ['COMPANY_PREFIX_MISSING', 'The document prefix is not set. Add it under Settings, Company details.'],
  ['COMPANY_VAT_NUMBER_MISSING', 'The company VAT number is not set, and this invoice charges VAT. Add it under Settings, Company details.'],
  ['BANK_DETAILS_MISSING', 'The bank details are incomplete: the bank name, account name, account number and branch code are all needed. Add them under Settings, Company details.'],
  ['CLIENT_MISSING', 'This invoice has no client. The quote needs a client from your client list.'],
  ['CLIENT_EMAIL_MISSING', 'The client has no valid billing email, and its primary contact has none either. Add one to the client.'],
  ['CLIENT_ADDRESS_MISSING', 'The client has no address. Add the first address line to the client.'],
  ['NO_LINES', 'This invoice has no lines. Check the lines on the quote.'],
  ['TOTAL_NOT_POSITIVE', 'The invoice total must be more than zero.'],
]

test('each of the nine blocker codes has its own plain sentence, and the VAT one is the brief word for word', () => {
  assert.equal(BLOCKERS.length, 9)
  for (const [code, sentence] of BLOCKERS) assert.equal(blockerSentence(code), sentence, code)
  assert.equal(new Set(BLOCKERS.map(([code]) => blockerSentence(code))).size, 9, 'no two codes share a sentence')
  assert.equal(blockerSentence('COMPANY_VAT_NUMBER_MISSING'), 'The company VAT number is not set, and this invoice charges VAT. Add it under Settings, Company details.')
  for (const [code] of BLOCKERS) assert.match(blockerSentence(code), /\.$/, `${code} ends as a sentence`)
})

test('an unknown blocker code, or something that is not a code, gets the general sentence', () => {
  const general = 'Something on this invoice needs attention.'
  for (const code of ['SOMETHING_NEW', '', 'company_name_missing', 'toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.equal(blockerSentence(code), general, JSON.stringify(code))
  }
  assert.equal(blockerSentence(undefined as unknown as string), general)
  assert.equal(blockerSentence(null as unknown as string), general)
})

test('parseChecksFailed reads the codes after the token, with or without a space, and nothing when there are none', () => {
  assert.deepEqual(parseChecksFailed('BILLING_CHECKS_FAILED: COMPANY_NAME_MISSING,BANK_DETAILS_MISSING'), ['COMPANY_NAME_MISSING', 'BANK_DETAILS_MISSING'])
  assert.deepEqual(parseChecksFailed('BILLING_CHECKS_FAILED:COMPANY_NAME_MISSING,BANK_DETAILS_MISSING'), ['COMPANY_NAME_MISSING', 'BANK_DETAILS_MISSING'])
  assert.deepEqual(parseChecksFailed('BILLING_CHECKS_FAILED: CLIENT_EMAIL_MISSING'), ['CLIENT_EMAIL_MISSING'])
  assert.deepEqual(parseChecksFailed('BILLING_CHECKS_FAILED: A_CODE , B_CODE'), ['A_CODE', 'B_CODE'])
  assert.deepEqual(parseChecksFailed('error: BILLING_CHECKS_FAILED: NO_LINES,TOTAL_NOT_POSITIVE'), ['NO_LINES', 'TOTAL_NOT_POSITIVE'])
  assert.deepEqual(parseChecksFailed('BILLING_CHECKS_FAILED: NO_LINES,TOTAL_NOT_POSITIVE\nDETAIL: none'), ['NO_LINES', 'TOTAL_NOT_POSITIVE'])
  assert.deepEqual(parseChecksFailed('BILLING_CHECKS_FAILED:'), [])
  assert.deepEqual(parseChecksFailed('BILLING_CHECKS_FAILED'), [])
  assert.deepEqual(parseChecksFailed('BILLING_ALREADY_APPROVED'), [])
  assert.deepEqual(parseChecksFailed('COMPANY_NAME_MISSING,BANK_DETAILS_MISSING'), [])
  assert.deepEqual(parseChecksFailed(''), [])
  assert.deepEqual(parseChecksFailed(null), [])
  assert.deepEqual(parseChecksFailed(undefined), [])
})

test('the plan status line reads Active, Paused: reason, Ended: reason', () => {
  assert.equal(planStatusLine({ status: 'active', statusReason: null }), 'Active')
  assert.equal(planStatusLine({ status: 'active', statusReason: 'left over from a pause' }), 'Active', 'an active plan shows no reason')
  assert.equal(planStatusLine({ status: 'paused', statusReason: 'Client asked us to wait' }), 'Paused: Client asked us to wait')
  assert.equal(planStatusLine({ status: 'ended', statusReason: 'Contract cancelled' }), 'Ended: Contract cancelled')
  assert.equal(planStatusLine({ status: 'paused', statusReason: null }), 'Paused')
  assert.equal(planStatusLine({ status: 'ended', statusReason: '  ' }), 'Ended')
  assert.equal(planStatusTone('active'), 'brand')
  assert.equal(planStatusTone('paused'), 'warning')
  assert.equal(planStatusTone('ended'), 'neutral')
})

test('Create invoice is offered on the first month, or a due month, with no invoice, while the plan is active', () => {
  assert.equal(canCreateItemInvoice(first(), null, 'active', TODAY), true)
  assert.equal(canCreateItemInvoice(monthly({ billOn: '2026-10-27' }), null, 'active', TODAY), true, 'due today')
  assert.equal(canCreateItemInvoice(monthly({ billOn: '2026-09-01' }), null, 'active', TODAY), true, 'overdue to bill')
  assert.equal(canCreateItemInvoice(monthly({ billOn: '2026-10-28' }), null, 'active', TODAY), false, 'not due yet')
  assert.equal(canCreateItemInvoice(monthly({ billOn: 'not a date' }), null, 'active', TODAY), false, 'an unreadable date is not due')
  assert.equal(canCreateItemInvoice(first(), null, 'paused', TODAY), false)
  assert.equal(canCreateItemInvoice(first(), null, 'ended', TODAY), false)
  assert.equal(canCreateItemInvoice(first({ status: 'cancelled' }), null, 'active', TODAY), false, 'a cancelled month')
  assert.equal(canCreateItemInvoice(monthly({ status: 'cancelled', billOn: '2026-09-01' }), null, 'active', TODAY), false, 'a cancelled month')
  for (const status of ['Draft', 'Issued', 'Paid', 'Cancelled']) {
    assert.equal(canCreateItemInvoice(first(), invoice(status), 'active', TODAY), false, `a month that has a ${status} invoice`)
  }
})

const WAITING_FOR_FIRST = { label: 'Waiting for the first invoice to be approved', tone: 'waiting' }

test('a monthly month that is due waits for the first invoice to be approved, and says so, until it is', () => {
  // Not approved: a due month (today or earlier) is not a prompt to invoice, it is a wait.
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-10-27' }), null, TODAY, 'active', false), WAITING_FOR_FIRST, 'due today')
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-09-01' }), null, TODAY, 'active', false), WAITING_FOR_FIRST, 'overdue to bill')
  // Approved: the prompt is the one it always was. Left out: approved (the default), so nothing changes for a caller that does not say.
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-09-01' }), null, TODAY, 'active', true), { label: "Due: create this month's invoice", tone: 'attention' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-09-01' }), null, TODAY), { label: "Due: create this month's invoice", tone: 'attention' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-09-01' }), null, TODAY, 'active'), { label: "Due: create this month's invoice", tone: 'attention' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-09-01' }), null, TODAY, 'active', undefined), { label: "Due: create this month's invoice", tone: 'attention' })
  // A month that is not due yet is scheduled either way, and an unreadable date stays muted either way.
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-12-15' }), null, TODAY, 'active', false), { label: 'Scheduled for 15 December 2026', tone: 'muted' })
  assert.deepEqual(describePlanItem(monthly({ billOn: 'not a date' }), null, TODAY, 'active', false), { label: 'Scheduled', tone: 'muted' })
  // Only a month with no invoice waits: a monthly draft or issued invoice, a cancelled month and the first month read as before.
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-09-01' }), invoice('Draft', 'DRAFT-1a2b3c4d'), TODAY, 'active', false), { label: 'Draft invoice', tone: 'waiting' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-09-01', status: 'cancelled' }), null, TODAY, 'active', false), { label: 'Cancelled', tone: 'muted' })
  assert.deepEqual(describePlanItem(first(), null, TODAY, 'active', false), { label: 'Draft invoice not made yet', tone: 'attention' })
  assert.deepEqual(describePlanItem(first(), invoice('Draft', 'DRAFT-1a2b3c4d'), TODAY, 'active', false), { label: 'Waiting for your approval', tone: 'attention' })
})

test('Create invoice is not offered on a monthly month until the first invoice is approved; the first month is unchanged', () => {
  assert.equal(canCreateItemInvoice(monthly({ billOn: '2026-09-01' }), null, 'active', TODAY, false), false, 'a due month waits for the approval')
  assert.equal(canCreateItemInvoice(monthly({ billOn: '2026-10-27' }), null, 'active', TODAY, false), false, 'due today waits too')
  assert.equal(canCreateItemInvoice(monthly({ billOn: '2026-09-01' }), null, 'active', TODAY, true), true, 'approved: offered')
  assert.equal(canCreateItemInvoice(monthly({ billOn: '2026-09-01' }), null, 'active', TODAY), true, 'left out: approved, as before')
  assert.equal(canCreateItemInvoice(monthly({ billOn: '2026-09-01' }), null, 'active', TODAY, undefined), true, 'undefined: approved, as before')
  assert.equal(canCreateItemInvoice(first(), null, 'active', TODAY, false), true, 'item 1 is the first invoice itself: its Create invoice is unchanged')
  assert.equal(canCreateItemInvoice(monthly({ billOn: '2026-12-15' }), null, 'active', TODAY, true), false, 'a month not yet due is still not offered')
})

test('the first invoice awaits approval only while it is an open Draft of an active plan that has not been approved', () => {
  assert.equal(isAwaitingApproval(first(), invoice('Draft'), 'active'), true)
  assert.equal(isAwaitingApproval(first(), invoice('Draft'), 'paused'), false)
  assert.equal(isAwaitingApproval(first(), invoice('Draft'), 'ended'), false)
  assert.equal(isAwaitingApproval(first(), null, 'active'), false)
  assert.equal(isAwaitingApproval(first(), invoice('Issued'), 'active'), false)
  assert.equal(isAwaitingApproval(first({ status: 'cancelled' }), invoice('Draft'), 'active'), false)
  assert.equal(isAwaitingApproval(first({ approvedAt: '2026-10-27T08:00:00Z' }), invoice('Draft'), 'active'), false)
  assert.equal(isAwaitingApproval(monthly(), invoice('Draft'), 'active'), false, 'a monthly draft is issued the usual way')
})

test('only the first month of a plan, while a Draft, loses the Issue invoice button', () => {
  assert.equal(isFirstPlanDraft('first', 'Draft'), true)
  assert.equal(isFirstPlanDraft('first', 'Issued'), false)
  assert.equal(isFirstPlanDraft('monthly', 'Draft'), false)
  assert.equal(isFirstPlanDraft(null, 'Draft'), false, 'an invoice that belongs to no plan')
  assert.equal(isFirstPlanDraft(undefined, 'Draft'), false)
})

test('the invoice page banner is the sentence from the brief, with the quote number in it', () => {
  assert.equal(
    firstInvoiceBannerText('HSGC-QUO-2026-0012'),
    'This is the first invoice of the billing plan for quote HSGC-QUO-2026-0012. Review and approve it on the quote page.',
  )
})

test('approved but not emailed: the reason is the email action message, and it is never called emailed', () => {
  const log = 'Email is in log mode (EMAIL_TRANSPORT=log): the message was logged, not sent, and nothing was recorded.'
  assert.equal(
    approvedNotEmailedSentence('HSGC-INV-2026-0007', log),
    `Invoice HSGC-INV-2026-0007 is approved and issued, but the email did not go: ${log} Send it from the invoice page.`,
  )
  assert.equal(
    approvedNotEmailedSentence('HSGC-INV-2026-0007', 'The client has no email address on file'),
    'Invoice HSGC-INV-2026-0007 is approved and issued, but the email did not go: The client has no email address on file. Send it from the invoice page.',
    'a reason without a full stop gets one',
  )
  assert.doesNotMatch(approvedNotEmailedSentence('X', log), /\bemailed\b/)
})

test('the email action sent the message but could not record it: the sentence does not say it did not go', () => {
  assert.equal(EMAIL_SENT_NOT_RECORDED, "Sent, but we couldn't record it.")
  const sentence = approvedNotEmailedSentence('HSGC-INV-2026-0007', EMAIL_SENT_NOT_RECORDED)
  assert.doesNotMatch(sentence, /did not go|Send it from the invoice page/)
  assert.match(sentence, /^Invoice HSGC-INV-2026-0007 is approved and issued and the email was sent, but it could not be recorded\./)
  assert.match(sentence, /Check Emails sent and your mailbox before sending it again\.$/)
})

test('the mail server did not accept the message: the invoice is approved, the message may not have gone, and nobody is told to just send it again', () => {
  assert.equal(
    EMAIL_MAY_NOT_HAVE_SENT,
    'The mail server did not accept the message. It may not have been sent; check Emails sent and your mailbox before trying again.',
  )
  const sentence = approvedNotEmailedSentence('HSGC-INV-2026-0007', EMAIL_MAY_NOT_HAVE_SENT)
  assert.equal(
    sentence,
    'Invoice HSGC-INV-2026-0007 is approved and issued. The mail server did not accept the message and it may not have been sent; check Emails sent and your mailbox before sending it again.',
  )
  assert.doesNotMatch(sentence, /did not go|Send it from the invoice page|\bemailed\b/)
  // The same message with a different ending is a different message: it gets the general wrapper.
  assert.match(approvedNotEmailedSentence('X', 'The mail server did not accept the message.'), /the email did not go: The mail server did not accept the message\. Send it from the invoice page\.$/)
})

test('a paused or ended plan does not ask for approval of its first draft; nothing else about the labels changes', () => {
  for (const status of ['paused', 'ended'] as const) {
    assert.deepEqual(describePlanItem(first(), invoice('Draft', 'DRAFT-1a2b3c4d'), TODAY, status), { label: `Draft invoice (plan ${status})`, tone: 'muted' })
    assert.deepEqual(describePlanItem(monthly(), invoice('Draft', 'DRAFT-1a2b3c4d'), TODAY, status), { label: 'Draft invoice', tone: 'waiting' }, 'a monthly draft is as before')
    assert.deepEqual(describePlanItem(first(), invoice('Issued'), TODAY, status), { label: 'Invoiced: HSGC-INV-2026-0007, Issued', tone: 'done' }, 'an issued invoice is as before')
    assert.deepEqual(describePlanItem(first(), invoice('Paid'), TODAY, status), { label: 'Paid', tone: 'done' })
    assert.deepEqual(describePlanItem(first(), null, TODAY, status), { label: 'Draft invoice not made yet', tone: 'attention' })
    assert.deepEqual(describePlanItem(first({ status: 'cancelled' }), null, TODAY, status), { label: 'Cancelled', tone: 'muted' })
  }
  const waiting = { label: 'Waiting for your approval', tone: 'attention' }
  assert.deepEqual(describePlanItem(first(), invoice('Draft'), TODAY, 'active'), waiting)
  assert.deepEqual(describePlanItem(first(), invoice('Draft'), TODAY), waiting, 'the plan status defaults to active')
})

test('the banner on a first invoice of a paused or ended plan says it cannot be approved; the active wording is unchanged', () => {
  assert.deepEqual(firstInvoiceBannerParts('active'), { before: FIRST_INVOICE_BANNER.before, after: FIRST_INVOICE_BANNER.after })
  assert.deepEqual(firstInvoiceBannerParts(), firstInvoiceBannerParts('active'), 'the plan status defaults to active')
  assert.equal(firstInvoiceBannerText('HSGC-QUO-2026-0012', 'active'), 'This is the first invoice of the billing plan for quote HSGC-QUO-2026-0012. Review and approve it on the quote page.')
  assert.equal(
    firstInvoiceBannerText('HSGC-QUO-2026-0012', 'paused'),
    'This is the first invoice of the billing plan for quote HSGC-QUO-2026-0012. The plan is paused, so it cannot be approved. Open the quote to see why.',
  )
  assert.equal(
    firstInvoiceBannerText('HSGC-QUO-2026-0012', 'ended'),
    'This is the first invoice of the billing plan for quote HSGC-QUO-2026-0012. The plan is ended, so it cannot be approved. Open the quote to see why.',
  )
  for (const status of ['active', 'paused', 'ended'] as const) {
    const parts = firstInvoiceBannerParts(status)
    assert.equal(`${parts.before}Q${parts.after}`, firstInvoiceBannerText('Q', status), status)
    assert.equal(parts.before, FIRST_INVOICE_BANNER.before, 'the number goes in the same place whatever the status')
  }
})

test('the panel wording: the brief sentences, word for word', () => {
  assert.equal(BILLING_PLAN_COPY.title, 'Billing plan')
  assert.equal(BILLING_PLAN_COPY.approveLabel, 'Approve and send')
  assert.equal(BILLING_PLAN_COPY.approveConfirm, 'Approve this invoice and email it to the client? It gets its number now and can no longer be edited.')
  assert.equal(BILLING_PLAN_COPY.blockersHeading, 'What needs attention before this can go out')
  assert.equal(BILLING_PLAN_COPY.approvedNotEmailed, 'Approved, not yet emailed. Use Email to client on the invoice.')
  assert.equal(BILLING_PLAN_COPY.createLabel, 'Create invoice')
  assert.equal(BILLING_PLAN_COPY.approveAdminOnly, 'Only an owner or admin can approve the first invoice.')
})

test('the panel intro is true in every state: it promises months only when the plan has monthly items', () => {
  const firstOnly = 'Approve and email the first invoice here.'
  const withMonths = 'Approve and email the first invoice here. Later months are made here and issued by hand; none is sent automatically yet.'
  // A once-off quote has the first invoice and nothing else.
  assert.equal(billingPlanDescription([{ kind: 'first' }]), firstOnly)
  // A monthly agreement has the first invoice and a monthly item for each later month.
  assert.equal(billingPlanDescription([{ kind: 'first' }, { kind: 'monthly' }]), withMonths)
  assert.equal(billingPlanDescription([{ kind: 'first' }, ...Array.from({ length: 11 }, () => ({ kind: 'monthly' as const }))]), withMonths)
  // Nothing to bill later, nothing promised about later.
  assert.equal(billingPlanDescription([]), firstOnly)
  for (const text of [firstOnly, withMonths]) {
    // The old sentence said "is approved and emailed here" (false once it is approved) and spoke of monthly invoices on a once-off quote.
    assert.doesNotMatch(text, /is approved and emailed here|Monthly invoices are made here/)
    assert.match(text, /^Approve and email the first invoice here\./)
  }
  // The intro comes from the items, not from a fixed sentence in the wording table.
  assert.equal(Object.hasOwn(BILLING_PLAN_COPY, 'description'), false)
})

test('the action sentences: what was done, in plain words, with no claim of payment', () => {
  assert.equal(BILLING_PLAN_COPY.draftCreated, 'Draft invoice created.')
  assert.deepEqual(BILLING_PLAN_COPY.stateDone, { pause: 'Billing plan paused.', resume: 'Billing plan resumed.', end: 'Billing plan ended.' })
  assert.equal(BILLING_PLAN_COPY.planAdminOnly, 'Only an owner or admin can change a billing plan.')
  assert.equal(BILLING_PLAN_COPY.fallback, 'That billing step could not be done. Please try again.')
  assert.equal(`${FIRST_INVOICE_BANNER.before}Q${FIRST_INVOICE_BANNER.after}`, firstInvoiceBannerText('Q'))
})

test('the plan controls: a reason is required to pause and to end, optional to resume, and ending asks first', () => {
  assert.deepEqual(Object.keys(PLAN_STATE_CONTROLS), ['pause', 'resume', 'end'])
  assert.equal(PLAN_STATE_CONTROLS.pause.reasonRequired, true)
  assert.equal(PLAN_STATE_CONTROLS.end.reasonRequired, true)
  assert.equal(PLAN_STATE_CONTROLS.resume.reasonRequired, false)
  assert.equal(PLAN_STATE_CONTROLS.pause.confirmText, null)
  assert.equal(PLAN_STATE_CONTROLS.resume.confirmText, null)
  assert.match(String(PLAN_STATE_CONTROLS.end.confirmText), /cannot be undone/i, 'the confirm step says it is final')
  assert.equal(PLAN_STATE_CONTROLS.end.tone, 'danger')
})
