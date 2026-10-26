import assert from 'node:assert/strict'

import { admin } from './helpers.ts'
import { must, setupPortalOrg, type PortalMember, type PortalOrg } from './portal-fixtures.ts'

// Shared fixtures for the billing plan tests (accept to invoice, stage 1). setupBillingOrg() wraps setupPortalOrg(): the same
// organisation with the quote portal on, one client and three team profiles, plus everything an invoice needs to be issued
// (a complete company and a complete client) and the billing switch (billing_plans_enabled), on unless the caller says not.
// Quotes go out through the real send_quote, made by a signed-in member; a client's acceptance goes through the real
// portal_get_quote, portal_issue_code and portal_decide, called by the service role as the portal's server module calls them.
// Not a test file: the suite's glob is *.test.ts. teardown() is the one from setupPortalOrg and removes the organisation and
// everything under it (plans, items and invoices included) through helpers.cleanup().

export type BillingLine = { title: string; unitPrice: number; chargeKind: 'once_off' | 'monthly' | null }

export type BillingQuoteOptions = {
  /** The day billing starts. Left out: the first day of the month after next (South African time). null: no start date. */
  startDate?: string | null
  /** The term in months. Left out: 12. null: no term. */
  termMonths?: number | null
  /** Left out: a once-off "Setup" line of 10 000 and a monthly "Retainer" line of 1 500. */
  lines?: BillingLine[]
  /** The Sales record the quote belongs to. */
  opportunityId?: string | null
  /** The member who writes and sends the quote. Left out: the portal organisation's sender. */
  by?: PortalMember
}

export type BillingOrg = PortalOrg & {
  /** Switches billing_plans_enabled for the organisation, as the service role (the owner's own switch is tested in billing-plan-schema). */
  setBilling(enabled: boolean): Promise<void>
  /** A quote with the given terms and lines, written by a signed-in member and sent through the real send_quote. */
  sentBillingQuote(options?: BillingQuoteOptions): Promise<string>
  /** A link to the quote, a code, and the client's acceptance through portal_decide. Asserts ok. */
  acceptedOnPortal(quoteId: string): Promise<{ responseId: string; linkId: string }>
}

const DEFAULT_LINES: BillingLine[] = [
  { title: 'Setup', unitPrice: 10000, chargeKind: 'once_off' },
  { title: 'Retainer', unitPrice: 1500, chargeKind: 'monthly' },
]
const DEFAULT_TERM_MONTHS = 12
const CONSENT_ACCEPT = 'I confirm that I am authorised to act on behalf of the organisation and have reviewed and accept this quotation and its accompanying terms and conditions.'

