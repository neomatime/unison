import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  BILLING_TERMS_COPY, agreementSentence, formatTermMonths, quoteHasMonthlyLine, readBillingTerms,
} from '../../features/documents/billing-terms.ts'
import { documentErrorMessage } from '../../features/documents/errors.ts'

// Accept to invoice, stage 1, task 6: the start date and term on a quote, staff side.

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

const BOTH = 'Enter both a start date and a term in months, or leave both blank.'
const DATE = 'Enter a valid start date.'
const TERM = 'The term must be a whole number of months from 1 to 120.'

test('both blank (or absent) means no terms', () => {
  assert.deepEqual(readBillingTerms(form({})), { start_date: null, term_months: null })
  assert.deepEqual(readBillingTerms(form({ startDate: '', termMonths: '' })), { start_date: null, term_months: null })
  assert.deepEqual(readBillingTerms(form({ startDate: '  ', termMonths: ' ' })), { start_date: null, term_months: null })
})

test('a valid pair is read as a date string and a whole number', () => {
  assert.deepEqual(readBillingTerms(form({ startDate: '2026-12-15', termMonths: '12' })), { start_date: '2026-12-15', term_months: 12 })
  assert.deepEqual(readBillingTerms(form({ startDate: '2020-01-01', termMonths: '1' })), { start_date: '2020-01-01', term_months: 1 })
  assert.deepEqual(readBillingTerms(form({ startDate: '2100-12-31', termMonths: '120' })), { start_date: '2100-12-31', term_months: 120 })
  assert.deepEqual(readBillingTerms(form({ startDate: '2028-02-29', termMonths: '6' })), { start_date: '2028-02-29', term_months: 6 })
  // Surrounding spaces are trimmed like every other field.
  assert.deepEqual(readBillingTerms(form({ startDate: ' 2026-12-15 ', termMonths: '12 ' })), { start_date: '2026-12-15', term_months: 12 })
})

test('one without the other is refused, whichever way round', () => {
  assert.deepEqual(readBillingTerms(form({ startDate: '2026-12-15', termMonths: '' })), { error: BOTH })
  assert.deepEqual(readBillingTerms(form({ startDate: '2026-12-15' })), { error: BOTH })
  assert.deepEqual(readBillingTerms(form({ startDate: '', termMonths: '12' })), { error: BOTH })
  assert.deepEqual(readBillingTerms(form({ termMonths: '12' })), { error: BOTH })
  // The sentence is about the pair, so it is given even when the one that is there is not valid.
  assert.deepEqual(readBillingTerms(form({ startDate: 'tomorrow' })), { error: BOTH })
})

test('the date must be a real date from 2020-01-01 to 2100-12-31 in YYYY-MM-DD', () => {
  for (const bad of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '1999-12-31', '2019-12-31', '2101-01-01', '2026-1-5', '15/12/2026', '2026/12/15', 'tomorrow', '20261215', '2026-12-15T00:00']) {
    assert.deepEqual(readBillingTerms(form({ startDate: bad, termMonths: '12' })), { error: DATE }, bad)
  }
})

test('the term must be a whole number of months from 1 to 120', () => {
  for (const bad of ['0', '121', '12.5', '12,5', '-1', '1e1', 'abc', '0x10', '+12', '1 2', '1000']) {
    assert.deepEqual(readBillingTerms(form({ startDate: '2026-12-15', termMonths: bad })), { error: TERM }, bad)
  }
  // "12 " is a 12: the value is trimmed first, as every field in the app is.
  assert.deepEqual(readBillingTerms(form({ startDate: '2026-12-15', termMonths: '12 ' })), { start_date: '2026-12-15', term_months: 12 })
  assert.deepEqual(readBillingTerms(form({ startDate: '2026-12-15', termMonths: '012' })), { start_date: '2026-12-15', term_months: 12 })
})

test('when both are wrong the date is reported first', () => {
  assert.deepEqual(readBillingTerms(form({ startDate: '2026-02-30', termMonths: '0' })), { error: DATE })
})

test('quoteHasMonthlyLine is true only for a monthly charge kind', () => {
  assert.equal(quoteHasMonthlyLine([]), false)
  assert.equal(quoteHasMonthlyLine([{ charge_kind: 'once_off' }, { charge_kind: null }, {}]), false)
  assert.equal(quoteHasMonthlyLine([{ charge_kind: 'once_off' }, { charge_kind: 'monthly' }]), true)
  assert.equal(quoteHasMonthlyLine([{ charge_kind: undefined }, { charge_kind: null }]), false)
  assert.equal(quoteHasMonthlyLine([{ charge_kind: 'Monthly' }, { charge_kind: 1 }]), false)
})

