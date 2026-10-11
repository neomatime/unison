import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const payments = (...parts: string[]) => read('features', 'payments', ...parts)

test('the payment actions check ids and input first, call only the database functions, and never write a table', () => {
  const source = payments('actions', 'payments.ts')
  assert.match(source, /^'use server'/)
  for (const line of source.split('\n')) {
    if (/^export /.test(line)) assert.match(line, /^export (async function|type) /, line)
  }
  assert.equal(source.split('isUuid(').length - 1 >= 3, true, 'every action checks its id')
  assert.match(source, /rpc\('record_payment'/)
  assert.match(source, /rpc\('void_payment'/)
  assert.match(source, /rpc\('cancel_invoice'/)
  assert.doesNotMatch(source, /from\('payments'\)|from\('invoices'\)/, 'no table is written from the action: the functions decide')
  assert.match(source, /readPaymentFields\(/)
  assert.match(source, /readVoidReason\(/)
  assert.match(source, /failureState\(/)
  assert.match(source, /revalidatePath\('\/finance\/forecast'\)/, 'the forecast page is refreshed by a payment')
})

test('the shared payment modules are loadable by tests', () => {
  for (const name of ['vocabulary.ts', 'fields.ts']) {
    const source = payments(name)
    assert.doesNotMatch(source, /^\s*['"]use (client|server)['"]/, name)
    assert.doesNotMatch(source, /server-only/, name)
    assert.doesNotMatch(source, /from\s+['"]@\//, name)
  }
})

test('the record payment form keeps what was typed after a failure, cannot be double-submitted, and clears after a success', () => {
  const source = payments('components', 'record-payment-form.tsx')
  assert.match(source, /^'use client'/)
  assert.match(source, /disabled=\{pending\}/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /startTransition\(/)
  assert.match(source, /\.reset\(\)/, 'a successful payment clears the form so it is not recorded twice')
  assert.match(source, /name="amount"/)
  assert.match(source, /name="receivedOn"/)
  assert.match(source, /name="method"/)
  assert.match(source, /name="reference"/)
  assert.match(source, /max=\{today\}/, 'the date field cannot pick a future day')
  assert.doesNotMatch(source, /server-only|lib\/email/, 'a client component imports no server code')
})

test('the void control asks for a reason and is disabled while pending', () => {
  const source = payments('components', 'void-payment-form.tsx')
  assert.match(source, /^'use client'/)
  assert.match(source, /name="reason"/)
  assert.match(source, /disabled=\{pending\}/)
  assert.match(source, /voidPaymentAction/)
})

test('the payments section tells a draft, a paid and a cancelled invoice apart, shows voided payments struck through, and lists who recorded each', () => {
  const source = payments('components', 'payments-section.tsx')
  assert.match(source, /Issue this invoice before recording payments/)
  assert.match(source, /paid in full/i)
  assert.match(source, /cancelled invoice takes no payments/i)
  assert.match(source, /line-through/)
  assert.match(source, /listPayments\(/)
  assert.match(source, /todayInJohannesburg\(/)
})

test('the payments list is read for one organisation and fails loudly', () => {
  const source = payments('queries', 'list-payments.ts')
  assert.match(source, /^import 'server-only'/)
  assert.match(source, /\.eq\('organization_id', organization\.id\)/)
  assert.match(source, /if \(\w+\.error\) throw/)
})

test('the invoice header offers Cancel invoice only when the invoice has no unvoided payment, and the page shows the payments', () => {
  const actions = read('features', 'documents', 'components', 'document-actions.tsx')
  assert.match(actions, /cancelInvoiceAction/)
  assert.match(actions, /hasPayments/)
  assert.match(actions, /kind === 'invoice' && !draft && !cancelled && !hasPayments/)
  const page = read('app', '(unison)', 'finance', 'invoices', '[invoiceId]', 'page.tsx')
  assert.match(page, /PaymentsSection invoiceId=/)
  assert.match(page, /listPayments\(/)
})

test('an issued invoice saves only its notes: the edit form and the action no longer take a status or a balance', () => {
  const action = read('features', 'commercial-finance', 'actions', 'phase-six.ts')
  const from = action.indexOf('} else if (kind === "invoice") {')
  const to = action.indexOf('} else if (kind === "expense") {')
  assert.ok(from > -1 && to > from)
  const invoice = action.slice(from, to)
  const issued = invoice.slice(invoice.indexOf('// Issued:'), invoice.indexOf('} else {', invoice.indexOf('// Issued:')))
  assert.ok(issued.includes('values = { notes: optional(form, "notes") };'), 'only the notes are written')
  assert.doesNotMatch(issued, /balance_amount|paid_at|status/, 'status, balance and paid date come from the payments')
  assert.match(issued, /INVOICE_FROZEN/, 'an old draft form posted to an issued invoice is told it is frozen')
  const form = read('features', 'commercial-finance', 'components', 'phase-six-form.tsx')
  const issuedForm = form.slice(form.indexOf('This invoice has been issued'), form.indexOf('The invoice number is assigned'))
  assert.doesNotMatch(issuedForm, /name="status"|name="balanceAmount"/)
  assert.match(issuedForm, /name="notes"/)
})

test('the forecast page is the calculated screen, the old typed-record routes are gone, and the screen explains how each column is worked out', () => {
  const page = read('app', '(unison)', 'finance', 'forecast', 'page.tsx')
  assert.match(page, /ForecastScreen/)
  assert.doesNotMatch(page, /PhaseSixRegister/)
  for (const gone of [['new', 'page.tsx'], ['[scenarioId]', 'page.tsx'], ['[scenarioId]', 'edit', 'page.tsx']]) {
    assert.throws(() => read('app', '(unison)', 'finance', 'forecast', ...gone), /ENOENT/, gone.join('/'))
  }
  const screen = read('features', 'forecast', 'components', 'forecast-screen.tsx')
  for (const text of ['Collected', 'Due from invoices', 'Pipeline (weighted)', 'No date', 'Later', 'How this is worked out', 'never added to another', 'Nothing to forecast yet']) {
    assert.match(screen, new RegExp(text.replace(/[()]/g, '\\$&')), text)
  }
  const query = read('features', 'forecast', 'queries', 'get-forecast.ts')
  assert.match(query, /^import 'server-only'/)
  assert.match(query, /if \(result\.error\) throw result\.error/)
  const build = read('features', 'forecast', 'build-forecast.ts')
  assert.doesNotMatch(build, /server-only|from\s+['"]@\//)
})
