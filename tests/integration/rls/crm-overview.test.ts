import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { currentYearMonth } from '../../../features/crm-overview/metrics.ts'
import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// The CRM Overview reads through four security-invoker functions. These tests
// prove, against real rows, that each figure follows the stated definition, that a
// non-member is refused rather than shown zeros, that organisations cannot see one
// another, and that a module the plan excludes comes back as null rather than 0.
// Everything here is created in fixture organisations and removed afterwards:
// unison-uat is production.

const TZ = 'Africa/Johannesburg'
const ALL = ['clients', 'leads', 'quotes', 'sales', 'invoices', 'vendors', 'onboarding']
const { year, month } = currentYearMonth(TZ)

const pad = (value: number) => String(value).padStart(2, '0')
/** An instant in the reporting timezone (UTC+2, no daylight saving). */
const local = (y: number, m: number, d: number, h = 0) => new Date(Date.UTC(y, m - 1, d, h - 2)).toISOString()
const dateOnly = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const twoMonthsAgo = new Date(Date.UTC(year, month - 3, 15, 12)).toISOString()
const lastMonthTenth = new Date(Date.UTC(year, month - 2, 10)).toISOString().slice(0, 10)

let orgA: string
let orgB: string
let member: { id: string; email: string; password: string }
let outsider: { id: string; email: string; password: string }
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function insert(table: string, rows: Record<string, unknown> | Record<string, unknown>[]) {
  // defaultToNull: false, because rows in one batch carry different columns, and
  // without it PostgREST sends an explicit null for each one a row leaves out,
  // which defeats the column default (created_at is not null).
  const { error } = await admin.from(table).insert(rows, { defaultToNull: false })
  if (error) throw new Error(`${table}: ${error.message}`)
}

const kpis = async (client: SupabaseClient, org: string, modules: string[] = ALL) =>
  client.rpc('crm_overview_kpis', { p_organization_id: org, p_modules: modules, p_timezone: TZ })
const pipeline = async (client: SupabaseClient, org: string, modules: string[] = ALL) =>
  client.rpc('crm_overview_pipeline', { p_organization_id: org, p_modules: modules, p_timezone: TZ })
const revenue = async (client: SupabaseClient, org: string, modules: string[] = ALL) =>
  client.rpc('crm_overview_revenue', { p_organization_id: org, p_modules: modules, p_timezone: TZ })
const activity = async (client: SupabaseClient, org: string, modules: string[] = ALL, limit = 25) =>
  client.rpc('crm_overview_activity', { p_organization_id: org, p_modules: modules, p_limit: limit })