test('the agreement sentence names the monthly figure, the term and the start date', () => {
  assert.equal(agreementSentence({ monthly: 'ZAR 1,725.00', termMonths: 12, startDateLabel: '15 December 2026' }), 'ZAR 1,725.00 per month for 12 months from 15 December 2026')
  assert.equal(agreementSentence({ monthly: 'ZAR 1,725.00', termMonths: 1, startDateLabel: '15 December 2026' }), 'ZAR 1,725.00 per month for 1 month from 15 December 2026')
  // No single monthly figure: say how many monthly payments there are.
  assert.equal(agreementSentence({ monthly: null, termMonths: 12, startDateLabel: '15 December 2026' }), '12 monthly payments from 15 December 2026')
  assert.equal(agreementSentence({ monthly: null, termMonths: 1, startDateLabel: '15 December 2026' }), '1 monthly payment from 15 December 2026')
  // Without a term or without a date there is no sentence.
  assert.equal(agreementSentence({ monthly: 'ZAR 1,725.00', termMonths: 12, startDateLabel: null }), null)
  assert.equal(agreementSentence({ monthly: 'ZAR 1,725.00', termMonths: null, startDateLabel: '15 December 2026' }), null)
  assert.equal(agreementSentence({ monthly: null, termMonths: null, startDateLabel: null }), null)
  assert.equal(agreementSentence({ monthly: 'ZAR 1,725.00', termMonths: 12, startDateLabel: '' }), null)
})

test('a term reads as months, with one month in the singular', () => {
  assert.equal(formatTermMonths(1), '1 month')
  assert.equal(formatTermMonths(12), '12 months')
  assert.equal(formatTermMonths(120), '120 months')
})

test('the copy staff see is the wording the brief fixes', () => {
  assert.equal(BILLING_TERMS_COPY.startDateLabel, 'Start date of the monthly charge')
  assert.equal(BILLING_TERMS_COPY.termLabel, 'Term in months')
  assert.equal(BILLING_TERMS_COPY.helper, 'Needed when the quote has a monthly charge. Both are fixed once the quote is sent.')
  assert.equal(BILLING_TERMS_COPY.detailStartDate, 'Start date')
  assert.equal(BILLING_TERMS_COPY.detailTerm, 'Term')
})

test('the four tokens have their plain messages, and no earlier token swallows them', () => {
  const messages: Array<[string, string]> = [
    ['QUOTE_BILLING_TERMS_REQUIRED', 'Add a start date and a term in months before sending: this quote has a monthly charge.'],
    ['QUOTE_CHARGE_KINDS_INCOMPLETE', 'Give every line a charge kind, once-off or monthly, before sending: this quote has a monthly charge.'],
    ['quotes_billing_terms_check', BOTH],
    ['quotes_term_months_range', TERM],
  ]
  for (const [token, message] of messages) {
    assert.equal(documentErrorMessage(token), message, token)
    assert.equal(documentErrorMessage(`new row violates ${token} (23514)`), message, `${token} inside a database message`)
  }
  // The messages Postgres gives for the two table checks carry the constraint name inside quotes.
  assert.equal(documentErrorMessage('new row for relation "quotes" violates check constraint "quotes_billing_terms_check"'), BOTH)
  assert.equal(documentErrorMessage('new row for relation "quotes" violates check constraint "quotes_term_months_range"'), TERM)
})

test('the migration raises both tokens and copies the terms on duplicate and revise', () => {
  const sql = read('supabase', 'migrations', '20261026105000_quote_billing_terms_send.sql')
  assert.ok(sql.includes("raise exception 'QUOTE_BILLING_TERMS_REQUIRED' using errcode = '23514'"))
  assert.ok(sql.includes("raise exception 'QUOTE_CHARGE_KINDS_INCOMPLETE' using errcode = '23514'"))
  // The terms check comes before the charge kinds check, and both come after the lines check.
  const lines = sql.indexOf("'QUOTE_NEEDS_LINES'")
  const terms = sql.indexOf("'QUOTE_BILLING_TERMS_REQUIRED'")
  const kinds = sql.indexOf("'QUOTE_CHARGE_KINDS_INCOMPLETE'")
  assert.ok(lines > -1 && lines < terms && terms < kinds, 'lines, then terms, then charge kinds')
  for (const name of ['send_quote(uuid)', 'duplicate_quote(uuid)', 'revise_quote(uuid)']) {
    assert.ok(sql.includes(`revoke all on function public.${name} from public, anon;`), `${name} is revoked from public and anon`)
    assert.ok(sql.includes(`grant execute on function public.${name} to authenticated;`), `${name} is granted to authenticated`)
  }
  assert.equal((sql.match(/set search_path = ''/g) ?? []).length, 3, 'each of the three functions has an empty search_path')
})

