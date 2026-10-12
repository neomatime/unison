import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { documentErrorMessage } from '../../features/documents/errors.ts'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

test('the two new database refusals have plain messages', () => {
  assert.match(documentErrorMessage('DOCUMENT_NOT_EMPTY')!, /already has lines/i)
  assert.match(documentErrorMessage('RATE_QUANTITY_INVALID')!, /whole number/i)
})

test('both database functions create locked lines only on a draft in the caller\'s organisation and take no price', () => {
  const sql = read('supabase', 'migrations', '20261012140000_document_rate_card_lines.sql')
  for (const name of ['fill_document_from_package', 'add_rate_card_line']) {
    const body = sql.slice(sql.indexOf(`function public.${name}`))
    const fn = body.slice(0, body.indexOf('end $$;'))
    assert.match(fn, /security definer set search_path = ''/, `${name} is a definer function with an empty search path`)
    assert.match(fn, /public\.is_member_of\(v_org\)/, `${name} checks membership`)
    assert.match(fn, /QUOTE_NOT_DRAFT/, `${name} refuses a quote that is not a draft`)
    assert.match(fn, /INVOICE_NOT_DRAFT/, `${name} refuses an invoice that is not a draft`)
    assert.match(fn, /private\.add_rate_line\(/, `${name} writes locked lines through the shared helper`)
    assert.doesNotMatch(fn, /p_price|p_unit_price|p_amount/, `${name} takes no price`)
    assert.ok(sql.includes(`grant execute on function public.${name}`), `${name} is granted to authenticated`)
    assert.ok(sql.includes(`revoke all on function public.${name}`), `${name} is revoked from public and anon`)
  }
  assert.match(sql, /DOCUMENT_NOT_EMPTY/)
  assert.match(sql, /RATE_QUANTITY_INVALID/)
})

test('a NEW quote or invoice offers the Package dropdown, an existing one does not', () => {
  const form = read('features', 'commercial-finance', 'components', 'phase-six-form.tsx')
  assert.equal([...form.matchAll(/\{record \? null : <PackageSelect packages=\{options\.packages\} value=\{identity\.packageKey\} onChange=\{identity\.onPackage\} \/>\}/g)].length, 2, 'once for quotes and once for invoices, only when there is no record')
  assert.match(form, /<select name="packageKey" value=\{value\} onChange=/)
  assert.match(form, /Blank \(add the lines yourself on the next page\)/)
  assert.match(form, /label="Retainer \(monthly fee plus one-time implementation fee\)"/)
  assert.match(form, /label="Project \(fixed fee\)"/)
})

test('the save action fills a NEW draft from the package through the database function, with only a key from the browser', () => {
  const action = read('features', 'commercial-finance', 'actions', 'phase-six.ts')
  assert.match(action, /const packageKey = !id && \(kind === "quote" \|\| kind === "invoice"\) \? optional\(form, "packageKey"\) : null;/, 'read only when creating a quote or invoice')
  assert.match(action, /\/\^\[a-z0-9_\]\{1,60\}\$\/\.test\(packageKey\)/, 'the key is validated')
  assert.match(action, /rpc\("fill_document_from_package", \{ p_kind: kind, p_document: result\.data\.id, p_package_key: packageKey \}\)/)
  assert.match(action, /redirect\(`\$\{routes\[kind\]\}\/\$\{result\.data\.id\}\?notice=package_failed`\)/, 'a failed fill lands on the saved draft instead of keeping the form open, so it is not saved twice')
  assert.match(action, /if \(packageKey\) values\.currency = "ZAR"/, 'a package makes the document a rand document')
  assert.ok(action.indexOf('fill_document_from_package') > action.indexOf('.insert(values)'), 'filling happens after the draft is saved')
})

test('the package labels come from the rate card rows, with the implementation fee shown for a retainer', () => {
  const query = read('features', 'commercial-finance', 'queries', 'phase-six.ts')
  assert.match(query, /\.in\("item_kind", \["retainer_monthly", "retainer_implementation", "project"\]\)/)
  assert.match(query, /\.not\("rate_key", "is", null\)/)
  assert.match(query, /if \(implementation === undefined\) continue;/, 'a retainer without its implementation fee is not offered')
  assert.match(query, /packages: packageOptions\(rateRows\.error \? \[\] : rateRows\.data \?\? \[\]\)/, 'a failed rate read only removes the choices')
})

test('the line editor offers the rate card on a draft only, and its action sends a key and a whole credit count, never a price', () => {
  const editor = read('features', 'documents', 'components', 'line-editor.tsx')
  assert.match(editor, /\{locked \? null : <RateCardPicker kind=\{kind\} documentId=\{documentId\} rateItems=\{rateItems\} currency=\{currency\} \/>\}/)
  assert.match(editor, /Add from the rate card \(fixed prices, excluding VAT\)/)
  assert.match(editor, /Top-up credits \(per credit\)/)
  assert.match(editor, /data\.set\('quantity', isTopUp \? quantity : '1'\)/, 'only top-up credits take a quantity')
  const picker = editor.slice(editor.indexOf('function RateCardPicker'))
  assert.deepEqual([...picker.matchAll(/data\.set\('(\w+)'/g)].map((m) => m[1]), ['rateKey', 'quantity'], 'the picker sends only a key and a quantity, never a price')
  for (const page of [['app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx'], ['app', '(unison)', 'finance', 'invoices', '[invoiceId]', 'page.tsx']]) {
    const source = read(...page)
    assert.match(source, /const rateItems = locked \? \[\] : await listRateCardItems\(\)/)
    assert.match(source, /rateItems=\{rateItems\}/)
  }
  const lines = read('features', 'documents', 'actions', 'lines.ts')
  const add = lines.slice(lines.indexOf('export async function addRateCardLineAction'))
  assert.match(add, /isDocumentKind\(kind\) \|\| !isUuid\(documentId\)/)
  assert.match(add, /\/\^\[a-z0-9_\.\]\{1,80\}\$\/\.test\(rateKey\)/)
  assert.match(add, /\/\^\\d\{1,5\}\$\/\.test\(rawQuantity\)/)
  assert.match(add, /rpc\('add_rate_card_line', \{ p_kind: kind, p_document: documentId, p_rate_key: rateKey, p_quantity: Number\(rawQuantity\) \}\)/)
  assert.doesNotMatch(add, /unit_price|unitPrice|amount/i)
})

test('the rate card query lists only rate card rows that are not archived', () => {
  const query = read('features', 'documents', 'queries', 'list-price-items.ts')
  const fn = query.slice(query.indexOf('export async function listRateCardItems'))
  assert.match(fn, /\.not\('rate_key', 'is', null\)/)
  assert.match(fn, /\.is\('archived_at', null\)/)
})