before(async () => {
  orgA = await createFixtureOrg('crm-overview')
  orgB = await createFixtureOrg('crm-overview-other')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)

  // Clients: one counted in both, one that was active last month and is archived now,
  // one that only exists this month.
  await insert('clients', [
    { organization_id: orgA, name: 'Old Active', status: 'Active', created_at: twoMonthsAgo },
    { organization_id: orgA, name: 'Archived Today', status: 'Archived', created_at: twoMonthsAgo, archived_at: new Date().toISOString() },
    { organization_id: orgA, name: 'Brand New', status: 'Onboarding' },
  ])

  await insert('leads', [
    { organization_id: orgA, company_name: 'Lead New', contact_name: 'c', status: 'New' },
    { organization_id: orgA, company_name: 'Lead Contacted', contact_name: 'c', status: 'Contacted' },
    { organization_id: orgA, company_name: 'Lead Qualified', contact_name: 'c', status: 'Qualified' },
    { organization_id: orgA, company_name: 'Lead Converted', contact_name: 'c', status: 'Converted' },
    { organization_id: orgA, company_name: 'Lead Disqualified', contact_name: 'c', status: 'Disqualified' },
    { organization_id: orgA, company_name: 'Lead Archived', contact_name: 'c', status: 'New', archived_at: new Date().toISOString() },
    { organization_id: orgA, company_name: 'Lead Old Open', contact_name: 'c', status: 'New', created_at: twoMonthsAgo },
  ])

  await insert('quotes', [
    { organization_id: orgA, quote_number: 'CQ-DRAFT', client_name: 'Acme', status: 'Draft' },
    { organization_id: orgA, quote_number: 'CQ-REVIEW', client_name: 'Acme', status: 'Internal Review' },
    { organization_id: orgA, quote_number: 'CQ-SENT', client_name: 'Acme', status: 'Sent' },
    { organization_id: orgA, quote_number: 'CQ-ACCEPTED', client_name: 'Acme', status: 'Accepted' },
    { organization_id: orgA, quote_number: 'CQ-DECLINED', client_name: 'Acme', status: 'Declined' },
    { organization_id: orgA, quote_number: 'CQ-EXPIRED', client_name: 'Acme', status: 'Expired' },
    { organization_id: orgA, quote_number: 'CQ-ARCHIVED', client_name: 'Acme', status: 'Draft', archived_at: new Date().toISOString() },
  ])

  await insert('sales_opportunities', [
    { organization_id: orgA, name: 'Opp 3000', client_name: 'Alpha', stage: 'Discovery', expected_value: 3000, currency: 'ZAR' },
    { organization_id: orgA, name: 'Opp 1000', client_name: 'Beta', stage: 'Discovery', expected_value: 1000, currency: 'ZAR', expected_close: dateOnly(year, month, 28) },
    { organization_id: orgA, name: 'Opp 700 USD', client_name: 'Gamma', stage: 'Discovery', expected_value: 700, currency: 'USD', expected_close: dateOnly(year + 1, 1, 15) },
    { organization_id: orgA, name: 'Opp 200', client_name: 'Delta', stage: 'Discovery', expected_value: 200, currency: 'ZAR', expected_close: lastMonthTenth },
    { organization_id: orgA, name: 'Opp 50', client_name: 'Epsilon', stage: 'Discovery', expected_value: 50, currency: 'ZAR', expected_close: dateOnly(year, month, 5) },
    { organization_id: orgA, name: 'Opp Unvalued', client_name: 'Zeta', stage: 'Proposal', expected_value: 0, currency: 'ZAR' },
    { organization_id: orgA, name: 'Opp Lost', client_name: 'Eta', stage: 'Lost', expected_value: 9999, currency: 'ZAR' },
    { organization_id: orgA, name: 'Opp Archived', client_name: 'Theta', stage: 'Discovery', expected_value: 8888, currency: 'ZAR', archived_at: new Date().toISOString() },
    { organization_id: orgA, name: 'Won ZAR', client_name: 'Iota', stage: 'Won', expected_value: 2000, currency: 'ZAR' },
    { organization_id: orgA, name: 'Won USD', client_name: 'Kappa', stage: 'Won', expected_value: 400, currency: 'USD' },
    { organization_id: orgA, name: 'Won Last Year Start', client_name: 'Lambda', stage: 'Won', expected_value: 500, currency: 'ZAR', won_at: local(year - 1, 1, 1, 0) },
    { organization_id: orgA, name: 'Won Archived', client_name: 'Mu', stage: 'Won', expected_value: 7777, currency: 'ZAR', archived_at: new Date().toISOString() },
  ])

  await insert('vendors', { organization_id: orgA, name: 'Vendor One', vendor_type: 'Software' })
  await insert('invoices', { organization_id: orgA, invoice_number: 'CINV-1', client_name: 'Acme' })
  await insert('client_onboardings', { organization_id: orgA, client_name: 'Onboard Co' })

  // Organisation B holds one row of its own, so isolation is proved against a
  // populated neighbour and not an empty one.
  await insert('clients', { organization_id: orgB, name: 'Other Org Client', status: 'Active' })
})

after(async () => {
  await cleanup([orgA, orgB], [member.id, outsider.id])
})

// ----------------------------------------------------------------- KPIs

test('a plain member reads the KPIs, each following its stated definition', async () => {
  const { data, error } = await kpis(memberClient, orgA)
  assert.equal(error, null)

  // Clients: archived ones leave the total. At the end of last month the
  // archived-today client was still active, so it counts there.
  assert.deepEqual(data.clients, { total: 2, at_previous_month_end: 2 })

  // Leads: New / Contacted / Qualified are open, Converted / Disqualified / archived are not.
  assert.equal(data.leads.open, 4)
  assert.equal(data.leads.created_this_month, 5, 'created this month excludes the old and the archived lead')

  // Quotes: Draft / Internal Review / Sent are active; resolved and archived are not.
  assert.deepEqual(data.quotes, { active: 3, sent: 1 })
  assert.equal(data.timezone, TZ)
})

