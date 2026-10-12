import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { SEED_TEMPLATES } from '../../../features/terms/seed-wording.ts'
import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let org: string
let adminUser: U
let member: U
let adminClient: SupabaseClient
let memberClient: SupabaseClient

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}

before(async () => {
  org = await createFixtureOrg('terms-seed')
  adminUser = await createFixtureUser(org, 'admin')
  member = await createFixtureUser(org, 'member')
  adminClient = await signedInClient(adminUser.email, adminUser.password)
  memberClient = await signedInClient(member.email, member.password)
  must(await admin.from('organization_settings').insert({
    organization_id: org, default_quote_terms: 'Quote clause A.\r\nQuote clause B.', default_payment_terms: '   ',
  }).select('id').single())
})

after(async () => {
  await cleanup([org].filter(Boolean), [adminUser?.id, member?.id].filter(Boolean))
})

const templates = async () => must(await admin.from('terms_templates').select('*').eq('organization_id', org)) as Record<string, any>[]
const versions = async () => must(await admin.from('terms_template_versions').select('*').eq('organization_id', org)) as Record<string, any>[]

test('only the service role can run the seed', async () => {
  for (const client of [adminClient, memberClient]) {
    const result = await client.rpc('seed_commercial_terms', { p_org: org })
    assert.ok(result.error, 'a signed-in role cannot call it')
  }
  assert.equal((await templates()).length, 0, 'nothing was created')
})

test('the seed loads the company templates, the offering templates and approved wording, and is safe to run twice', async () => {
  assert.equal((await admin.rpc('seed_commercial_terms', { p_org: org })).error, null)
  assert.equal((await admin.rpc('seed_commercial_terms', { p_org: org })).error, null, 'running it again changes nothing')

  const rows = await templates()
  assert.equal(rows.length, 2 + SEED_TEMPLATES.length)
  assert.equal(rows.filter((row) => row.target_kind === 'company').length, 2)
  assert.equal(rows.filter((row) => row.target_kind === 'retainer').length, 4)
  assert.equal(rows.filter((row) => row.target_kind === 'project').length, 6)
  assert.equal(rows.filter((row) => row.target_kind === 'support').length, 10)

  const all = await versions()
  // 4 retainers + 6 projects + the company quote terms (the payment terms were blank, so no invoice version).
  assert.equal(all.length, 11)
  assert.ok(all.every((row) => row.status === 'approved' && row.version === 1 && row.effective_from === '2026-10-12' && row.approved_at))

  const byId = new Map(rows.map((row) => [row.id, row]))
  const companyQuote = all.find((row) => byId.get(row.template_id)?.target_kind === 'company')!
  assert.equal(byId.get(companyQuote.template_id)!.applies_to, 'quote')
  assert.equal(companyQuote.body, 'Quote clause A.\nQuote clause B.', 'copied from the settings with plain line endings')

  const signature = all.find((row) => byId.get(row.template_id)?.target_key === 'signature')!
  assert.match(signature.body, /\{\{monthly_fee\}\}/, 'the wording keeps its placeholders')
  assert.match(signature.inclusions, /Dedicated HIMARK Engagement Lead/)
  const support = rows.filter((row) => row.target_kind === 'support')
  assert.ok(support.every((row) => !all.some((version) => version.template_id === row.id)), 'support services have no version yet')
})

test('after the seed, a member reads the approved wording and an admin sees the empty support templates', async () => {
  const seen = must(await memberClient.from('terms_template_versions').select('id,status').eq('organization_id', org)) as Array<{ status: string }>
  assert.equal(seen.length, 11)
  assert.ok(seen.every((row) => row.status === 'approved'))
  const adminSees = must(await adminClient.from('terms_templates').select('id').eq('organization_id', org)) as unknown[]
  assert.equal(adminSees.length, 2 + SEED_TEMPLATES.length)
})
