import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'

import { buildDocumentView } from '../../features/documents/document-view.ts'
import * as copy from '../../features/quote-portal/copy.ts'
import {
  buildPortalQuoteModel,
  buildStateCardModel,
  safeMailtoHref,
  safeTelHref,
  safeWebsiteHref,
} from '../../features/quote-portal/portal-view-model.ts'
import { buildCommercialSummary } from '../../features/quote-portal/summary.ts'
import { toDocumentBundle } from '../../features/quote-portal/to-bundle.ts'
import { isPortalToken } from '../../lib/quote-portal/token.ts'
import type { PortalLine, PortalQuote, PortalQuoteFull, PortalQuoteInvalid, PortalQuoteShort, PortalRecord } from '../../lib/quote-portal/types.ts'

// The quote portal's page, its PDF download and the components between them: the parts that are plain data (the bundle,
// the view model, the link checks) are run; the parts that need Next (the page, the route, the components) are guarded
// by what their source says, because node --test cannot load JSX, server-only or the @/ alias.

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const workspace = process.cwd()
const read = (...parts: string[]) => readFileSync(join(workspace, ...parts), 'utf8').replace(/\r\n/g, '\n')
function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : []
  })
}
const repoPath = (file: string) => relative(workspace, file).split(sep).join('/')

// 43 base64url characters: the shape of a real link token. Not a real token.
const TOKEN = 'A'.repeat(20) + '-_' + 'b'.repeat(21)

// ---------------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------------

const ISSUER = {
  legal_name: 'HIMARK Strategic Growth Consulting',
  tagline: 'People | Strategy | Progress',
  address_line1: '1 Example Street',
  city: 'Johannesburg',
  country: 'South Africa',
  email: 'info@himark.co.za',
  phone: '+27 11 555 0100',
  website: 'www.himark.co.za',
  vat_number: '4123456789',
  logo_path: '/brand/himark-wordmark.png',
  header_image_path: '/brand/banner.png',
}

let counter = 0
const line = (overrides: Partial<PortalLine> & Pick<PortalLine, 'line_amount'>): PortalLine => {
  counter += 1
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    position: counter,
    title: `Line ${counter}`,
    description: null,
    quantity: 1,
    unit_price: overrides.line_amount,
    vat_code: 'standard',
    charge_kind: null,
    ...overrides,
  }
}

const record = (overrides: Partial<PortalRecord> = {}): PortalRecord => ({
  quote_number: 'HMK-Q-2026-00001',
  status: 'Sent',
  issue_date: '2026-10-18',
  valid_until: '2026-10-25',
  currency: 'ZAR',
  client_name: 'TEST Company',
  contact_name: null,
  client_ref: null,
  project_name: 'Signature Partner',
  project_description: 'HIMARK will provide strategic growth consulting services.',
  project_ref: null,
  vat_rate: '15.00',
  subtotal: '200000.00',
  tax_amount: '30000.00',
  total_amount: '230000.00',
  terms: '1. Payment is due within 30 days.\n2. Prices exclude travel.',
  service_inclusions: 'Strategic advisory and planning\nImplementation support',
  terms_sources: [{ layer: 'company', version: 3 }, { layer: 'offering', version: 2 }],
  bill_to: { name: 'TEST Company' },
  issuer: ISSUER,
  sent_at: '2026-10-18T09:00:00+00:00',
  accepted_at: null,
  ...overrides,
})

const BRIEF_LINES: PortalLine[] = [
  line({ title: 'Monthly Retainer', description: 'Includes 40 credits a month', line_amount: '100000.00', unit_price: '100000.00', charge_kind: 'monthly' }),
  line({ title: 'Implementation Fee', line_amount: '100000.00', unit_price: '100000.00', charge_kind: 'once_off' }),
]

const full = (overrides: Partial<PortalQuoteFull> = {}, recordOverrides: Partial<PortalRecord> = {}, lines: PortalLine[] = BRIEF_LINES): PortalQuoteFull => ({
  state: 'open',
  expires_at: '2026-10-25T22:00:00+00:00',
  recipient_email: 'client@example.test',
  recipient_name: 'A. Client',
  record: record(recordOverrides),
  lines,
  version: 1,
  replaces_number: null,
  owner: { name: 'Neo Matime', email: 'neo@himark.co.za', job_title: 'Founder' },
  ...overrides,
})

const short = (state: 'expired' | 'superseded', overrides: Partial<PortalQuoteShort> = {}): PortalQuoteShort => ({
  state,
  record: { quote_number: 'HMK-Q-2026-00001', client_name: 'TEST Company', valid_until: '2026-10-25' },
  version: 1,
  replaces_number: null,
  owner: { name: 'Neo Matime', email: 'neo@himark.co.za', job_title: 'Founder' },
  ...overrides,
})

// ---------------------------------------------------------------------------------------------------------------
// toDocumentBundle
// ---------------------------------------------------------------------------------------------------------------

test('toDocumentBundle builds a bundle whose document view is the frozen quote', () => {
  const quote = full()
  const bundle = toDocumentBundle(quote)
  assert.deepEqual(Object.keys(bundle).sort(), ['client', 'lines', 'record', 'settings'])
  assert.equal(bundle.client, null)
  assert.equal(bundle.settings, null)
  assert.equal(bundle.record, quote.record, 'the record is the frozen one, not a copy that could drift')
  assert.equal(bundle.lines, quote.lines)

  const view = buildDocumentView({ kind: 'quote', ...bundle })
  assert.equal(view.draft, false, 'a sent quote is not a draft')
  assert.equal(view.number, 'HMK-Q-2026-00001')
  assert.equal(view.from.name, 'HIMARK Strategic Growth Consulting', 'the issuer comes from the frozen copy, not from live settings')
  assert.equal(view.billTo[0], 'TEST Company')
  assert.deepEqual(view.lines.map((row) => row.title), ['Monthly Retainer', 'Implementation Fee'])
  assert.deepEqual(view.totals, { subtotal: '200,000.00', vatLabel: 'VAT (15%)', vat: '30,000.00', total: '230,000.00' })
})

test('toDocumentBundle works for accepted and declined quotes and refuses everything that has no quote to show', () => {
  for (const state of ['accepted', 'declined'] as const) {
    const bundle = toDocumentBundle(full({ state }, { status: state === 'accepted' ? 'Accepted' : 'Declined' }))
    assert.equal(buildDocumentView({ kind: 'quote', ...bundle }).draft, false, state)
  }
  for (const quote of [short('expired'), short('superseded'), { state: 'invalid' } as PortalQuote]) {
    assert.throws(() => toDocumentBundle(quote), /viewable/, quote.state)
  }
})

