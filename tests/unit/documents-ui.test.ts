import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8')

test('the quote and invoice forms no longer ask for a number or any total', () => {
  const form = read('features', 'commercial-finance', 'components', 'phase-six-form.tsx')
  for (const name of ['quoteNumber', 'invoiceNumber', 'subtotal', 'taxAmount', 'totalAmount']) {
    assert.doesNotMatch(form, new RegExp(`name="${name}"`), `${name} is generated or calculated`)
  }
  assert.doesNotMatch(form, /name="issueDate"/, 'an invoice is dated the day it is issued; the draft form has no issue date to type')
  assert.match(form, /isDraftStatus\(/, 'the form behaves differently for a sent or issued document')
  assert.match(form, /QUOTE_SENT_STATUSES/)
  assert.match(form, /INVOICE_ISSUED_STATUSES/)
})

test('the save action never writes a number, a total or a milestone for a quote or an invoice', () => {
  const action = read('features', 'commercial-finance', 'actions', 'phase-six.ts')
  const quote = action.slice(action.indexOf('kind === "quote"'), action.indexOf('kind === "invoice"'))
  const invoice = action.slice(action.indexOf('kind === "invoice"'), action.indexOf('kind === "expense"'))
  for (const [name, block] of [['quote', quote], ['invoice', invoice]] as const) {
    assert.doesNotMatch(block, /quote_number|invoice_number|subtotal|tax_amount|total_amount\s*[:,]|sent_at|accepted_at/, `${name} branch`)
    assert.match(block, /readDocumentExtras\(form\)/, `${name} branch reads the project and client reference`)
    assert.match(block, /isDraftStatus\(/, `${name} branch treats a sent or issued document differently`)
  }
  assert.match(action, /documentErrorMessage\(message\)/, 'database tokens become plain messages')
})

test('the register and detail queries show a draft as a draft, not as a reference code', () => {
  const queries = read('features', 'commercial-finance', 'queries', 'phase-six.ts')
  assert.match(queries, /isDraftReference\(/)
  assert.match(queries, /Draft quote/)
  assert.match(queries, /Draft invoice/)
  for (const key of ['projectName', 'clientRef', 'vatRate']) assert.match(queries, new RegExp(key))
})

test('quotes and invoices can no longer be imported, but can still be exported', () => {
  const source = read('features', 'data-portability', 'portable-collections.ts')
  const quotes = source.slice(source.indexOf('quotes: {'), source.indexOf('invoices: {'))
  const invoices = source.slice(source.indexOf('invoices: {'), source.indexOf('expenses: {'))
  for (const [name, block] of [['quotes', quotes], ['invoices', invoices]] as const) {
    assert.doesNotMatch(block, /importColumns/, `${name} must not be importable`)
    assert.match(block, /columns:\s*\[/, `${name} stays exportable`)
  }
})

test('a client can carry a billing address and a VAT number', () => {
  const schema = read('features', 'clients', 'schemas', 'client.ts')
  for (const field of ['addressLine1', 'addressLine2', 'city', 'postalCode', 'country', 'vatNumber']) assert.match(schema, new RegExp(field))
  for (const file of ['create-client.ts', 'update-client.ts']) {
    const source = read('features', 'clients', 'actions', file)
    for (const column of ['address_line1', 'address_line2', 'city', 'postal_code', 'country', 'vat_number']) assert.match(source, new RegExp(column), `${file} saves ${column}`)
  }
  const form = read('features', 'clients', 'components', 'client-form.tsx')
  for (const name of ['addressLine1', 'addressLine2', 'city', 'postalCode', 'country', 'vatNumber']) assert.match(form, new RegExp(`name="${name}"`))
})