/** The first day of the month after next, South African time, as YYYY-MM-DD. */
const defaultStartDate = () => {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number)
  const index = month - 1 + 2
  return `${year + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
}

export async function setupBillingOrg(label: string, options: { billing?: boolean } = {}): Promise<BillingOrg> {
  const billing = options.billing ?? true
  const base = await setupPortalOrg(label)
  try {
    // A complete company and a complete client: what issuing an invoice needs, so a test about billing never fails on the paperwork.
    assert.equal((await admin.from('organization_settings').update({
      vat_number: '4123456789', bank_name: 'Fixture Bank', bank_account_name: 'Portal Fixture (Pty) Ltd', bank_account_number: '62000000001',
      bank_branch_code: '250655', bank_account_type: 'Cheque', address_line1: '1 Fixture Street', city: 'Cape Town', postal_code: '8001', country: 'South Africa',
    }).eq('organization_id', base.orgId)).error, null)
    assert.equal((await admin.from('clients').update({
      billing_email: 'accounts@portal-client.test', address_line1: '2 Client Road', city: 'Johannesburg', postal_code: '2000',
    }).eq('id', base.clientId)).error, null)

    const setBilling = async (enabled: boolean) =>
      assert.equal((await admin.from('organization_settings').update({ billing_plans_enabled: enabled }).eq('organization_id', base.orgId)).error, null)

    const sentBillingQuote = async ({ startDate, termMonths, lines = DEFAULT_LINES, opportunityId = null, by = base.sender }: BillingQuoteOptions = {}) => {
      const quote = must(await by.client.from('quotes').insert({
        organization_id: base.orgId, client_id: base.clientId, client_name: 'Portal Client', opportunity_id: opportunityId,
        start_date: startDate === undefined ? defaultStartDate() : startDate,
        term_months: termMonths === undefined ? DEFAULT_TERM_MONTHS : termMonths,
      }).select('id').single())
      for (const [index, line] of lines.entries()) {
        const written = await by.client.from('quote_lines').insert({
          organization_id: base.orgId, quote_id: quote.id, position: index + 1, title: line.title, quantity: 1, unit_price: line.unitPrice, charge_kind: line.chargeKind,
        })
        assert.equal(written.error, null, `line ${line.title}: ${written.error?.message}`)
      }
      const sent = await by.client.rpc('send_quote', { p_id: quote.id })
      assert.equal(sent.error, null, `send_quote: ${sent.error?.message}`)
      return quote.id as string
    }

    const acceptedOnPortal = async (quoteId: string) => {
      const link = await base.newLink(quoteId, { email: 'billing.client@example.test', name: 'Pat Client' })
      const page = must(await admin.rpc('portal_get_quote', { p_token: link.token })) as Record<string, any>
      assert.equal(page.state, 'open', 'the page is open')
      const issued = must(await admin.rpc('portal_issue_code', { p_token: link.token })) as Record<string, any>
      assert.equal(issued.ok, true, `a code is issued: ${JSON.stringify(issued)}`)
      const decided = must(await admin.rpc('portal_decide', {
        p_token: link.token, p_code: issued.code, p_decision: 'accepted', p_signatory_name: 'Pat Client', p_signatory_position: 'Managing Director',
        p_signatory_organisation: 'Portal Client (Pty) Ltd', p_consent_text: CONSENT_ACCEPT, p_consent: true, p_snapshot_hash: page.snapshot_hash,
        p_decline_reason: null, p_decline_comments: null, p_ip: '203.0.113.7', p_user_agent: 'Mozilla/5.0 (billing fixture)',
      })) as Record<string, any>
      assert.equal(decided.ok, true, `the acceptance is recorded: ${JSON.stringify(decided)}`)
      const response = must(await admin.from('quote_responses').select('id').eq('link_id', link.id).single())
      return { responseId: response.id as string, linkId: link.id }
    }

    if (billing) await setBilling(true)
    return { ...base, setBilling, sentBillingQuote, acceptedOnPortal }
  } catch (error) {
    // The caller never receives a teardown when setup fails part way, so what was made is removed here.
    await base.teardown().catch(() => {})
    throw error
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Helpers shared by the billing test files (moved out of billing-plan-invoices.test.ts when billing-approval.test.ts needed them).
// Plans are built the way staff build them: an Accepted quote that carries terms, with the switch on, goes through the real
// create_invoice_from_quote. Rows are read back through the service role.
// ---------------------------------------------------------------------------------------------------------------------------

/** A refusal by the named token, and by its SQLSTATE (23514 for a rule, 42501 for "not found" and "not yours"). */
export const refused = (error: { code?: string; message: string } | null, token: string, code = '23514') => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(`\\b${token}\\b`), `expected ${token}, got: ${error.message}`)
  assert.equal(error.code, code, `${token}: ${error.message}`)
}
export const ok = (result: { error: { message: string } | null }, label: string) => assert.equal(result.error, null, `${label}: ${result.error?.message}`)

export const saToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/** An Accepted quote: written and sent by a member (the real send_quote), then set to Accepted by staff, as the quote page allows. */
export const acceptQuote = async (org: BillingOrg, options: BillingQuoteOptions = {}) => {
  const id = await org.sentBillingQuote(options)
  await org.setStatus(id, 'Accepted')
  return id
}

export const planOf = async (quote: string) => (await admin.from('billing_plans').select('*').eq('quote_id', quote).maybeSingle()).data as Record<string, any> | null
export const itemsOf = async (quote: string) => must(await admin.from('billing_plan_items').select('*').eq('quote_id', quote).order('month_number')) as Array<Record<string, any>>
export const invoiceOf = async (id: string) => must(await admin.from('invoices').select('*').eq('id', id).single()) as Record<string, any>
export const linkedTo = async (item: string) => must(await admin.from('invoices').select('id,status,archived_at,billing_plan_item_id').eq('billing_plan_item_id', item)) as Array<Record<string, any>>
export const activitiesOf = async (quote: string, kind: string) =>
  must(await admin.from('activities').select('*').eq('quote_id', quote).eq('kind', kind).order('created_at')) as Array<Record<string, any>>
/** Moves an item's date into the past, as the service role does when a test needs a month that is due. */
export const makeDue = async (item: string) => ok(await admin.from('billing_plan_items').update({ bill_on: '2020-01-01' }).eq('id', item), 'the item is due')

/** The plan, its items and the first invoice, built the way the quote page builds them. */
export const buildPlan = async (org: BillingOrg, options: BillingQuoteOptions = {}) => {
  const quote = await acceptQuote(org, options)
  const invoice = must(await org.sender.client.rpc('create_invoice_from_quote', { p_quote_id: quote })) as string
  return { quote, invoice, plan: await planOf(quote), items: await itemsOf(quote) }
}
