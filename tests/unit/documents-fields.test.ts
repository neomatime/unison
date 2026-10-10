import assert from 'node:assert/strict'
import test from 'node:test'

import { parseDecimal, readCompanyFields, readDocumentExtras, readLineFields, readPriceItemFields } from '../../features/documents/fields.ts'

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
const error = (result: unknown) => (result as { error?: string }).error

const line = { title: 'Advisory day', description: 'One day', quantity: '2', unitPrice: '1500', vatCode: 'standard' }

test('parseDecimal accepts plain decimals with a comma or spaces and rejects everything else', () => {
  assert.deepEqual(parseDecimal('1500'), { value: 1500, decimals: 0 })
  assert.deepEqual(parseDecimal('99.50'), { value: 99.5, decimals: 2 })
  assert.deepEqual(parseDecimal('1 200,5'), { value: 1200.5, decimals: 1 })
  assert.deepEqual(parseDecimal(' 7 '), { value: 7, decimals: 0 })
  for (const bad of ['', 'abc', '-1', '1e3', '1.2.3', '1,200.50', '.5', '5.', '1234567890123']) assert.equal(parseDecimal(bad), null, bad)
})

test('parseDecimal refuses a comma that looks like a thousands separator but keeps a decimal comma', () => {
  for (const ambiguous of ['1,200', '2,500', '10,000', '1 200,500']) assert.equal(parseDecimal(ambiguous), null, ambiguous)
  assert.deepEqual(parseDecimal('2,5'), { value: 2.5, decimals: 1 })
  assert.deepEqual(parseDecimal('99,99'), { value: 99.99, decimals: 2 })
  assert.deepEqual(parseDecimal('1 200,5'), { value: 1200.5, decimals: 1 })
})

test('a line reads title, description, quantity, price and VAT code', () => {
  assert.deepEqual(readLineFields(form(line)), {
    title: 'Advisory day', description: 'One day', quantity: 2, unit_price: 1500, vat_code: 'standard', price_list_item_id: null,
  })
  const withItem = readLineFields(form({ ...line, priceListItemId: '3b241101-e2bb-4255-8caf-4136c566a962', description: '  ' }))
  assert.equal((withItem as { description: unknown }).description, null)
  assert.equal((withItem as { price_list_item_id: unknown }).price_list_item_id, '3b241101-e2bb-4255-8caf-4136c566a962')
  assert.equal((readLineFields(form({ ...line, quantity: '2,5', unitPrice: '99,99' })) as { quantity: number }).quantity, 2.5)
})

test('a line refuses what the database would refuse, with a message that says what to fix', () => {
  const cases: Array<[Record<string, string>, RegExp]> = [
    [{ title: '   ' }, /title is required/i],
    [{ title: 'x'.repeat(201) }, /too long/i],
    [{ description: 'x'.repeat(2001) }, /too long/i],
    [{ quantity: '' }, /quantity/i],
    [{ quantity: '0' }, /more than zero/i],
    [{ quantity: '1.2345' }, /3 decimals/i],
    [{ quantity: '100000' }, /too large/i],
    [{ unitPrice: 'free' }, /unit price/i],
    [{ unitPrice: '1.999' }, /2 decimals/i],
    [{ unitPrice: '10000000' }, /too large/i],
    [{ vatCode: 'exempt' }, /standard rate or zero-rated/i],
    [{ vatCode: '' }, /standard rate or zero-rated/i],
    [{ priceListItemId: 'not-a-uuid' }, /price list item/i],
  ]
  for (const [override, message] of cases) assert.match(error(readLineFields(form({ ...line, ...override })))!, message, JSON.stringify(override))
  assert.equal(error(readLineFields(form({ ...line, unitPrice: '0' }))), undefined, 'a free line is allowed')
})

test('a quantity or price typed with a thousands comma is refused with a message that says what to type', () => {
  for (const typed of ['1,200', '2,500']) {
    assert.match(error(readLineFields(form({ ...line, quantity: typed })))!, /Enter a quantity as a plain number.*no thousands separators/, `quantity ${typed}`)
    assert.match(error(readLineFields(form({ ...line, unitPrice: typed })))!, /Enter a unit price as a plain number.*no thousands separators/, `unit price ${typed}`)
    assert.match(error(readPriceItemFields(form({ title: 'x', unitPrice: typed, vatCode: 'standard' })))!, /Enter a unit price as a plain number/, `price item ${typed}`)
  }
  assert.equal((readLineFields(form({ ...line, quantity: '2,5' })) as { quantity: number }).quantity, 2.5)
  assert.equal((readLineFields(form({ ...line, unitPrice: '1 200,5' })) as { unit_price: number }).unit_price, 1200.5)
})

