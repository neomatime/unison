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

test('the follow-up migration keeps the template columns function-only and copies offerings to the invoice', () => {
  const sql = read('supabase/migrations/20261013100000_document_terms.sql')
  assert.match(sql, /TERMS_COLUMNS_GENERATED/)
  assert.match(sql, /new\.terms_edited := old\.terms_edited/, 'the edited flag is never set by hand')
  assert.match(sql, /insert into public\.invoice_offerings[\s\S]*from public\.quote_offerings/)
  assert.match(sql, /revoke all on function public\.create_invoice_from_quote/)
})

test('the offering and terms functions already in production are recorded in the repo', () => {
  const sql = read('supabase/migrations/20261012221817_offerings_on_documents.sql')
  for (const name of ['set_document_offerings', 'set_document_terms', 'documents_terms_guard', 'document_draft_org']) assert.match(sql, new RegExp(name))
  assert.match(read('features/terms/actions/document-terms.ts'), /rpc\('set_document_offerings'/)
})

test('both document pages mount the terms panel and the sheet prints inclusions', () => {
  assert.match(read('app/(unison)/commercial/quotes/[quoteId]/page.tsx'), /DocumentTermsPanel kind="quote"/)
  assert.match(read('app/(unison)/finance/invoices/[invoiceId]/page.tsx'), /DocumentTermsPanel kind="invoice"/)
  assert.match(read('features/documents/components/document-sheet.tsx'), /Service inclusions/)
  assert.match(read('features/documents/pdf/render-document-pdf.ts'), /Service inclusions/)
})