test('revenue is won sales only, per currency, and compares the same period last year', async () => {
  const { data, error } = await kpis(memberClient, orgA)
  assert.equal(error, null)
  const byCurrency = Object.fromEntries(data.revenue.by_currency.map((row: any) => [row.currency, row]))
  assert.deepEqual(Object.keys(byCurrency).sort(), ['USD', 'ZAR'], 'currencies stay separate')
  assert.equal(Number(byCurrency.ZAR.year_to_date), 2000, 'lost, archived and open opportunities are not revenue')
  assert.equal(byCurrency.ZAR.deals, 1)
  assert.equal(Number(byCurrency.ZAR.previous_year_to_date), 500)
  assert.equal(Number(byCurrency.USD.year_to_date), 400)
  assert.equal(Number(byCurrency.USD.previous_year_to_date), 0)
  assert.equal(data.revenue.won_without_date, 0)
})

test('last year is compared only up to the same point in the year', { skip: month === 12 ? 'a December run cannot show a later-in-year exclusion' : false }, async () => {
  await insert('sales_opportunities', {
    organization_id: orgA, name: 'Won Last Year Late', client_name: 'Nu', stage: 'Won', expected_value: 300, currency: 'ZAR', won_at: local(year - 1, 12, 31, 12),
  })
  try {
    const { data } = await kpis(memberClient, orgA)
    const zar = data.revenue.by_currency.find((row: any) => row.currency === 'ZAR')
    assert.equal(Number(zar.previous_year_to_date), 500, 'a win after this point last year is not part of the comparison')
  } finally {
    await admin.from('sales_opportunities').delete().eq('organization_id', orgA).eq('name', 'Won Last Year Late')
  }
})

test('a module the plan excludes comes back as null, never as zero', async () => {
  const { data, error } = await kpis(memberClient, orgA, ['clients'])
  assert.equal(error, null)
  assert.notEqual(data.clients, null)
  assert.equal(data.leads, null)
  assert.equal(data.quotes, null)
  assert.equal(data.revenue, null)

  const none = await kpis(memberClient, orgA, [])
  assert.deepEqual([none.data.clients, none.data.leads, none.data.quotes, none.data.revenue], [null, null, null, null])
})

// ----------------------------------------------------------------- pipeline

test('the pipeline groups open opportunities by stage, with per-currency totals and the top three', async () => {
  const { data, error } = await pipeline(memberClient, orgA)
  assert.equal(error, null)
  assert.deepEqual(data.stages.map((stage: any) => stage.stage), ['Discovery', 'Qualified', 'Proposal', 'Negotiation'])

  const [discovery, qualified, proposal] = data.stages
  assert.equal(discovery.count, 5, 'archived and lost opportunities are excluded')
  const totals = Object.fromEntries(discovery.totals.map((row: any) => [row.currency, Number(row.amount)]))
  assert.deepEqual(totals, { USD: 700, ZAR: 4250 }, 'ZAR and USD are totalled separately')
  assert.deepEqual(discovery.previews.map((preview: any) => preview.name), ['Opp 3000', 'Opp 1000', 'Opp 700 USD'], 'the three largest, largest first')
  assert.equal(discovery.previews[0].client_name, 'Alpha')

  assert.equal(qualified.count, 0)
  assert.deepEqual(qualified.totals, [])
  assert.equal(proposal.count, 1)
  assert.equal(Number(proposal.previews[0].expected_value), 0, 'an unvalued opportunity is returned as 0 for the UI to label')
})

test('Closed Won is this year only, apart from the open pipeline, and open stages never include it', async () => {
  const { data } = await pipeline(memberClient, orgA)
  assert.equal(data.won.count, 2, 'last year, archived and open rows are not this year\'s wins')
  const totals = Object.fromEntries(data.won.totals.map((row: any) => [row.currency, Number(row.amount)]))
  assert.deepEqual(totals, { USD: 400, ZAR: 2000 })
  const openNames = data.stages.flatMap((stage: any) => stage.previews.map((preview: any) => preview.name))
  assert.ok(!openNames.some((name: string) => name.startsWith('Won')), 'a won deal must not appear as open pipeline')
})

test('without the Sales module the pipeline is null, not an empty board', async () => {
  const { data, error } = await pipeline(memberClient, orgA, ['clients'])
  assert.equal(error, null)
  assert.deepEqual(data, { stages: null, won: null })
})

// ----------------------------------------------------------------- revenue chart

