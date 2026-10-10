import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8')

/** The text between two exact markers; fails loudly if either is missing or they are out of order. */
function between(source: string, start: string, end: string, label: string) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + 1)
  assert.ok(from > -1, `${label}: opener not found: ${start}`)
  assert.ok(to > from, `${label}: closer not found after the opener: ${end}`)
  return source.slice(from, to)
}

const QUOTE_OPENER = '} else if (kind === "quote") {'
const INVOICE_OPENER = '} else if (kind === "invoice") {'
const EXPENSE_OPENER = '} else if (kind === "expense") {'

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
  const quote = between(action, QUOTE_OPENER, INVOICE_OPENER, 'quote branch')
  const invoice = between(action, INVOICE_OPENER, EXPENSE_OPENER, 'invoice branch')
  for (const [name, block] of [['quote', quote], ['invoice', invoice]] as const) {
    assert.doesNotMatch(block, /quote_number|invoice_number|subtotal|tax_amount|total_amount\s*[:,]|sent_at|accepted_at/, `${name} branch`)
    assert.match(block, /readDocumentExtras\(form\)/, `${name} branch reads the project and client reference`)
    assert.match(block, /isDraftStatus\(/, `${name} branch treats a sent or issued document differently`)
  }
  assert.match(action, /documentErrorMessage\(message\)/, 'database tokens become plain messages')
  assert.match(quote, /documentErrorMessage\("QUOTE_FROZEN"\)/, 'a stale form posted to a sent quote is told it is frozen')
  assert.match(invoice, /documentErrorMessage\("INVOICE_FROZEN"\)/, 'a stale form posted to an issued invoice is told it is frozen')
})

test('a sent quote saves only its status and notes; an issued invoice only its status, balance, paid date and notes', () => {
  const action = read('features', 'commercial-finance', 'actions', 'phase-six.ts')
  const quote = between(action, QUOTE_OPENER, INVOICE_OPENER, 'quote branch')
  const invoice = between(action, INVOICE_OPENER, EXPENSE_OPENER, 'invoice branch')
  assert.ok(quote.includes('values = { status, notes: optional(form, "notes") };'), 'the sent-quote branch builds exactly status and notes')

  // The issued branch runs from its comment to the "} else {" of the draft branch.
  const issued = between(invoice, '// Issued:', '} else {', 'issued invoice branch')
  const literal = issued.match(/values = \{([\s\S]*?)\n\s*\};/)
  assert.ok(literal, 'the issued-invoice branch assigns an object literal to values')
  const keys = [...literal[1].matchAll(/^\s*([a-z_]+)\s*[:,]/gm)].map((match) => match[1]).sort()
  assert.deepEqual(keys, ['balance_amount', 'notes', 'paid_at', 'status'])
})

test('the register and detail queries show a draft as a draft, not as a reference code', () => {
  const queries = read('features', 'commercial-finance', 'queries', 'phase-six.ts')
  assert.match(queries, /isDraftReference\(/)
  assert.match(queries, /Draft quote/)
  assert.match(queries, /Draft invoice/)
  const quotes = between(queries, 'export async function listQuotes', 'export async function listInvoices', 'listQuotes')
  const invoices = between(queries, 'export async function listInvoices', 'export async function listExpenses', 'listInvoices')
  assert.match(quotes, /name: documentName\(row\.quote_number, row\.client_name, "quote"\)/)
  assert.match(invoices, /name: documentName\(row\.invoice_number, row\.client_name, "invoice"\)/)
  for (const [name, block] of [['listQuotes', quotes], ['listInvoices', invoices]] as const) {
    for (const key of ['projectName', 'projectDescription', 'projectRef', 'clientRef', 'vatRate']) {
      assert.match(block, new RegExp(`\\b${key}: row\\.`), `${name} maps ${key}`)
    }
  }
  assert.match(quotes, /issueDate: row\.issue_date/)
  // The invoice form's "Source quote" list must not show a draft as DRAFT-xxxx.
  const options = between(queries, 'export async function getPhaseSixOptions', 'async function records', 'getPhaseSixOptions')
  assert.match(options, /select\("id,quote_number,client_name"\)/)
  assert.match(options, /label: documentName\(row\.quote_number, row\.client_name, "quote"\)/)
})

test('the register offers import only for a collection that has import columns', () => {
  const register = read('features', 'commercial-finance', 'components', 'phase-six-register.tsx')
  assert.doesNotMatch(register, /allowImport:\s*true/, 'a fixed allowImport: true would show a dead Import button on quotes and invoices')
  assert.match(register, /allowImport:\s*Boolean\(portableDefinitions\[portableCollectionByKind\[kind\]\]\.importColumns\)/)
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