test('the draft branch of the quote action reads the terms and the sent branch does not', () => {
  const source = read('features', 'commercial-finance', 'actions', 'phase-six.ts')
  const quote = source.slice(source.indexOf('} else if (kind === "quote") {'), source.indexOf('} else if (kind === "invoice") {'))
  assert.ok(quote.length > 500, 'the quote branch was found')
  const split = quote.indexOf('} else {')
  assert.ok(split > -1)
  const sent = quote.slice(0, split)
  const draft = quote.slice(split)
  assert.match(draft, /readBillingTerms\(form\)/, 'the draft branch reads the terms')
  assert.match(draft, /\.\.\.terms/, 'and writes them into the values')
  assert.match(draft, /"error" in terms\)\s*return \{ error: terms\.error \}/, 'an error is the action state')
  assert.doesNotMatch(sent, /readBillingTerms|start_date|term_months/, 'the sent branch never touches the terms')
  assert.match(sent, /values = \{ status, notes: optional\(form, "notes"\) \};/, 'a sent quote still writes only its status and notes')
  // Nothing else in the file reads them (an invoice or a lead has no terms).
  assert.equal((source.match(/readBillingTerms/g) ?? []).length, 2, 'one import and one call')
  assert.match(source, /import \{ readBillingTerms \} from "@\/features\/documents\/billing-terms";/)
})

test('the draft quote form has the two fields after Valid until, and a sent quote form does not', () => {
  const source = read('features', 'commercial-finance', 'components', 'phase-six-form.tsx')
  const draftStart = source.indexOf('<Notice>The quote number is assigned when the quote is sent.')
  const sentEnd = draftStart
  const sent = source.slice(source.indexOf('if (kind === "quote") {'), sentEnd)
  const draft = source.slice(draftStart, source.indexOf('if (kind === "invoice") {'))
  assert.doesNotMatch(sent, /startDate|termMonths/, 'a sent quote form has neither field')
  const valid = draft.indexOf('name="validUntil"')
  const start = draft.indexOf('name="startDate"')
  const term = draft.indexOf('name="termMonths"')
  assert.ok(valid > -1 && valid < start && start < term, 'Valid until, then the start date, then the term')
  assert.ok(term < draft.indexOf('<Currency'), 'before the currency')
  assert.match(draft, /name="startDate" label=\{BILLING_TERMS_COPY\.startDateLabel\} type="date"/)
  assert.match(draft, /name="termMonths" label=\{BILLING_TERMS_COPY\.termLabel\} type="number" min=\{1\} max=\{120\} step="1"/)
  assert.equal((draft.match(/hint=\{BILLING_TERMS_COPY\.helper\}/g) ?? []).length, 2, 'both fields carry the helper text')
})

test('the quote detail lists Start date and Term after Valid until, and the mapper carries both', () => {
  const detail = read('features', 'commercial-finance', 'components', 'phase-six-detail.tsx')
  assert.match(detail, /\["Valid until", "validUntil"\],\s*\[BILLING_TERMS_COPY\.detailStartDate, "startDate"\], \[BILLING_TERMS_COPY\.detailTerm, "termMonths"\],/)
  assert.match(detail, /key === "termMonths"/)
  const mapper = read('features', 'commercial-finance', 'phase-six-mappers.ts')
  const quote = mapper.slice(mapper.indexOf("case 'quote':"), mapper.indexOf("case 'opportunity':"))
  assert.match(quote, /startDate: row\.start_date,/)
  assert.match(quote, /termMonths: row\.term_months,/)
})

test('billing-terms.ts is a pure module: no directive, no imports, no invisible characters', () => {
  const source = read('features', 'documents', 'billing-terms.ts')
  assert.doesNotMatch(source, /^\s*['"]use (client|server)['"]/m)
  assert.doesNotMatch(source, /server-only/)
  assert.doesNotMatch(source, /^\s*import\b/m, 'it imports nothing, document-view.ts imports it and a cycle is not wanted')
  assert.doesNotMatch(source, /from\s+['"][^'"]*document-view/)
  assert.doesNotMatch(source, /[^\n\x20-\x7e]/, 'plain ASCII only')
})
