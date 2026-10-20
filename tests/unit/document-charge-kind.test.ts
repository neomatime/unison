import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { lineColumns, readLineFields } from '../../features/documents/fields.ts'
import { chargeKindForOffering, hiveOfferingToLine } from '../../features/documents/hive-offerings.ts'
import { parseHiveOfferingsFeed } from '../../lib/integrations/hive-offerings.ts'

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

const offering = (kind: string, billingPeriod: string | null) =>
  parseHiveOfferingsFeed({
    schemaVersion: '1.0', source: 's', workspace: { key: 'k', name: 'n' }, generatedAt: 'x', revision: 'r',
    offerings: [{
      key: `${kind}:x`, kind, name: 'X', status: 'active',
      price: { model: 'fixed', currency: 'ZAR', amount: 1000, billingPeriod, binding: true },
    }],
  }).offerings[0]

test('chargeKindForOffering maps retainer and support to monthly, implementation, project and credit packs to once_off, and a month billing period to monthly', () => {
  const cases: Array<[kind: string, billingPeriod: string | null, expected: 'monthly' | 'once_off']> = [
    // The kind alone decides a retainer or a support service, whatever the feed says about the period.
    ['retainer', 'month', 'monthly'],
    ['retainer', null, 'monthly'],
    ['support', 'month', 'monthly'],
    ['support', null, 'monthly'],
    // One-time fees and fixed-scope projects are once-off.
    ['retainer_implementation', 'once', 'once_off'],
    ['project', null, 'once_off'],
    ['project', 'once', 'once_off'],
    ['credit_pack', 'once', 'once_off'],
    // A kind this code does not know is decided by its billing period.
    ['something_new', 'month', 'monthly'],
    ['something_new', 'once', 'once_off'],
    ['something_new', null, 'once_off'],
  ]
  for (const [kind, period, expected] of cases) {
    assert.equal(chargeKindForOffering(offering(kind, period)), expected, `${kind} billed ${period}`)
  }
})

test('a line made from a HIVE offering carries the charge kind of that offering', () => {
  assert.equal(hiveOfferingToLine(offering('retainer', 'month'))?.charge_kind, 'monthly')
  assert.equal(hiveOfferingToLine(offering('support', 'month'))?.charge_kind, 'monthly')
  assert.equal(hiveOfferingToLine(offering('retainer_implementation', 'once'))?.charge_kind, 'once_off')
  assert.equal(hiveOfferingToLine(offering('credit_pack', 'once'))?.charge_kind, 'once_off')
})

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
const line = { title: 'Advisory day', description: 'One day', quantity: '2', unitPrice: '1500', vatCode: 'standard' }

test('readLineFields reads chargeKind, treats blank as null and refuses an unknown value', () => {
  const kindOf = (fields: Record<string, string>) => (readLineFields(form(fields)) as { charge_kind?: unknown }).charge_kind
  assert.equal(kindOf({ ...line, chargeKind: 'once_off' }), 'once_off')
  assert.equal(kindOf({ ...line, chargeKind: 'monthly' }), 'monthly')
  assert.equal(kindOf({ ...line, chargeKind: '' }), null, 'blank is Not set')
  assert.equal(kindOf({ ...line, chargeKind: '   ' }), null, 'spaces are blank')
  assert.equal(kindOf(line), null, 'a form without the field is Not set')
  for (const bad of ['weekly', 'Monthly', 'MONTHLY', 'once-off', 'once_off;', 'null']) {
    assert.deepEqual(readLineFields(form({ ...line, chargeKind: bad })), { error: 'Choose Once-off or Monthly.' }, bad)
  }
  // The rest of the line is read as before.
  assert.deepEqual(readLineFields(form({ ...line, chargeKind: 'monthly' })), {
    title: 'Advisory day', description: 'One day', quantity: 2, unit_price: 1500, vat_code: 'standard', charge_kind: 'monthly',
  })
})

test('a line written to an invoice carries no charge kind, a line written to a quote keeps it', () => {
  const fields = { title: 'T', description: null, quantity: 1, unit_price: 10, vat_code: 'standard' as const, charge_kind: 'monthly' as const }
  assert.deepEqual(lineColumns('quote', fields), fields)
  const forInvoice = lineColumns('invoice', fields)
  assert.equal(Object.hasOwn(forInvoice, 'charge_kind'), false, 'invoice_lines has no charge_kind column')
  assert.deepEqual(forInvoice, { title: 'T', description: null, quantity: 1, unit_price: 10, vat_code: 'standard' })
  assert.equal(fields.charge_kind, 'monthly', 'the fields that were passed in are not changed')
  // A blank kind is still dropped for an invoice, not written as null.
  assert.equal(Object.hasOwn(lineColumns('invoice', { ...fields, charge_kind: null }), 'charge_kind'), false)
})