// ---------------------------------------------------------------------------------------------------------------
// The view model: what the page prints
// ---------------------------------------------------------------------------------------------------------------

test('the information strip has the quote facts in the order of the reference, with the client-facing status word', () => {
  const model = buildPortalQuoteModel(full({ version: 2, replaces_number: 'HMK-Q-2026-00000' }))
  assert.deepEqual(model.facts.map((fact) => fact.label), [
    'Quote number', 'Version', 'Client', 'Project / Service', 'Issue date', 'Valid until', 'Status', 'Amount', 'VAT',
  ])
  const value = (label: string) => model.facts.find((fact) => fact.label === label)?.value
  assert.equal(value('Quote number'), 'HMK-Q-2026-00001')
  assert.equal(value('Version'), 'Version 2, replacing HMK-Q-2026-00000')
  assert.equal(value('Client'), 'TEST Company')
  assert.equal(value('Project / Service'), 'Signature Partner')
  assert.equal(value('Issue date'), '18 October 2026')
  assert.equal(value('Valid until'), '25 October 2026')
  assert.equal(value('Status'), 'Awaiting response', 'Sent is shown as Awaiting response')
  assert.equal(value('Amount'), 'ZAR 230,000.00')
  assert.equal(value('VAT'), 'Includes VAT (15%)')
  assert.equal(model.facts.find((fact) => fact.label === 'Status')?.tone, 'awaiting')
})

test('a fact the quote does not have is left out rather than invented', () => {
  const model = buildPortalQuoteModel(full({}, { project_name: null, valid_until: null, issue_date: null }))
  const labels = model.facts.map((fact) => fact.label)
  for (const missing of ['Project / Service', 'Valid until', 'Issue date']) assert.ok(!labels.includes(missing), missing)
  assert.ok(labels.includes('Quote number') && labels.includes('Status') && labels.includes('Amount'))
})

test('a quote with no tax shows that no VAT is charged', () => {
  const model = buildPortalQuoteModel(full({}, { tax_amount: '0.00', total_amount: '200000.00' }))
  assert.equal(model.facts.find((fact) => fact.label === 'VAT')?.value, 'No VAT charged')
})

test('the VAT and total rows are the stored figures, never the sums of the summary groups (Ruling 19)', () => {
  // One R0.10 standard once-off line and one R0.10 standard monthly line at 15%. The database rounds the VAT of the
  // whole quote once: 0.20 x 15% = 0.03, total 0.23. Added group by group (0.015 -> 0.02 on each) the VAT would be
  // 0.04 and the total 0.24, a cent more than the client is charged.
  const lines = [
    line({ title: 'Once-off setup', line_amount: '0.10', unit_price: '0.10', charge_kind: 'once_off' }),
    line({ title: 'Monthly care', line_amount: '0.10', unit_price: '0.10', charge_kind: 'monthly' }),
  ]
  const quote = full({}, { subtotal: '0.20', tax_amount: '0.03', total_amount: '0.23' }, lines)

  // The trap is real: the summary's per-month VAT is 0.02, so adding the groups would not give the stored 0.03.
  const summary = buildCommercialSummary(lines, 15)
  assert.ok(summary.grouped)
  assert.equal(summary.monthlyVat, 0.02)
  assert.notEqual(summary.onceOffSubtotal + summary.monthlyIncludingVat, 0.23, 'the sum of the groups is not the total')

  const model = buildPortalQuoteModel(quote)
  assert.deepEqual(model.commercial.totals, { subtotal: '0.20', vatLabel: 'VAT (15%)', vat: '0.03', total: '0.23' })
  assert.equal(model.facts.find((fact) => fact.label === 'Amount')?.value, 'ZAR 0.23', 'the amount in the strip is the stored total too')
  const printed = JSON.stringify(model)
  assert.ok(!printed.includes('0.24'), 'the derived total is nowhere in what the page prints')
  assert.ok(!printed.includes('"0.04"'), 'the derived VAT is nowhere in what the page prints')

  // The grouped figures that ARE printed are the groups' own: the once-off subtotal and the monthly subtotal and VAT.
  assert.ok(model.commercial.grouped)
  assert.equal(model.commercial.onceOff?.subtotal, '0.10')
  assert.equal(model.commercial.monthly?.subtotal, '0.10')
  assert.equal(model.commercial.monthly?.vat, '0.02')
  assert.equal(model.commercial.monthly?.includingVat, '0.12')
})

test('the commercial summary is grouped when every line has a kind and one is monthly, and flat otherwise', () => {
  const grouped = buildPortalQuoteModel(full())
  assert.equal(grouped.commercial.grouped, true)
  assert.deepEqual(grouped.commercial.onceOff?.rows.map((row) => row.title), ['Implementation Fee'])
  assert.deepEqual(grouped.commercial.monthly?.rows.map((row) => row.title), ['Monthly Retainer'])
  assert.equal(grouped.commercial.monthly?.subtotal, '100,000.00')
  assert.equal(grouped.commercial.monthly?.vat, '15,000.00')
  assert.equal(grouped.commercial.monthly?.includingVat, '115,000.00')
  assert.equal(grouped.commercial.recurringNote, copy.RECURRING_NOTE, 'the recurring note comes with a grouped summary')
  assert.equal(grouped.commercial.totalLabel, 'Total initial amount')
  assert.deepEqual(grouped.commercial.totals, { subtotal: '200,000.00', vatLabel: 'VAT (15%)', vat: '30,000.00', total: '230,000.00' })

  // A line with no kind (a quote from before kinds existed): one flat list, no recurring note.
  const flatLines = [line({ title: 'Advisory', line_amount: '100.00' }), line({ title: 'Workshop', line_amount: '50.00', charge_kind: 'monthly' })]
  const flat = buildPortalQuoteModel(full({}, { subtotal: '150.00', tax_amount: '22.50', total_amount: '172.50' }, flatLines))
  assert.equal(flat.commercial.grouped, false)
  assert.equal(flat.commercial.onceOff, null)
  assert.equal(flat.commercial.monthly, null)
  assert.deepEqual(flat.commercial.rows.map((row) => row.title), ['Advisory', 'Workshop'])
  assert.equal(flat.commercial.recurringNote, null, 'no recurring note on a flat list')
  assert.equal(flat.commercial.totalLabel, 'Total quoted amount')
  assert.equal(flat.commercial.totals.total, '172.50')

  // Only once-off lines: nothing recurs, so no grouping and no note.
  const onceOffOnly = buildPortalQuoteModel(full({}, {}, [line({ title: 'Audit', line_amount: '10.00', charge_kind: 'once_off' })]))
  assert.equal(onceOffOnly.commercial.grouped, false)
  assert.equal(onceOffOnly.commercial.recurringNote, null)

  // Only monthly lines: grouped, with no once-off block.
  const monthlyOnly = buildPortalQuoteModel(full({}, {}, [line({ title: 'Retainer', line_amount: '10.00', charge_kind: 'monthly' })]))
  assert.equal(monthlyOnly.commercial.grouped, true)
  assert.equal(monthlyOnly.commercial.onceOff, null)
  assert.deepEqual(monthlyOnly.commercial.monthly?.rows.map((row) => row.title), ['Retainer'])
})

