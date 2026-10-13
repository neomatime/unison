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

test('a new quote or invoice no longer starts from a package: no Package list, no database fill, project names come from HIVE', () => {
  const form = read('features', 'commercial-finance', 'components', 'phase-six-form.tsx')
  assert.doesNotMatch(form, /PackageSelect|name="packageKey"|rate-card/)
  const action = read('features', 'commercial-finance', 'actions', 'phase-six.ts')
  assert.doesNotMatch(action, /packageKey|fill_document_from_package|package_failed/)
  const query = read('features', 'commercial-finance', 'queries', 'phase-six.ts')
  assert.doesNotMatch(query, /price_list_items|packageOptions/)
  assert.match(query, /fetchHiveOfferings\(\)/)
  for (const page of [['app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx'], ['app', '(unison)', 'finance', 'invoices', '[invoiceId]', 'page.tsx']]) {
    assert.doesNotMatch(read(...page), /package_failed|searchParams/)
  }
})

test('the rate card picker is gone: lines are added from HIVE offerings or by hand', () => {
  const editor = read('features', 'documents', 'components', 'line-editor.tsx')
  assert.doesNotMatch(editor, /RateCardPicker|addRateCardLineAction|Add from the rate card/)
  assert.match(editor, /\{locked \? null : <HiveOfferingPicker /)
  for (const page of [['app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx'], ['app', '(unison)', 'finance', 'invoices', '[invoiceId]', 'page.tsx']]) {
    const source = read(...page)
    assert.doesNotMatch(source, /listRateCardItems|rateItems/)
    assert.match(source, /hiveOfferings=\{hiveOfferings\}/)
  }
  assert.doesNotMatch(read('features', 'documents', 'actions', 'lines.ts'), /add_rate_card_line/)
  assert.doesNotMatch(read('features', 'documents', 'queries', 'list-hive-offerings.ts'), /listRateCardItems/)
})