test('addLineAction, updateLineAction and addHiveOfferingLineAction each drop the charge kind unless the document is a quote', () => {
  // These three serve invoices as well, and invoice_lines has no charge_kind column: a raw spread of the
  // fields would make every invoice line fail to save.
  const lines = read('features', 'documents', 'actions', 'lines.ts')
  const hive = read('features', 'documents', 'actions', 'hive-offering-line.ts')
  const bodyOf = (source: string, opener: string, closer?: string) => {
    const from = source.indexOf(opener)
    assert.ok(from > -1, `${opener} not found`)
    const to = closer ? source.indexOf(closer, from + 1) : source.length
    assert.ok(to > from, `${closer} not found after ${opener}`)
    return source.slice(from, to)
  }
  const actions = [
    ['addLineAction', bodyOf(lines, 'export async function addLineAction', 'export async function updateLineAction'), /\.\.\.lineColumns\(kind, fields\)/],
    ['updateLineAction', bodyOf(lines, 'export async function updateLineAction', 'export async function removeLineAction'), /\.update\(lineColumns\(kind, fields\)\)/],
    ['addHiveOfferingLineAction', bodyOf(hive, 'export async function addHiveOfferingLineAction'), /\.\.\.lineColumns\(kind, line\)/],
  ] as const
  for (const [name, body, write] of actions) {
    assert.match(body, write, `${name} writes lineColumns(kind, ...), which guards on the kind`)
    assert.doesNotMatch(body, /\.\.\.(fields|line)\b|\.update\((fields|line)\)/, `${name} must not write the raw fields`)
    assert.ok(body.indexOf('isDocumentKind(kind)') > -1 && body.indexOf('isDocumentKind(kind)') < body.indexOf('lineColumns('), `${name} checks the kind before it picks the columns`)
  }
  assert.match(lines, /import \{ lineColumns, readLineFields \} from '\.\.\/fields'/)
  assert.match(hive, /import \{ lineColumns \} from '\.\.\/fields'/)
})

test('the line editor offers the charge kind for quotes only, Once-off by default when adding and Not set when the line has none', () => {
  const source = read('features', 'documents', 'components', 'line-editor.tsx')
  const vocabularyImport = source.match(/import \{([^}]*)\} from '\.\.\/vocabulary'/)?.[1] ?? ''
  assert.match(vocabularyImport, /\bCHARGE_KINDS\b/, 'the kinds come from the vocabulary, not a copy')
  assert.match(vocabularyImport, /\bCHARGE_KIND_LABELS\b/, 'the labels come from the vocabulary, not a copy')
  assert.doesNotMatch(source, /Once-off|Monthly/, 'no label is typed out in the component')
  assert.match(source, /name="chargeKind"/)
  const selects = [...source.matchAll(/\{kind === 'quote' \? <ChargeKindSelect\b.*? \/> : null\}/g)]
  assert.equal(selects.length, 2, 'the select sits behind a quote check in both the add form and the edit form')
  assert.equal([...source.matchAll(/<ChargeKindSelect\b/g)].length, 2, 'there is no unguarded select')
  assert.match(source, /const EMPTY = \{[^}]*chargeKind: 'once_off'[^}]*\}/, 'a new line starts as Once-off')
  assert.match(source, /<ChargeKindSelect\b[^>]*defaultValue=\{line\.charge_kind \?\? ''\}[^>]*notSet[^>]*\/>|<ChargeKindSelect\b[^>]*notSet[^>]*defaultValue=\{line\.charge_kind \?\? ''\}[^>]*\/>/, 'the edit form starts at the line value, blank when there is none, and offers Not set')
  assert.match(source, /<option value="">Not set<\/option>/)
  assert.match(source, /line\.charge_kind \? /, 'a line row shows its kind as text only when it has one')
})

test('the line type has a charge kind, which an invoice line leaves unset', () => {
  assert.match(read('features', 'documents', 'types.ts'), /charge_kind: string \| null/)
})