test('line rows are formatted from the stored line amounts and mark zero-rated lines', () => {
  const lines = [
    line({ title: 'Training', quantity: '2', unit_price: '1500.5', line_amount: '3001.00', vat_code: 'zero', charge_kind: 'once_off' }),
    line({ title: 'Support', quantity: 1, unit_price: 99, line_amount: 99, charge_kind: 'monthly' }),
  ]
  const model = buildPortalQuoteModel(full({}, { subtotal: '3100.00', tax_amount: '14.85', total_amount: '3114.85' }, lines))
  const training = model.commercial.onceOff?.rows[0]
  assert.deepEqual(training, { title: 'Training', quantity: '2', unitPrice: '1,500.50', amount: '3,001.00', zeroRated: true })
  assert.equal(model.commercial.monthly?.rows[0].zeroRated, false)
  assert.equal(model.commercial.monthly?.vat, '14.85')
  assert.equal(model.commercial.monthly?.includingVat, '113.85')
})

test('the scope has the project description, the inclusions and the line descriptions as stored, and only what exists', () => {
  const model = buildPortalQuoteModel(full({}, { project_description: 'First paragraph.\n\nSecond paragraph.' }))
  assert.deepEqual(model.scope?.description, ['First paragraph.', 'Second paragraph.'])
  assert.deepEqual(model.scope?.inclusions, ['Strategic advisory and planning', 'Implementation support'])
  assert.deepEqual(model.scope?.services, [{ title: 'Monthly Retainer', description: 'Includes 40 credits a month' }], 'only a line with a description is listed')

  const bare = buildPortalQuoteModel(full({}, { project_description: null, service_inclusions: null }, [line({ title: 'Advisory', line_amount: '1.00' })]))
  assert.equal(bare.scope, null, 'a quote with no scope text shows no scope section')
})

test('the terms are the frozen ones, split like the document, with their template versions', () => {
  const model = buildPortalQuoteModel(full())
  assert.deepEqual(model.terms?.items, ['Payment is due within 30 days.', 'Prices exclude travel.'])
  assert.deepEqual(model.terms?.sources, ['company v3', 'offering v2'])

  const none = buildPortalQuoteModel(full({}, { terms: null, terms_sources: null }))
  assert.equal(none.terms, null, 'no terms, no terms block and no "subject to the terms below" strip')

  const unsourced = buildPortalQuoteModel(full({}, { terms_sources: null }))
  assert.deepEqual(unsourced.terms?.sources, [])
  const empty = buildPortalQuoteModel(full({}, { terms_sources: [] }))
  assert.deepEqual(empty.terms?.sources, [])
})

test('the contact is the owner with the issuer details, or the issuer alone when the quote has no owner', () => {
  const owned = buildPortalQuoteModel(full()).contact
  assert.equal(owned.name, 'Neo Matime')
  assert.equal(owned.jobTitle, 'Founder')
  assert.equal(owned.company, 'HIMARK Strategic Growth Consulting')
  assert.deepEqual(owned.website, { text: 'www.himark.co.za', href: 'https://www.himark.co.za/' })
  assert.deepEqual(owned.email, { text: 'info@himark.co.za', href: 'mailto:info@himark.co.za' })
  assert.deepEqual(owned.phone, { text: '+27 11 555 0100', href: 'tel:+27115550100' })

  const unowned = buildPortalQuoteModel(full({ owner: null })).contact
  assert.equal(unowned.name, 'HIMARK Strategic Growth Consulting', 'the issuer name stands in for a missing owner')
  assert.equal(unowned.jobTitle, null)
  assert.equal(unowned.company, null, 'and is not printed twice')
  assert.equal(unowned.email?.text, 'info@himark.co.za')

  const blankOwner = buildPortalQuoteModel(full({ owner: { name: '   ', email: 'x@y.test', job_title: 'Ghost' } })).contact
  assert.equal(blankOwner.name, 'HIMARK Strategic Growth Consulting')
  assert.equal(blankOwner.jobTitle, null, 'a job title without a name is not shown')

  const noIssuer = buildPortalQuoteModel(full({ owner: null }, { issuer: null })).contact
  assert.deepEqual(noIssuer, { name: null, jobTitle: null, company: null, website: null, email: null, phone: null })
})

test('a website, email or phone becomes a link only when it is safe to', () => {
  assert.equal(safeWebsiteHref('https://www.himark.co.za'), 'https://www.himark.co.za/')
  assert.equal(safeWebsiteHref('http://himark.co.za/about?x=1'), 'http://himark.co.za/about?x=1')
  assert.equal(safeWebsiteHref('himark.co.za'), 'https://himark.co.za/')
  assert.equal(safeWebsiteHref('  www.himark.co.za  '), 'https://www.himark.co.za/')
  for (const hostile of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'ftp://example.com', '//evil.example', 'https://user:pass@example.com', 'not a website', 'a b.co.za', '<script>.co.za', '', '   ', 'localhost']) {
    assert.equal(safeWebsiteHref(hostile), null, JSON.stringify(hostile))
  }
  assert.equal(safeWebsiteHref(null), null)
  assert.equal(safeWebsiteHref(42), null)

  assert.equal(safeMailtoHref('info@himark.co.za'), 'mailto:info@himark.co.za')
  for (const hostile of ['a@b.co?cc=evil@x.co', 'a@b.co\nbcc:x@y.co', 'a b@c.co', 'a@b', '<a@b.co>', 'x@y.co,z@w.co', 'x@y.co;z@w.co', '', 'no-at-sign', null]) {
    assert.equal(safeMailtoHref(hostile), null, JSON.stringify(hostile))
  }

  assert.equal(safeTelHref('+27 11 555 0100'), 'tel:+27115550100')
  assert.equal(safeTelHref('(011) 555-0100'), 'tel:0115550100')
  for (const hostile of ['call me', '+27 11 555 0100; rm', '12', '1'.repeat(40), '', null]) {
    assert.equal(safeTelHref(hostile), null, JSON.stringify(hostile))
  }

  // A hostile website in the frozen issuer is still shown, as text, and is not a link.
  const model = buildPortalQuoteModel(full({}, { issuer: { ...ISSUER, website: 'javascript:alert(1)' } }))
  assert.deepEqual(model.contact.website, { text: 'javascript:alert(1)', href: null })
})

