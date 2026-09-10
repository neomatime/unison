import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

const tables = [
  'leads',
  'sales_opportunities',
  'quotes',
  'invoices',
  'expenses',
  'financial_forecasts',
] as const

let orgA: string
let orgB: string
let ownerA: { id: string; email: string; password: string }

before(async () => {
  orgA = await createFixtureOrg('phase-six-a')
  orgB = await createFixtureOrg('phase-six-b')
  ownerA = await createFixtureUser(orgA, 'owner')

  const { data: lead, error: leadError } = await admin
    .from('leads')
    .insert({ organization_id: orgB, company_name: 'Other Prospect', contact_name: 'Other Contact' })
    .select('id')
    .single()
  if (leadError) throw leadError

  const { data: opportunity, error: opportunityError } = await admin
    .from('sales_opportunities')
    .insert({
      organization_id: orgB,
      name: 'Other Opportunity',
      client_name: 'Other Prospect',
      lead_id: lead.id,
    })
    .select('id')
    .single()
  if (opportunityError) throw opportunityError

  const { data: quote, error: quoteError } = await admin
    .from('quotes')
    .insert({
      organization_id: orgB,
      quote_number: 'OTHER-QUOTE',
      client_name: 'Other Prospect',
      lead_id: lead.id,
      opportunity_id: opportunity.id,
    })
    .select('id')
    .single()
  if (quoteError) throw quoteError

  const fixtureWrites = [
    admin.from('invoices').insert({
      organization_id: orgB,
      invoice_number: 'OTHER-INVOICE',
      client_name: 'Other Prospect',
      quote_id: quote.id,
      opportunity_id: opportunity.id,
    }),
    admin.from('expenses').insert({
      organization_id: orgB,
      description: 'Other Expense',
      amount: 100,
      expense_date: '2026-09-10',
    }),
    admin.from('financial_forecasts').insert({
      organization_id: orgB,
      name: 'Other Forecast',
      period_label: 'Q4 2026',
    }),
  ]
  for (const write of fixtureWrites) {
    const { error } = await write
    if (error) throw error
  }
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [ownerA?.id].filter(Boolean))
})

test('a tenant member can persist all six commercial and finance record types', async () => {
  const client = await signedInClient(ownerA.email, ownerA.password)

  const { data: lead, error: leadError } = await client
    .from('leads')
    .insert({
      organization_id: orgA,
      company_name: 'Persistent Prospect',
      contact_name: 'Primary Contact',
      estimated_value: 500000,
      status: 'Qualified',
    })
    .select('id')
    .single()
  assert.equal(leadError, null)
  assert.ok(lead)

  const { data: opportunity, error: opportunityError } = await client
    .from('sales_opportunities')
    .insert({
      organization_id: orgA,
      name: 'Persistent Opportunity',
      client_name: 'Persistent Prospect',
      lead_id: lead!.id,
      expected_value: 500000,
      probability_percent: 70,
    })
    .select('id')
    .single()
  assert.equal(opportunityError, null)
  assert.ok(opportunity)

  const { data: quote, error: quoteError } = await client
    .from('quotes')
    .insert({
      organization_id: orgA,
      quote_number: 'PHASE6-Q-001',
      client_name: 'Persistent Prospect',
      lead_id: lead!.id,
      opportunity_id: opportunity!.id,
      subtotal: 400000,
      tax_amount: 60000,
      total_amount: 460000,
    })
    .select('id')
    .single()
  assert.equal(quoteError, null)
  assert.ok(quote)

  const writes = [
    client.from('invoices').insert({
      organization_id: orgA,
      invoice_number: 'PHASE6-I-001',
      client_name: 'Persistent Prospect',
      quote_id: quote!.id,
      opportunity_id: opportunity!.id,
      subtotal: 400000,
      tax_amount: 60000,
      total_amount: 460000,
      balance_amount: 460000,
    }),
    client.from('expenses').insert({
      organization_id: orgA,
      description: 'Persistent Expense',
      amount: 2500,
      expense_date: '2026-09-10',
      status: 'Submitted',
    }),
    client.from('financial_forecasts').insert({
      organization_id: orgA,
      name: 'Persistent Forecast',
      period_label: 'Q4 2026',
      actual_value: 200000,
      projected_value: 350000,
      confidence_percent: 75,
      status: 'Current',
    }),
  ]
  for (const write of writes) {
    const { error } = await write
    assert.equal(error, null)
  }

  for (const table of tables) {
    const { data, error } = await client.from(table).select('id').eq('organization_id', orgA)
    assert.equal(error, null)
    assert.ok((data?.length ?? 0) > 0, `${table} should contain the persisted fixture`)
  }
})

test('all Phase 6 records from another organization remain invisible', async () => {
  const client = await signedInClient(ownerA.email, ownerA.password)
  for (const table of tables) {
    const { data, error } = await client.from(table).select('id').eq('organization_id', orgB)
    assert.equal(error, null)
    assert.deepEqual(data, [], `${table} must not expose another tenant's records`)
  }
})

test('commercial and finance writes cannot target another organization', async () => {
  const client = await signedInClient(ownerA.email, ownerA.password)
  const { error } = await client.from('invoices').insert({
    organization_id: orgB,
    invoice_number: 'CROSS-TENANT',
    client_name: 'Other Prospect',
  })
  assert.ok(error, 'cross-tenant invoice creation must be refused')
  assert.match(error.message, /row-level security|policy|permission/i)
})

test('financial constraints reject invalid invoice and forecast values', async () => {
  const client = await signedInClient(ownerA.email, ownerA.password)
  const { error: invoiceError } = await client.from('invoices').insert({
    organization_id: orgA,
    invoice_number: 'INVALID-BALANCE',
    client_name: 'Persistent Prospect',
    total_amount: 100,
    balance_amount: 150,
  })
  assert.ok(invoiceError, 'balance greater than total must be rejected')

  const { error: forecastError } = await client.from('financial_forecasts').insert({
    organization_id: orgA,
    name: 'Invalid Confidence',
    period_label: 'Q4 2026',
    confidence_percent: 150,
  })
  assert.ok(forecastError, 'confidence above 100 must be rejected')
})
