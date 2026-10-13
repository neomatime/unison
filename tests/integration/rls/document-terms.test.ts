import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let adminUser: U
let member: U
let outsider: U
let adminClient: SupabaseClient
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient
let clientA: string
let versionA: string // approved company-style wording in orgA
let versionB: string // approved in orgB: never usable by orgA documents
let templateA: string

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}
const row = async (table: 'quotes' | 'invoices', id: string) => must(await admin.from(table).select('*').eq('id', id).single()) as Record<string, any>

const draftQuote = async () => {
  const quote = must(await memberClient.from('quotes').insert({ organization_id: orgA, client_id: clientA, client_name: 'Terms Client' }).select('id').single())
  assert.equal((await memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: quote.id, position: 1, title: 'Advisory', quantity: 1, unit_price: 100 })).error, null)
  return quote.id as string
}
const source = (versionId: string, templateId: string, layer = 'company') => ({ layer, templateId, versionId, version: 1 })
const fill = (id: string, sources: unknown[], client: SupabaseClient = memberClient, kind = 'quote', terms = 'Clause one.\nClause two.', inclusions = 'Engagement lead') =>
  client.rpc('set_document_terms', { p_kind: kind, p_document: id, p_terms: terms, p_inclusions: inclusions, p_sources: sources, p_edited: false })

async function approvedVersion(client: SupabaseClient, org: string, key: string): Promise<{ template: string; version: string }> {
  const template = must(await client.rpc('create_terms_template', { p_org: org, p_target_kind: 'support', p_target_key: key, p_applies_to: 'both', p_title: `Doc terms ${key}` })) as string
  const version = must(await client.rpc('save_terms_draft', { p_template: template, p_body: 'Clause one.\nClause two.', p_inclusions: 'Engagement lead', p_effective_from: '2026-10-12', p_change_note: null })) as string
  assert.equal((await client.rpc('approve_terms_version', { p_version: version })).error, null)
  return { template, version }
}

before(async () => {
  orgA = await createFixtureOrg('doc-terms-a')
  orgB = await createFixtureOrg('doc-terms-b')
  adminUser = await createFixtureUser(orgA, 'admin')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  adminClient = await signedInClient(adminUser.email, adminUser.password)
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  clientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Terms Client', status: 'Active' }).select('id').single()).id
  must(await admin.from('organization_settings').insert({ organization_id: orgA, legal_name: 'Terms Co', document_prefix: 'TRM', vat_rate: 15 }).select('id').single())
  const a = await approvedVersion(adminClient, orgA, 'doc_terms_a')
  versionA = a.version
  templateA = a.template
  versionB = (await approvedVersion(outsiderClient, orgB, 'doc_terms_b')).version
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [adminUser?.id, member?.id, outsider?.id].filter(Boolean))
})

test('a member fills a draft quote: wording, inclusions, offerings and verified sources are stored', async () => {
  const id = await draftQuote()
  assert.equal((await memberClient.rpc('set_document_offerings', { p_kind: 'quote', p_document: id, p_offerings: [{ kind: 'retainer', key: 'growth' }] })).error, null)
  assert.equal((await fill(id, [source(versionA, templateA)])).error, null)
  const quote = await row('quotes', id)
  assert.equal(quote.terms, 'Clause one.\nClause two.')
  assert.equal(quote.service_inclusions, 'Engagement lead')
  assert.deepEqual(quote.terms_sources, [{ layer: 'company', templateId: templateA, versionId: versionA, version: 1 }])
  assert.equal(quote.terms_edited, false)
  const offerings = must(await admin.from('quote_offerings').select('offering_kind,offering_key,position').eq('quote_id', id))
  assert.deepEqual(offerings, [{ offering_kind: 'retainer', offering_key: 'growth', position: 1 }])
})

test('another organisation cannot fill or choose offerings on this quote', async () => {
  const id = await draftQuote()
  refused((await fill(id, [source(versionB, templateA)], outsiderClient)).error, 'QUOTE_NOT_FOUND')
  refused((await outsiderClient.rpc('set_document_offerings', { p_kind: 'quote', p_document: id, p_offerings: [] })).error, 'QUOTE_NOT_FOUND')
})

test('a source from another organisation, a made-up version or a draft version is refused', async () => {
  const id = await draftQuote()
  refused((await fill(id, [source(versionB, templateA)])).error, 'TERMS_SOURCE_INVALID')
  refused((await fill(id, [source('00000000-0000-0000-0000-000000000000', templateA)])).error, 'TERMS_SOURCE_INVALID')
  refused((await fill(id, [{ layer: 'company', templateId: templateA, versionId: 'not-a-uuid', version: 1 }])).error, 'TERMS_SOURCE_INVALID')
  const template = must(await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: 'doc_terms_draft', p_applies_to: 'quote', p_title: 'Draft only' })) as string
  const draft = must(await adminClient.rpc('save_terms_draft', { p_template: template, p_body: 'Not approved.', p_inclusions: '', p_effective_from: '2026-10-12', p_change_note: null })) as string
  refused((await fill(id, [source(draft, template)])).error, 'TERMS_SOURCE_INVALID')
  assert.equal((await row('quotes', id)).terms_sources, null, 'nothing was stored by the refused fills')
})