test('an accepted or declined quote gets a short banner with its date', () => {
  assert.equal(buildPortalQuoteModel(full()).banner, null, 'an open quote has no banner')

  // 22:30 UTC on the 18th is half past midnight on the 19th in South Africa: the date shown is the client's own.
  const accepted = buildPortalQuoteModel(full({ state: 'accepted' }, { status: 'Accepted', accepted_at: '2026-10-18T22:30:00+00:00' }))
  assert.deepEqual(accepted.banner, { tone: 'accepted', text: copy.acceptedBanner('19 October 2026') })
  assert.equal(accepted.facts.find((fact) => fact.label === 'Status')?.value, 'Accepted')
  assert.equal(accepted.facts.find((fact) => fact.label === 'Status')?.tone, 'accepted')

  const undated = buildPortalQuoteModel(full({ state: 'accepted' }, { status: 'Accepted', accepted_at: null }))
  assert.deepEqual(undated.banner, { tone: 'accepted', text: copy.acceptedBanner(null) })
  const unreadable = buildPortalQuoteModel(full({ state: 'accepted' }, { status: 'Accepted', accepted_at: 'not a time' }))
  assert.deepEqual(unreadable.banner, { tone: 'accepted', text: copy.acceptedBanner(null) })

  // The record keeps no decline date, so a declined quote's banner states the fact and no date (Ruling 22b).
  const declined = buildPortalQuoteModel(full({ state: 'declined' }, { status: 'Declined' }))
  assert.deepEqual(declined.banner, { tone: 'declined', text: copy.DECLINED_BANNER })
  assert.equal(copy.DECLINED_BANNER, 'This quotation has been declined.')
  assert.ok(!/sent on|\d{4}/.test(declined.banner?.text ?? ''), 'no date and no "sent on" clause')
  assert.equal(declined.facts.find((fact) => fact.label === 'Status')?.tone, 'declined')
  assert.deepEqual(buildPortalQuoteModel(full({ state: 'declined' }, { status: 'Declined', sent_at: null })).banner, { tone: 'declined', text: copy.DECLINED_BANNER })
})

test('only an open quote invites a response: accepted, declined and the cards carry no respond heading or note (Ruling 21)', () => {
  assert.equal(buildPortalQuoteModel(full()).respondable, true, 'an open quote can still be responded to')
  assert.equal(buildPortalQuoteModel(full({ state: 'accepted' }, { status: 'Accepted' })).respondable, false)
  assert.equal(buildPortalQuoteModel(full({ state: 'declined' }, { status: 'Declined' })).respondable, false)
  for (const state of ['open', 'accepted', 'declined'] as const) {
    const model = buildPortalQuoteModel(full({ state }, { status: state === 'open' ? 'Sent' : state === 'accepted' ? 'Accepted' : 'Declined' }))
    assert.equal(model.respondable, state === 'open', state)
    // The words that invite a response are the view's to print, and only when the model says so; they are not in the model.
    const printed = JSON.stringify(model)
    assert.ok(!printed.includes(copy.SLICE_ONE_RESPOND_NOTE) && !printed.includes(copy.READY_TO_RESPOND), `${state} model carries no respond text`)
  }
  // The cards for links that cannot be read never invite a response either.
  for (const card of [buildStateCardModel(short('expired')), buildStateCardModel(short('superseded')), buildStateCardModel({ state: 'invalid' }), buildStateCardModel({ state: 'error' })]) {
    const printed = JSON.stringify(card)
    assert.ok(!printed.includes(copy.SLICE_ONE_RESPOND_NOTE) && !printed.includes(copy.READY_TO_RESPOND), `${card.kind} card carries no respond text`)
    assert.ok(!/reply to the email|accept or decline/i.test(printed), `${card.kind} card does not invite a decision`)
  }
})

test('hostile text reaches the page as plain data and is never altered into markup', () => {
  const hostile = '<img src=x onerror=alert(1)>\n"><script>alert(2)</script>'
  const long = 'x'.repeat(5000)
  const model = buildPortalQuoteModel(full({ owner: { name: hostile, email: 'a@b.co', job_title: hostile } }, {
    client_name: hostile, project_name: long, project_description: hostile, service_inclusions: hostile, terms: hostile,
  }, [line({ title: hostile, description: hostile, line_amount: '1.00' })]))
  const value = (label: string) => model.facts.find((fact) => fact.label === label)?.value
  assert.equal(value('Client'), hostile)
  assert.equal(value('Project / Service'), long, 'nothing is cut or rewritten on the way')
  assert.equal(model.contact.name, hostile)
  assert.equal(model.contact.jobTitle, hostile)
  // Every value is a string or a plain structure of strings: there is no field that could carry markup into the page.
  JSON.parse(JSON.stringify(model))
})

// ---------------------------------------------------------------------------------------------------------------
// State cards
// ---------------------------------------------------------------------------------------------------------------

test('an expired or superseded link gets a calm card with the number, the client, the date and the owner to contact', () => {
  const expired = buildStateCardModel(short('expired'))
  assert.equal(expired.kind, 'expired')
  assert.equal(expired.heading, copy.EXPIRED_HEADING)
  assert.equal(expired.sentence, copy.EXPIRED_SENTENCE)
  assert.deepEqual(expired.facts, [
    { label: 'Quotation', value: 'HMK-Q-2026-00001' },
    { label: 'Prepared for', value: 'TEST Company' },
    { label: 'Valid until', value: '25 October 2026' },
  ])
  assert.deepEqual(expired.contact, { name: 'Neo Matime', jobTitle: 'Founder', email: { text: 'neo@himark.co.za', href: 'mailto:neo@himark.co.za' } })

  const superseded = buildStateCardModel(short('superseded'))
  assert.equal(superseded.heading, copy.SUPERSEDED_HEADING)
  assert.equal(superseded.sentence, copy.SUPERSEDED_SENTENCE)
  assert.notEqual(superseded.heading, expired.heading)

  // No owner, no valid-until date, a draft reference: those parts are simply absent.
  const bare = buildStateCardModel(short('expired', { owner: null, record: { quote_number: 'DRAFT-1a2b3c4d', client_name: 'TEST Company', valid_until: null } }))
  assert.equal(bare.contact, null)
  assert.deepEqual(bare.facts, [{ label: 'Prepared for', value: 'TEST Company' }], 'an internal draft reference is never shown')
})

