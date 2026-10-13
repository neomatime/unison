import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('filling terms goes only through set_document_terms and never overwrites typed terms without the tick', () => {
  const source = read('features/terms/actions/document-terms.ts')
  assert.match(source, /rpc\('set_document_terms'/)
  assert.doesNotMatch(source, /\.from\('(quotes|invoices)'\)/, 'the action never writes the document tables directly')
  assert.match(source, /form\.get\('confirm'\) !== 'yes'/)
  assert.match(source, /plan\.ok/)
})

test('the migration makes the template columns function-only and freezes them', () => {
  const sql = read('supabase/migrations/20261013100000_document_terms.sql')
  assert.match(sql, /TERMS_COLUMNS_GENERATED/)
  assert.match(sql, /security definer set search_path = ''/)
  assert.match(sql, /revoke all on function public\.set_document_terms/)
  assert.match(sql, /grant execute on function public\.set_document_terms[\s\S]*to authenticated/)
  assert.match(sql, /v\.organization_id = v_org and v\.status in \('approved', 'archived'\)/, 'sources must belong to the same organisation')
  assert.match(sql, /quote_terms_sources/)
})

test('both document pages mount the terms panel and the sheet prints inclusions', () => {
  assert.match(read('app/(unison)/commercial/quotes/[quoteId]/page.tsx'), /DocumentTermsPanel kind="quote"/)
  assert.match(read('app/(unison)/finance/invoices/[invoiceId]/page.tsx'), /DocumentTermsPanel kind="invoice"/)
  assert.match(read('features/documents/components/document-sheet.tsx'), /Service inclusions/)
  assert.match(read('features/documents/pdf/render-document-pdf.ts'), /Service inclusions/)
})