test('offerings are validated: bad kinds, bad keys, repeats and more than ten are refused', async () => {
  const id = await draftQuote()
  const set = (offerings: unknown) => memberClient.rpc('set_document_offerings', { p_kind: 'quote', p_document: id, p_offerings: offerings })
  refused((await set([{ kind: 'bundle', key: 'growth' }])).error, 'OFFERING_INVALID')
  refused((await set([{ kind: 'retainer', key: 'Growth Tier' }])).error, 'OFFERING_INVALID')
  refused((await set([{ kind: 'retainer', key: 'growth' }, { kind: 'retainer', key: 'growth' }])).error, 'OFFERING_INVALID')
  refused((await set(Array.from({ length: 11 }, (_, i) => ({ kind: 'support', key: `s${i}` })))).error, 'OFFERING_INVALID')
})

test('signed-in roles cannot write the template columns directly, and typing over filled terms marks it edited', async () => {
  const id = await draftQuote()
  assert.equal((await fill(id, [source(versionA, templateA)])).error, null)
  refused((await memberClient.from('quotes').update({ terms_sources: [] }).eq('id', id)).error, 'TERMS_COLUMNS_GENERATED')
  refused((await memberClient.from('quotes').update({ service_inclusions: 'Sneaked in' }).eq('id', id)).error, 'TERMS_COLUMNS_GENERATED')
  refused((await memberClient.from('quotes').insert({ organization_id: orgA, client_id: clientA, client_name: 'Terms Client', terms_edited: true })).error, 'TERMS_COLUMNS_GENERATED')
  assert.equal((await memberClient.from('quotes').update({ terms_edited: true }).eq('id', id)).error, null)
  assert.equal((await row('quotes', id)).terms_edited, false, 'the flag cannot be set by hand')
  assert.equal((await memberClient.from('quotes').update({ terms: 'Rewritten by hand' }).eq('id', id)).error, null)
  assert.equal((await row('quotes', id)).terms_edited, true)
  assert.equal((await fill(id, [source(versionA, templateA)])).error, null)
  assert.equal((await row('quotes', id)).terms_edited, false, 'filling again clears it')
})

test('a sent quote refuses a fill and keeps its sources, wording and inclusions when the template moves on', async () => {
  const id = await draftQuote()
  assert.equal((await fill(id, [source(versionA, templateA)])).error, null)
  assert.equal((await memberClient.rpc('send_quote', { p_id: id })).error, null)
  const sent = await row('quotes', id)
  refused((await fill(id, [source(versionA, templateA)])).error, 'QUOTE_NOT_DRAFT')
  refused((await memberClient.rpc('set_document_offerings', { p_kind: 'quote', p_document: id, p_offerings: [] })).error, 'QUOTE_NOT_DRAFT')
  refused((await memberClient.from('quotes').update({ service_inclusions: 'Later' }).eq('id', id)).error, 'TERMS_COLUMNS_GENERATED')

  // The template gets a new approved wording and the old version is archived: the sent quote does not move.
  const next = must(await adminClient.rpc('save_terms_draft', { p_template: templateA, p_body: 'Brand new clause.', p_inclusions: 'Different', p_effective_from: '2026-10-13', p_change_note: 'new' })) as string
  assert.equal((await adminClient.rpc('approve_terms_version', { p_version: next })).error, null)
  assert.equal((await adminClient.rpc('archive_terms_version', { p_version: versionA })).error, null)
  const after = await row('quotes', id)
  assert.equal(after.terms, sent.terms)
  assert.equal(after.service_inclusions, sent.service_inclusions)
  assert.deepEqual(after.terms_sources, sent.terms_sources)
})

test('an invoice made from an accepted quote takes its offerings and keeps its own payment terms sources', async () => {
  const id = await draftQuote()
  assert.equal((await memberClient.rpc('set_document_offerings', { p_kind: 'quote', p_document: id, p_offerings: [{ kind: 'project', key: 'operating_model' }, { kind: 'support', key: 'website_care' }] })).error, null)
  assert.equal((await memberClient.rpc('send_quote', { p_id: id })).error, null)
  assert.equal((await memberClient.from('quotes').update({ status: 'Accepted' }).eq('id', id)).error, null)
  const invoiceId = must(await memberClient.rpc('create_invoice_from_quote', { p_quote_id: id })) as string
  const offerings = must(await admin.from('invoice_offerings').select('offering_kind,offering_key,position').eq('invoice_id', invoiceId).order('position'))
  assert.deepEqual(offerings, [{ offering_kind: 'project', offering_key: 'operating_model', position: 1 }, { offering_kind: 'support', offering_key: 'website_care', position: 2 }])
  const invoice = await row('invoices', invoiceId)
  assert.equal(invoice.terms_sources, null)
  assert.equal(invoice.service_inclusions, null)
  assert.equal(invoice.quote_id, id)
})

test('invoice payment terms fill the same way but never carry service inclusions', async () => {
  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Terms Client' }).select('id').single()).id as string
  assert.equal((await fill(invoice, [source(versionA, templateA)], memberClient, 'invoice', 'Pay in 30 days.', 'Ignored')).error, null)
  const filled = await row('invoices', invoice)
  assert.equal(filled.payment_terms, 'Pay in 30 days.')
  assert.equal(filled.service_inclusions, null)
  assert.equal((await memberClient.from('invoices').update({ payment_terms: 'Pay in 14 days.' }).eq('id', invoice)).error, null)
  assert.equal((await row('invoices', invoice)).terms_edited, true)
})