test('the link-not-valid card says nothing about any quote, whatever it is handed', () => {
  const invalid = buildStateCardModel({ state: 'invalid' })
  assert.equal(invalid.kind, 'invalid')
  assert.equal(invalid.heading, copy.INVALID_HEADING)
  assert.equal(invalid.sentence, copy.INVALID_SENTENCE)
  assert.deepEqual(invalid.facts, [])
  assert.equal(invalid.contact, null)

  // Even an invalid answer that somehow carried more keeps them off the card.
  const leaky = buildStateCardModel({ state: 'invalid', record: { quote_number: 'HMK-Q-2026-00001', client_name: 'Secret Client' }, owner: { name: 'Secret Owner', email: 's@x.co' } } as unknown as PortalQuoteInvalid)
  assert.ok(!JSON.stringify(leaky).includes('Secret'), 'nothing of the quote is on an invalid card')
  assert.ok(!JSON.stringify(leaky).includes('HMK-Q'), 'nor its number')
})

test('a temporary error card gives no detail', () => {
  const error = buildStateCardModel({ state: 'error' })
  assert.equal(error.kind, 'error')
  assert.equal(error.heading, copy.ERROR_HEADING)
  assert.equal(error.sentence, copy.ERROR_SENTENCE)
  assert.deepEqual(error.facts, [])
  assert.equal(error.contact, null)
})

test('the drafted state copy is plain ASCII with no placeholders', () => {
  for (const name of ['EXPIRED_HEADING', 'EXPIRED_SENTENCE', 'SUPERSEDED_HEADING', 'SUPERSEDED_SENTENCE', 'INVALID_HEADING', 'INVALID_SENTENCE', 'ERROR_HEADING', 'ERROR_SENTENCE']) {
    const value = (copy as Record<string, unknown>)[name]
    assert.equal(typeof value, 'string', name)
    assert.match(value as string, /^[\x20-\x7e]+$/, `${name} is printable ASCII`)
    assert.ok(!/[{}$]/.test(value as string), `${name} has no placeholder`)
  }
  // Each card has one heading and a short calm explanation of at most two sentences, ending in a full stop.
  for (const name of ['EXPIRED_SENTENCE', 'SUPERSEDED_SENTENCE', 'INVALID_SENTENCE', 'ERROR_SENTENCE']) {
    const value = (copy as unknown as Record<string, string>)[name]
    assert.ok(value.split(/[.!?]\s/).length <= 2, `${name} is at most two sentences`)
    assert.ok(value.endsWith('.'), `${name} ends with a full stop`)
  }
})

test('the card sentences and the retry label are the approved wording (Ruling 22)', () => {
  assert.equal(copy.EXPIRED_SENTENCE, 'This quotation is no longer open for response. Please get in touch if you would like an updated one.')
  assert.equal(copy.SUPERSEDED_SENTENCE, 'A newer version of this quotation has been issued. Please use the link in the most recent email you received from HIMARK, or get in touch.')
  assert.equal(copy.RETRY_LABEL, 'Try again')
  // A replaced quotation points the client to the latest email, and says nothing of how to accept or decline.
  assert.match(copy.SUPERSEDED_SENTENCE, /most recent email/)
  assert.match(buildStateCardModel(short('superseded')).sentence, /most recent email/)
  assert.match(buildStateCardModel(short('expired')).sentence, /no longer open for response/)
})

// ---------------------------------------------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------------------------------------------

const PAGE = 'app/(portal)/q/[token]/page.tsx'
const pageSource = () => read(...PAGE.split('/'))

test('the portal page is dynamic, checks the token shape first and only then reads the quote', () => {
  const page = pageSource()
  assert.match(page, /export const dynamic = 'force-dynamic'/, 'it reads live data on every request')
  assert.match(page, /params: Promise<\{ token: string \}>/, 'params is a promise in this Next')
  assert.match(page, /const \{ token \} = await params/)
  const guard = page.indexOf('isPortalToken(token)')
  const fetched = page.indexOf('await getPortalQuote(token)')
  assert.ok(guard > -1, 'the page calls isPortalToken')
  assert.ok(fetched > guard, 'isPortalToken comes before getPortalQuote')
  assert.match(page, /from '@\/lib\/quote-portal\/token'/)
  assert.match(page, /from '@\/lib\/quote-portal\/portal-client'/)
  // A read that throws is the temporary-error card, with no detail and no token in the log.
  assert.match(page, /catch/)
  assert.match(page, /<PortalStateCard quote=\{\{ state: 'error' \}\} \/>/)
  assert.match(page, /<PortalStateCard quote=\{\{ state: 'invalid' \}\} \/>/, 'a malformed token is the not-valid card')
  assert.doesNotMatch(page, /console\.error\([^)]*token/i, 'the token is never logged')
})

test('the portal page never calls the view action itself: only the beacon does, and only for a quote the client can read', () => {
  const page = pageSource()
  assert.doesNotMatch(page, /recordViewAction/, 'the page does not import or call the action')
  assert.doesNotMatch(page, /recordPortalView/, 'nor the database function')
  assert.match(page, /import \{ ViewedBeacon \} from '@\/features\/quote-portal\/components\/viewed-beacon'/)
  assert.equal((page.match(/<ViewedBeacon\b/g) ?? []).length, 1, 'the beacon is rendered in one place')
  // It sits after the check that the quote is readable, in the same branch as the quote view.
  const viewable = page.indexOf('isViewableQuote(quote)')
  const beacon = page.indexOf('<ViewedBeacon')
  const view = page.indexOf('<PortalQuoteView')
  assert.ok(viewable > -1 && view > viewable && beacon > viewable, 'the quote view and the beacon come after the viewable check')
  assert.ok(page.indexOf('<PortalStateCard') > -1)
  // No state card renders the beacon: everything between the viewable branch and its end is the quote view and the beacon.
  const stateCardsBeforeBeacon = [...page.matchAll(/<PortalStateCard/g)].map((match) => match.index as number)
  const branchEnd = page.indexOf('/>', beacon)
  assert.ok(branchEnd > beacon)
  for (const at of stateCardsBeforeBeacon) {
    assert.ok(at < viewable || at > branchEnd, 'a state card is outside the branch that carries the beacon')
  }
})