test('a price list item reads title, description, price and VAT code', () => {
  assert.deepEqual(readPriceItemFields(form({ title: 'Workshop', description: '', unitPrice: '35 000', vatCode: 'zero' })), {
    title: 'Workshop', description: null, unit_price: 35000, vat_code: 'zero',
  })
  assert.match(error(readPriceItemFields(form({ title: '', unitPrice: '1', vatCode: 'standard' })))!, /title is required/i)
  assert.match(error(readPriceItemFields(form({ title: 'x', unitPrice: '-5', vatCode: 'standard' })))!, /unit price/i)
})

const company = {
  legalName: 'Test Co (Pty) Ltd', tagline: 'Do good', addressLine1: '1 Test Road', addressLine2: '', city: 'Testville', postalCode: '1234', country: 'Testland',
  vatNumber: 'V1', email: 'hello@test.example', phone: '011 000 0000', website: 'test.example',
  bankName: 'Test Bank', bankAccountName: 'Test Co', bankAccountNumber: '000', bankBranchCode: '111', bankAccountType: 'Current',
  documentPrefix: 'tst', vatRate: '15', defaultQuoteTerms: 'One\nTwo', defaultPaymentTerms: 'Pay in 30 days',
  quoteClosingText: 'Sign and return.', invoiceClosingText: 'Thank you.', defaultQuoteValidDays: '30', defaultPaymentDays: '30',
  logoPath: '/brand/logo.png', headerImagePath: '/brand/header.png',
}

test('company details read every setting, upper-case the prefix and turn blanks into null', () => {
  const result = readCompanyFields(form(company)) as Record<string, unknown>
  assert.equal(result.legal_name, 'Test Co (Pty) Ltd')
  assert.equal(result.document_prefix, 'TST')
  assert.equal(result.address_line2, null)
  assert.equal(result.vat_rate, 15)
  assert.equal(result.default_quote_valid_days, 30)
  assert.equal(result.default_payment_days, 30)
  assert.equal(result.logo_path, '/brand/logo.png')
  assert.equal(result.bank_account_number, '000')
  assert.equal(result.default_quote_terms, 'One\nTwo')
  const minimal = readCompanyFields(form({ ...Object.fromEntries(Object.keys(company).map((key) => [key, ''])), legalName: 'Min Co', documentPrefix: 'MN', vatRate: '15', defaultQuoteValidDays: '30', defaultPaymentDays: '0' })) as Record<string, unknown>
  assert.equal(minimal.error, undefined)
  assert.equal(minimal.logo_path, null)
  assert.equal(minimal.default_payment_days, 0)
})

test('company details refuse a bad prefix, VAT rate, days, email or image path', () => {
  const cases: Array<[Record<string, string>, RegExp]> = [
    [{ legalName: ' ' }, /company name is required/i],
    [{ documentPrefix: '' }, /prefix/i],
    [{ documentPrefix: 'DRAFT' }, /prefix/i],
    [{ documentPrefix: 'A' }, /prefix/i],
    [{ documentPrefix: 'TOO LONG!' }, /prefix/i],
    [{ vatRate: '101' }, /vat rate/i],
    [{ vatRate: 'abc' }, /vat rate/i],
    [{ vatRate: '15.555' }, /vat rate/i],
    [{ defaultQuoteValidDays: '0' }, /valid/i],
    [{ defaultQuoteValidDays: '366' }, /valid/i],
    [{ defaultPaymentDays: '-1' }, /payment days/i],
    [{ defaultPaymentDays: '1.5' }, /payment days/i],
    [{ email: 'not an email' }, /email/i],
    [{ logoPath: 'https://evil.test/x.png' }, /\/brand/i],
    [{ headerImagePath: '/brand/../x.png' }, /\/brand/i],
    [{ headerImagePath: '/other/x.png' }, /\/brand/i],
    [{ tagline: 'x'.repeat(121) }, /tagline.*too long/i],
    [{ defaultQuoteTerms: 'x'.repeat(5001) }, /too long/i],
  ]
  for (const [override, message] of cases) assert.match(error(readCompanyFields(form({ ...company, ...override })))!, message, JSON.stringify(override))
})

test('a very long malicious email is refused promptly, not after a backtracking storm', () => {
  const started = performance.now()
  const result = readCompanyFields(form({ ...company, email: '@'.repeat(5000) }))
  const elapsed = performance.now() - started
  assert.match(error(result)!, /email is too long/i)
  assert.ok(elapsed < 100, `took ${elapsed.toFixed(1)} ms`)
})

test('project details and the client reference read with limits', () => {
  assert.deepEqual(readDocumentExtras(form({ projectName: 'Phase 1', projectDescription: '', projectRef: 'P-1', clientRef: 'PO-9' })), {
    project_name: 'Phase 1', project_description: null, project_ref: 'P-1', client_ref: 'PO-9',
  })
  assert.deepEqual(readDocumentExtras(form({})), { project_name: null, project_description: null, project_ref: null, client_ref: null })
  assert.match(error(readDocumentExtras(form({ projectName: 'x'.repeat(201) })))!, /project name.*too long/i)
  assert.match(error(readDocumentExtras(form({ clientRef: 'x'.repeat(101) })))!, /client reference.*too long/i)
})
