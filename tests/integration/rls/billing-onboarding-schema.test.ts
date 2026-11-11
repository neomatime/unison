import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { ok, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin } from './helpers.ts'
import { must } from './portal-fixtures.ts'

// Accept to invoice, stage 4, task 1: the schema for starting the work. client_onboardings.quote_id (unique, same organisation, kept
// when the quote goes) and the start decision on the billing plan (both set or both null, at most 500 characters). Nothing here has a
// function behind it yet, so the service role writes and the constraints are asked what they let through. Every refusal is checked by
// SQLSTATE and by the name of the constraint, so a row cannot be refused for the wrong reason.

let fx: BillingOrg
let other: BillingOrg

before(async () => {
  fx = await setupBillingOrg('billing-onb-schema-a', { billing: false })
  other = await setupBillingOrg('billing-onb-schema-b', { billing: false })
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    await other?.teardown()
  }
})

const refused = (result: { error: { code?: string; message: string } | null }, code: string, message: RegExp, label: string) => {
  assert.equal(result.error?.code, code, `${label}: ${result.error?.message}`)
  assert.match(result.error?.message ?? '', message, label)
}
const onboarding = (org: BillingOrg, fields: Record<string, unknown> = {}) =>
  admin.from('client_onboardings').insert({ organization_id: org.orgId, client_id: org.clientId, client_name: 'Portal Client', ...fields }).select('id,quote_id').single()

test('quote_id on an onboarding is unique and belongs to the same organisation; deleting the quote keeps the onboarding', async () => {
  const quote = await fx.draftQuote()
  const otherQuote = await other.draftQuote()
  const first = await onboarding(fx, { quote_id: quote })
  ok(first, 'the first onboarding for the quote')
  assert.equal(first.data!.quote_id, quote)

  refused(await onboarding(fx, { quote_id: quote }), '23505', /client_onboardings_quote_id_key/, 'a second onboarding for the same quote')
  refused(await onboarding(fx, { quote_id: otherQuote }), '23503', /client_onboardings_quote_id_organization_id_fkey/, 'a quote of another organisation')
  ok(await onboarding(fx), 'an onboarding with no quote')
  ok(await onboarding(fx), 'and another: null is not unique')

  ok(await admin.from('quotes').delete().eq('id', quote), 'delete the quote')
  const kept = must(await admin.from('client_onboardings').select('id,quote_id').eq('id', first.data!.id).single())
  assert.equal(kept.quote_id, null, 'the onboarding stays and loses only the link')
})

test('the start decision columns are both set or both null and the reason is at most 500 characters', async () => {
  await fx.setBilling(true)
  const quote = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(quote)
  const plan = must(await admin.from('billing_plans').select('*').eq('quote_id', quote).single()) as Record<string, any>
  assert.equal(plan.readiness_override_at, null)
  assert.equal(plan.readiness_override_by, null)
  assert.equal(plan.readiness_override_reason, null)

  const set = (change: Record<string, unknown>) => admin.from('billing_plans').update(change).eq('id', plan.id)
  const now = new Date().toISOString()
  refused(await set({ readiness_override_at: now }), '23514', /billing_plans_readiness_override_pair_check/, 'a time without a reason')
  refused(await set({ readiness_override_reason: 'Agreed by phone' }), '23514', /billing_plans_readiness_override_pair_check/, 'a reason without a time')
  refused(await set({ readiness_override_at: now, readiness_override_reason: 'x'.repeat(501) }), '23514', /billing_plans_readiness_override_reason_check/, 'a reason over 500 characters')
  ok(await set({ readiness_override_at: now, readiness_override_reason: 'Agreed by phone' }), 'both')
  ok(await set({ readiness_override_at: null, readiness_override_reason: null, readiness_override_by: null }), 'cleared')
  await fx.setBilling(false)
})