test('ViewedBeacon is a client component whose only effect calls the action once and renders nothing', () => {
  const source = read('features', 'quote-portal', 'components', 'viewed-beacon.tsx')
  assert.match(source, /^\s*(\/\/[^\n]*\n\s*)*'use client'/, 'the directive comes first')
  assert.match(source, /import \{ recordViewAction \} from '@\/features\/quote-portal\/actions\/record-view'/)
  assert.equal((source.match(/useEffect\(/g) ?? []).length, 1, 'one effect')
  const effect = source.slice(source.indexOf('useEffect('))
  assert.match(effect, /recordViewAction\(token\)/, 'the effect calls the action with the token')
  assert.equal((source.match(/recordViewAction\(/g) ?? []).length, 1, 'the action is called in one place')
  assert.match(source, /useRef\(false\)/, 'a ref makes it once, even when the effect runs twice in development')
  assert.match(source, /\.catch\(/, 'a failed call is swallowed: it must never break the page')
  assert.match(source, /return null/, 'it renders nothing')
  assert.doesNotMatch(source, /onClick|onLoad|fetch\(|XMLHttpRequest|sendBeacon/, 'nothing but the effect')
})

test('no file of the portal sets inner HTML', () => {
  const files = [...walk(join(workspace, 'features', 'quote-portal')), ...walk(join(workspace, 'app', '(portal)')), join(workspace, 'lib', 'quote-portal', 'portal-client.ts')]
  assert.ok(files.length >= 8, 'the portal has files to check')
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/, repoPath(file))
    assert.doesNotMatch(source, /\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write/, repoPath(file))
  }
})

test('the portal layout is bare: a title and a main, no navigation and no staff shell', () => {
  const layout = read('app', '(portal)', 'layout.tsx')
  assert.match(layout, /title: 'Your quotation \| HIMARK'/)
  assert.match(layout, /<main\b/)
  assert.doesNotMatch(layout, /<nav\b|<aside\b|<header\b|AppShell|Sidebar|config\/navigation|getSessionContext|next\/link/)
  assert.doesNotMatch(layout, /'use client'/, 'a server layout')
  assert.match(layout, /robots: \{ index: false, follow: false \}/, 'and not for search engines')
})

test('the portal metadata is neutral, so a link preview never shows the internal UNISON description (Ruling 22c)', () => {
  const layout = read('app', '(portal)', 'layout.tsx')
  assert.match(layout, /description: 'Your quotation from HIMARK\.'/, 'a neutral description replaces the one inherited from the root layout')
  assert.match(layout, /generator: null/, 'and the generator is cleared')
  // The root layout is what the portal would otherwise inherit from: pin that it still carries the internal wording.
  const root = read('app', 'layout.tsx')
  assert.match(root, /description:/)
  assert.match(root, /generator: 'v0\.app'/)
  assert.doesNotMatch(layout, /UNISON|v0\.app/)
})

test('the portal has its own error page: the designed temporary-error card with a retry, and no error detail (Ruling 22d)', () => {
  const file = join(workspace, 'app', '(portal)', 'error.tsx')
  assert.ok(existsSync(file), 'app/(portal)/error.tsx exists')
  const source = read('app', '(portal)', 'error.tsx')
  assert.match(source, /^\s*(\/\/[^\n]*\n\s*)*'use client'/, 'an error boundary is a client component, and the directive comes first')
  assert.match(source, /export default function \w+\(\{ retry \}: \{ retry: \(\) => void \}\)/, 'it takes the retry prop of this Next version and nothing else')
  assert.match(source, /<PortalStateCard quote=\{\{ state: 'error' \}\}>/, 'the designed error card')
  assert.match(source, /<button\b[^>]*type="button"[^>]*onClick=\{\(\) => retry\(\)\}/, 'a retry button')
  assert.match(source, /\{RETRY_LABEL\}/, 'with its words from copy.ts')
  assert.doesNotMatch(source, /error\.message|error\.digest|\.stack|console\./, 'no error message, digest or log from the browser')
  assert.doesNotMatch(source, /\berror\b[^\n]*:\s*Error|digest/, 'the error object is not even taken')
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/)
})

// ---------------------------------------------------------------------------------------------------------------
// The components
// ---------------------------------------------------------------------------------------------------------------

const viewSource = () => read('features', 'quote-portal', 'components', 'portal-quote-view.tsx')

test('the response panel has Download PDF, the note and the questions block, and no Accept or Decline', () => {
  const view = viewSource()
  assert.doesNotMatch(view, /Accept Quotation|Decline Quotation|Accept quotation|Decline quotation/i)
  assert.doesNotMatch(view, /<button\b|<form\b|type="submit"|onClick/i, 'nothing in the view can submit or respond')
  assert.doesNotMatch(view, /'use client'/, 'a server component')
  for (const name of ['SLICE_ONE_RESPOND_NOTE', 'READY_TO_RESPOND', 'QUESTIONS_HEADING', 'PORTAL_HEADING', 'PORTAL_INTRO', 'TERMS_STRIP', 'DOWNLOAD_PDF']) {
    assert.match(view, new RegExp(`\\b${name}\\b`), `${name} is used`)
  }
  // The download is a plain link to the PDF route, not a client-side navigation.
  assert.match(view, /<a\b[^>]*href=\{`\/q\/\$\{token\}\/pdf`\}/, 'a plain anchor to /q/<token>/pdf')
  assert.doesNotMatch(view, /next\/link|<Link\b/)
  assert.match(view, /\bPortalQuote\b/, 'it takes the portal quote')
})

test('the respond heading and note are printed only when the model says the quote can be responded to; Download PDF and the questions always are (Ruling 21)', () => {
  const view = viewSource()
  assert.match(view, /\{model\.respondable \? <SectionTitle [^>]*>\{READY_TO_RESPOND\}<\/SectionTitle> : null\}/, 'the "Ready to respond?" heading is conditional')
  assert.match(view, /\{model\.respondable \? <p [^>]*>\{SLICE_ONE_RESPOND_NOTE\}<\/p> : null\}/, 'and so is the note')
  assert.equal((view.match(/\{READY_TO_RESPOND\}/g) ?? []).length, 1, 'the heading is printed in one place')
  assert.equal((view.match(/\{SLICE_ONE_RESPOND_NOTE\}/g) ?? []).length, 1, 'and so is the note')
  // Between the two conditions, unconditionally, is the download link.
  assert.match(view, /<\/SectionTitle> : null\}\s*<a\b[^>]*href=\{`\/q\/\$\{token\}\/pdf`\}[\s\S]*?\{DOWNLOAD_PDF\}\s*<\/a>\s*\{model\.respondable \? <p /, 'Download PDF is outside both conditions')
  assert.match(view, /hasContact\(contact\)/, 'the questions block depends on the contact, not on the state')
  assert.doesNotMatch(view, /state === 'open'|\.state\b/, 'the view asks the model, not the raw state')
})

test('the commercial rows keep a four-column table for assistive technology: sum rows span three columns and the group label is a plain cell', () => {
  const view = viewSource()
  assert.match(view, /role="rowheader"[^>]*aria-colspan=\{3\}|aria-colspan=\{3\}[^>]*role="rowheader"/, 'a sum row label spans the quantity and unit price columns')
  assert.match(view, /role="cell"[^>]*aria-colspan=\{4\}|aria-colspan=\{4\}[^>]*role="cell"/, 'a group label spans the whole row')
  const group = view.slice(view.indexOf('function GroupLabel'), view.indexOf('function SumRow'))
  assert.doesNotMatch(group, /columnheader/, 'a group label is not a column header')
  // On a phone the quantity and unit price cells are visually hidden but stay in the table, so its column count never changes.
  assert.equal((view.match(/"sr-only [^"]*sm:not-sr-only"/g) ?? []).length, 4, 'the header cells and the line cells for quantity and unit price')
  assert.doesNotMatch(view, /hidden text-right[^"]*sm:block/, 'no display:none cell inside the table')
  assert.match(view, /aria-hidden="true"[^>]*>\s*\{row\.quantity\} x \{row\.unitPrice\}|text-xs sm:hidden[^>]*aria-hidden="true"/, 'the phone-only "1 x 100.00" line is not read a second time')
})

test('in the information strip no icon sits between the list and its terms, and the quote number never breaks mid-string on a phone (Ruling 22f, g)', () => {
  const view = viewSource()
  const strip = view.slice(view.indexOf('function FactsStrip'), view.indexOf('// The commercial summary is a grid'))
  // A <dl> may only contain dt and dd (inside a div): the icon is inside the dt.
  const cell = strip.slice(strip.indexOf('<div key={fact.label}'))
  assert.ok(cell.indexOf('<dt') < cell.indexOf('<Icon'), 'the icon comes after the dt opens')
  assert.ok(cell.indexOf('<Icon') < cell.indexOf('</dt>'), 'and before it closes')
  // The quote number takes both columns on a phone, so its hyphens are never a place to break the line.
  assert.match(strip, /col-span-2 sm:col-span-1/)
  assert.match(strip, /fact\.label === 'Quote number'/)
  assert.match(strip, /whitespace-nowrap/)
})

test('the portal view prints the stored totals and does no money arithmetic of its own', () => {
  const view = viewSource()
  for (const printed of ['totals.subtotal', 'totals.vat', 'totals.total', 'totals.vatLabel']) {
    assert.ok(view.includes(printed), `${printed} is printed`)
  }
  // The group figures are printed as they come; none is added to, subtracted from or multiplied in the component.
  assert.doesNotMatch(view, /(onceOff|monthly|includingVat|subtotal|vat|total)\w*\s*[-+*/]\s*[\w(]/i, 'no arithmetic on a money figure')
  assert.doesNotMatch(view, /Number\(|parseFloat|toFixed|Math\./, 'no number handling at all in the component')
  assert.doesNotMatch(view, /buildCommercialSummary|buildDocumentView/, 'the figures come from the view model')
  assert.match(view, /buildPortalQuoteModel\(quote\)/)
})

test('the portal view shows the recurring note only from the model, and never as a fixed line', () => {
  const view = viewSource()
  assert.ok(view.includes('recurringNote'), 'the model decides')
  assert.doesNotMatch(view, /RECURRING_NOTE/, 'the component does not print it on its own')
})

test('the portal view uses no dangerous markup and links only what the model says is safe', () => {
  const view = viewSource()
  assert.doesNotMatch(view, /href=\{[^}]*\b(issuer|record|quote)\b/, 'no link is built from raw quote data')
  assert.match(view, /\.href\b/, 'links come from the model\'s checked hrefs')
  assert.doesNotMatch(view, /target="_blank"/, 'no new windows from a page with no referrer')
})

test('the state card has no controls, no script and no data of its own', () => {
  const card = read('features', 'quote-portal', 'components', 'portal-state-card.tsx')
  assert.doesNotMatch(card, /'use client'/)
  assert.doesNotMatch(card, /<button\b|<form\b|onClick/)
  assert.match(card, /buildStateCardModel/)
  assert.doesNotMatch(card, /getPortalQuote|supabase|recordViewAction/)
  // The one thing a page may add is children, which the error page uses for its retry button.
  assert.match(card, /children\?: ReactNode/)
  assert.match(card, /\{children\}/)
})

// ---------------------------------------------------------------------------------------------------------------
// The PDF route
// ---------------------------------------------------------------------------------------------------------------

const ROUTE = 'app/(portal)/q/[token]/pdf/route.ts'
const routeSource = () => read(...ROUTE.split('/'))

// Ruling 32: the email's DOWNLOAD PDF button must never show a client raw JSON. A malformed address is still the 404
// JSON; a well-formed link whose quote cannot be read goes to its page, which shows the designed card for its state.
test('the PDF route answers 404 JSON for a malformed token, and sends a well-formed link that cannot be read to its page', () => {
  const route = routeSource()
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /export const dynamic = 'force-dynamic'/)
  assert.match(route, /params: Promise<\{ token: string \}>/)
  assert.match(route, /export async function GET\(/)
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/, 'read only')

  const shape = route.indexOf('isPortalToken(token)')
  const fetched = route.indexOf('await getPortalQuote(token)')
  const viewable = route.indexOf('isViewableQuote(quote)')
  const made = route.indexOf('makeDocumentPdf(')
  assert.ok(shape > -1 && fetched > shape, 'the token shape is checked before the quote is read')
  assert.ok(viewable > fetched, 'the state is checked after the read')
  assert.ok(made > viewable, 'the PDF is made only after the state check')

  // A malformed token: the one 404, a JSON message that says nothing about the quote.
  assert.match(route, /if \(!isPortalToken\(token\)\) return NextResponse\.json\(NOT_FOUND, \{ status: 404 \}\)/)
  assert.equal((route.match(/status: 404/g) ?? []).length, 1, 'only a malformed token is a 404')
  const notFound = route.match(/const NOT_FOUND = (\{[^}]*\})/)?.[1] ?? ''
  assert.match(notFound, /message: '[^']+'/)
  assert.doesNotMatch(notFound, /expired|superseded|invalid|revoked|declined|accepted|token/i, 'the 404 says nothing about why')

  // A well-formed token whose quote is expired, superseded or not valid: to the page, and nowhere else.
  assert.match(route, /if \(!isViewableQuote\(quote\)\) return toPortalPage\(token\)/)
  assert.equal((route.match(/toPortalPage\(token\)/g) ?? []).length, 1, 'the one place it is used')
  assert.ok(route.indexOf('toPortalPage(token)') > shape, 'only after the token shape was accepted')
  assert.match(route, /isViewableQuote/, 'it uses the shared guard, not its own list of states')
  assert.doesNotMatch(route, /state === 'open'|state !== 'open'/, 'the states are not re-listed here')
})

test('the redirect is a 303 to the relative /q/<token> with the portal headers, and cannot point anywhere else', () => {
  const route = routeSource()
  const start = route.indexOf('function toPortalPage(token: string): NextResponse {')
  assert.ok(start > -1, 'one helper builds the redirect')
  const helper = route.slice(start, route.indexOf('\n}\n', start) + 2)
  assert.match(helper, /status: 303/, 'See Other: the browser follows it with a GET')
  assert.match(helper, /Location: `\/q\/\$\{token\}`/, 'relative, built from the token alone')
  assert.match(helper, /'Cache-Control': 'no-store'/)
  assert.match(helper, /'Referrer-Policy': 'no-referrer'/)
  assert.doesNotMatch(helper, /request|new URL|nextUrl|host|searchParams|NextResponse\.redirect/i, 'nothing from the request (no host, no query) reaches the address')
  assert.doesNotMatch(helper, /status: (301|302|307|308)/)
  assert.doesNotMatch(route, /\bredirect\(/, 'no other redirect')

  // What makes it safe: the token was accepted by isPortalToken, which admits only 43 base64url characters. Nothing it
  // accepts can turn "/q/<token>" into another site, a path outside /q/ or an address with a query.
  const accepts = isPortalToken
  for (const hostile of [
    `//evil.example/${'a'.repeat(28)}`, `/\\evil.example${'a'.repeat(28)}`, `https://evil.example/${'a'.repeat(21)}`,
    `..%2F..%2Fevil${'a'.repeat(29)}`, `${'a'.repeat(42)}/`, `${'a'.repeat(42)}?`, `${'a'.repeat(42)}#`, `${'a'.repeat(42)} `, `${'a'.repeat(42)}.`,
  ]) {
    assert.equal(accepts(hostile), false, JSON.stringify(hostile))
  }
  assert.ok(accepts(TOKEN))
  assert.ok(read('lib', 'quote-portal', 'token.ts').includes('/^[A-Za-z0-9_-]{43}$/'), 'isPortalToken admits exactly this shape')
})

test('the PDF is the frozen quote through the shared renderer, with the headers of the staff download and no referrer', () => {
  const route = routeSource()
  assert.match(route, /makeDocumentPdf\('quote', toDocumentBundle\(quote\)\)/)
  assert.match(route, /from '@\/features\/documents\/pdf\/make-document-pdf'/)
  assert.match(route, /from '@\/features\/quote-portal\/to-bundle'/)
  assert.doesNotMatch(route, /documentPdfResponse|getSessionContext|getDocument/, 'no session and no live document')
  for (const header of [
    "'Content-Type': 'application/pdf'",
    '\'Content-Disposition\': `attachment; filename="${filename}"`',
    "'Cache-Control': 'private, no-store'",
    "'X-Content-Type-Options': 'nosniff'",
    "'Referrer-Policy': 'no-referrer'",
  ]) {
    assert.ok(route.includes(header), header)
  }
  assert.doesNotMatch(route, /console\.error\([^)]*\btoken\b/i, 'the token is never logged')
})

test('every failure after the token and state checks is the same generic 500 for the client, and the real token-free error goes to the log (Ruling 22e)', () => {
  const route = routeSource()
  assert.equal(copy.PDF_FAILED_MESSAGE, 'The PDF could not be prepared. Please try again, or get in touch.')
  assert.match(route, /PDF_FAILED_MESSAGE/)
  assert.match(route, /status: 500/)
  assert.doesNotMatch(route, /status: 503/, 'a failed read is the same answer as a failed render')
  // The message of a DocumentPdfError names fonts, images and company details: none of it reaches the client.
  assert.doesNotMatch(route, /DocumentPdfError|error\.message \}|message: error/, 'no error text in a response')
  // The failure helper logs the real error (its message only: no token is ever passed to it) and answers generically.
  const helper = route.slice(route.indexOf('function pdfFailed'), route.indexOf('export async function GET'))
  assert.ok(helper.length > 0, 'one helper answers every failure')
  assert.match(helper, /console\.error\('\[quote-portal:pdf\]', error instanceof Error \? error\.message : 'unknown error'\)/)
  assert.match(helper, /NextResponse\.json\(\{ message: PDF_FAILED_MESSAGE \}, \{ status: 500 \}\)/)
  // Both the read and the render go through it; the malformed-token 404 is untouched (Ruling 32 changed only the
  // answer for a well-formed link that cannot be read).
  assert.equal((route.match(/return pdfFailed\(error\)/g) ?? []).length, 2, 'the read and the render')
  assert.match(route, /const NOT_FOUND = \{ message: 'That quotation was not found\.' \}/)
  assert.equal((route.match(/NextResponse\.json\(NOT_FOUND, \{ status: 404 \}\)/g) ?? []).length, 1, 'a malformed token')
})

// ---------------------------------------------------------------------------------------------------------------
// The shape of the route group
// ---------------------------------------------------------------------------------------------------------------

test('the portal pages live in their own route group beside the staff app, and nothing links the two', () => {
  assert.ok(existsSync(join(workspace, 'app', '(portal)', 'layout.tsx')))
  assert.ok(existsSync(join(workspace, 'app', '(portal)', 'q', '[token]', 'page.tsx')))
  assert.ok(existsSync(join(workspace, 'app', '(portal)', 'q', '[token]', 'pdf', 'route.ts')))
  for (const file of [...walk(join(workspace, 'app', '(portal)')), ...walk(join(workspace, 'features', 'quote-portal', 'components'))]) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /components\/layout|components\/navigation|getSessionContext|lib\/auth\//, repoPath(file))
    assert.doesNotMatch(source, /supabase\/admin|createAdminSupabase/, `${repoPath(file)} reaches the database only through portal-client`)
  }
})