test('the chart buckets won revenue by the month it was won and pipeline by expected close', async () => {
  const { data, error } = await revenue(memberClient, orgA)
  assert.equal(error, null)
  const thisMonth = `${year}-${pad(month)}`
  const won = (key: string, currency: string) => data.won_by_month.find((row: any) => row.month === key && row.currency === currency)

  assert.equal(Number(won(thisMonth, 'ZAR').amount), 2000)
  assert.equal(Number(won(thisMonth, 'USD').amount), 400)
  assert.equal(Number(won(`${year - 1}-01`, 'ZAR').amount), 500, 'a win at the start of last year lands in January of last year')

  const pipelineThisMonth = data.pipeline_by_month.find((row: any) => row.month === thisMonth && row.currency === 'ZAR')
  assert.equal(Number(pipelineThisMonth.amount), 1050)
  assert.equal(pipelineThisMonth.deals, 2)

  const weeks = Object.fromEntries(data.pipeline_this_month_by_week.map((row: any) => [row.week, Number(row.amount)]))
  assert.deepEqual(weeks, { 1: 50, 4: 1000 }, 'the 5th is week 1 and the 28th is week 4')
  assert.equal(data.won_this_month_by_week.reduce((total: number, row: any) => total + (row.currency === 'ZAR' ? Number(row.amount) : 0), 0), 2000)
})

test('pipeline that cannot be placed on the chart is counted and disclosed, not dropped or invented', async () => {
  const { data } = await revenue(memberClient, orgA)
  assert.deepEqual(data.pipeline_not_charted, { no_close_date: 2, past_close_date: 1, next_year_or_later: 1 })
  const charted = data.pipeline_by_month.reduce((total: number, row: any) => total + row.deals, 0)
  assert.equal(charted + 2 + 1 + 1, 6, 'every open opportunity is either charted or disclosed')
})

test('without the Sales module there is no revenue chart', async () => {
  const { data, error } = await revenue(memberClient, orgA, ['clients'])
  assert.equal(error, null)
  assert.equal(data, null)
})

// ----------------------------------------------------------------- activity

test('each module contributes its record events from their own timestamps, without archived records', async () => {
  // One call per module: the feed is capped at 25 events, and this fixture has more
  // than that across all modules, so a single call could not show every kind.
  const expected: Record<string, string[]> = {
    clients: ['client.created'],
    leads: ['lead.created'],
    quotes: ['quote.created', 'quote.sent', 'quote.accepted'],
    sales: ['opportunity.created', 'opportunity.won'],
    invoices: ['invoice.created'],
    vendors: ['vendor.added'],
    onboarding: ['onboarding.started'],
  }
  const titles: string[] = []
  for (const [module, kinds] of Object.entries(expected)) {
    const { data, error } = await activity(memberClient, orgA, [module])
    assert.equal(error, null, module)
    const seen = new Set(data.map((event: any) => event.kind))
    for (const kind of kinds) assert.ok(seen.has(kind), `${module} is missing ${kind}`)
    for (const kind of seen) assert.ok(kinds.includes(kind as string), `${module} must not produce ${kind}`)
    titles.push(...data.map((event: any) => event.title))
  }
  for (const archived of ['Lead Archived', 'CQ-ARCHIVED', 'Opp Archived', 'Won Archived', 'Archived Today']) {
    assert.ok(!titles.includes(archived), `${archived} is archived and must not appear`)
  }

  const quotes = await activity(memberClient, orgA, ['quotes'])
  const sent = quotes.data.find((event: any) => event.kind === 'quote.sent')
  assert.equal(sent.title, 'CQ-SENT')
  assert.equal(sent.subtitle, 'Acme')
})

test('activity is newest first across modules', async () => {
  const { data, error } = await activity(memberClient, orgA)
  assert.equal(error, null)
  assert.equal(data.length, 25, 'the feed is capped at 25 events')
  const times = data.map((event: any) => new Date(event.occurred_at).getTime())
  assert.deepEqual(times, [...times].sort((a, b) => b - a))
})

test('activity respects the limit and the plan', async () => {
  const limited = await activity(memberClient, orgA, ALL, 3)
  assert.equal(limited.data.length, 3)

  const leadsOnly = await activity(memberClient, orgA, ['leads'])
  assert.ok(leadsOnly.data.length > 0)
  assert.ok(leadsOnly.data.every((event: any) => event.kind === 'lead.created'), 'only the modules in the plan contribute events')

  const none = await activity(memberClient, orgA, [])
  assert.deepEqual(none.data, [], 'an empty plan is an empty feed')
})

// ----------------------------------------------------------------- isolation and access

test('another organisation sees only its own rows, even with the same call', async () => {
  const own = await kpis(outsiderClient, orgB)
  assert.equal(own.error, null)
  assert.deepEqual(own.data.clients, { total: 1, at_previous_month_end: 0 })
  assert.equal(own.data.leads.open, 0)
  assert.deepEqual(own.data.quotes, { active: 0, sent: 0 })
  assert.deepEqual(own.data.revenue.by_currency, [])

  const board = await pipeline(outsiderClient, orgB)
  assert.ok(board.data.stages.every((stage: any) => stage.count === 0))
  const feed = await activity(outsiderClient, orgB)
  assert.deepEqual(feed.data.map((event: any) => event.title), ['Other Org Client'])
})

test('a non-member is refused with 42501, never answered with zeros', async () => {
  for (const [name, call] of [
    ['kpis', () => kpis(outsiderClient, orgA)],
    ['pipeline', () => pipeline(outsiderClient, orgA)],
    ['revenue', () => revenue(outsiderClient, orgA)],
    ['activity', () => activity(outsiderClient, orgA)],
  ] as const) {
    const { data, error } = await call()
    assert.ok(error, `${name} must refuse a non-member`)
    assert.equal(error!.code, '42501', name)
    assert.equal(data, null, `${name} must return nothing`)
  }
})

test('a signed-out caller cannot execute any of them', async () => {
  for (const name of ['crm_overview_kpis', 'crm_overview_pipeline', 'crm_overview_revenue', 'crm_overview_activity']) {
    const { error } = await anonymous.rpc(name, { p_organization_id: orgA, p_modules: ALL })
    assert.ok(error, `${name} must refuse anon`)
    assert.match(error!.message, new RegExp(`permission denied for function ${name}`), name)
  }
})

// ----------------------------------------------------------------- milestone timestamps

test('editing a won opportunity does not re-date the win, and re-winning does', async () => {
  const created = await admin.from('sales_opportunities')
    .insert({ organization_id: orgA, name: 'Date Keeper', client_name: 'Xi', stage: 'Won', expected_value: 10, won_at: local(year - 1, 3, 3, 9) })
    .select('id, won_at').single()
  assert.equal(created.error, null)
  const id = created.data!.id
  const original = new Date(created.data!.won_at).getTime()

  const edited = await admin.from('sales_opportunities')
    .update({ notes: 'edited later', won_at: new Date().toISOString() }).eq('id', id).select('won_at').single()
  assert.equal(new Date(edited.data!.won_at).getTime(), original, 'an edit, even one that sends a new won_at, keeps the original date')

  const lost = await admin.from('sales_opportunities').update({ stage: 'Lost' }).eq('id', id).select('won_at').single()
  assert.equal(lost.data!.won_at, null, 'a deal that is no longer won has no win date')

  const rewon = await admin.from('sales_opportunities').update({ stage: 'Won', won_at: new Date().toISOString() }).eq('id', id).select('won_at').single()
  assert.ok(new Date(rewon.data!.won_at).getTime() > original, 'winning it again is a new win')
  await admin.from('sales_opportunities').delete().eq('id', id)
})

test('a quote keeps its sent date through edits and acceptance, and loses its accepted date if reopened', async () => {
  const created = await admin.from('quotes')
    .insert({ organization_id: orgA, quote_number: 'CQ-MILESTONES', client_name: 'Omicron', status: 'Sent', sent_at: local(year - 1, 5, 5, 8) })
    .select('id, sent_at').single()
  assert.equal(created.error, null)
  const id = created.data!.id
  const sentAt = new Date(created.data!.sent_at).getTime()

  const edited = await admin.from('quotes').update({ notes: 'edit', sent_at: new Date().toISOString() }).eq('id', id).select('sent_at').single()
  assert.equal(new Date(edited.data!.sent_at).getTime(), sentAt, 'an edit does not re-send the quote')

  const accepted = await admin.from('quotes').update({ status: 'Accepted', sent_at: null }).eq('id', id).select('sent_at, accepted_at').single()
  assert.equal(new Date(accepted.data!.sent_at).getTime(), sentAt, 'accepting a quote does not erase when it was sent')
  assert.ok(accepted.data!.accepted_at)
  const acceptedAt = new Date(accepted.data!.accepted_at).getTime()

  const again = await admin.from('quotes').update({ notes: 'still accepted', accepted_at: new Date().toISOString() }).eq('id', id).select('accepted_at').single()
  assert.equal(new Date(again.data!.accepted_at).getTime(), acceptedAt, 'an edit keeps the original acceptance date')

  const reopened = await admin.from('quotes').update({ status: 'Draft' }).eq('id', id).select('sent_at, accepted_at').single()
  assert.equal(reopened.data!.accepted_at, null, 'a reopened quote is no longer accepted')
  assert.equal(new Date(reopened.data!.sent_at).getTime(), sentAt, 'but it was still sent')
  await admin.from('quotes').delete().eq('id', id)
})
