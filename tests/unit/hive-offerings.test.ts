import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HiveOfferingsError,
  fetchHiveOfferings,
  offeringRandPrice,
  parseHiveOfferingsFeed,
} from '../../lib/integrations/hive-offerings.ts'

const feed = {
  schemaVersion: '1.0',
  source: 'HIVE Origin',
  workspace: { key: 'himark', name: 'HIMARK' },
  offerings: [
    {
      key: 'retainer:growth', kind: 'retainer', name: 'Growth', status: 'active', futureField: 1,
      price: { model: 'fixed', currency: 'ZAR', amount: 150000, billingPeriod: 'month', binding: true },
      credits: { amount: 75, unit: 'month', rolloverAllowed: false }, projectLimit: 4, entitlements: [],
    },
    {
      key: 'project:digital-presence', kind: 'project', name: 'Digital Presence', status: 'active',
      price: { model: 'credit_range', currency: null, amount: null, billingPeriod: null, binding: false, reason: 'no approved price' },
      credits: { minimum: 15, maximum: 150, unit: 'project' },
    },
  ],
  generatedAt: '2026-10-13T18:00:00.000Z',
  revision: 'abc',
}

const env = { HIVE_OFFERINGS_URL: 'https://hive.test/api/integrations/unison/offerings', HIVE_OFFERINGS_API_KEY: 'k' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

test('parses the feed and keeps unknown fields', () => {
  const parsed = parseHiveOfferingsFeed(feed)
  assert.equal(parsed.offerings.length, 2)
  assert.equal((parsed.offerings[0] as Record<string, unknown>).futureField, 1)
})

test('only a binding rand price is shown; a credit range has none', () => {
  const [retainer, project] = parseHiveOfferingsFeed(feed).offerings
  assert.equal(offeringRandPrice(retainer), 150000)
  assert.equal(offeringRandPrice(project), null)
})

test('rejects an unsupported major schema version and a malformed feed', () => {
  assert.throws(() => parseHiveOfferingsFeed({ ...feed, schemaVersion: '2.0' }), (e) => e instanceof HiveOfferingsError && e.reason === 'unsupported_version')
  assert.doesNotThrow(() => parseHiveOfferingsFeed({ ...feed, schemaVersion: '1.7' }))
  assert.throws(() => parseHiveOfferingsFeed({ schemaVersion: '1.0' }), (e) => e instanceof HiveOfferingsError && e.reason === 'invalid')
})

test('sends the bearer key, never follows redirects, and returns the feed', async () => {
  let seen: { url: string; init: RequestInit } | undefined
  const result = await fetchHiveOfferings({ env, fetch: async (url, init) => ((seen = { url, init }), json(feed)) })
  assert.equal(result.workspace.key, 'himark')
  assert.equal(seen?.url, env.HIVE_OFFERINGS_URL)
  assert.equal((seen?.init.headers as Record<string, string>).Authorization, 'Bearer k')
  assert.equal(seen?.init.redirect, 'manual')
})

test('maps failures to typed errors', async () => {
  const reason = (fetch: (u: string, i: RequestInit) => Promise<Response>) =>
    fetchHiveOfferings({ env, fetch }).then(() => 'ok', (e) => (e instanceof HiveOfferingsError ? e.reason : 'other'))
  assert.equal(await reason(async () => json({}, 401)), 'unauthorized')
  assert.equal(await reason(async () => new Response(null, { status: 307 })), 'unavailable')
  assert.equal(await reason(async () => json({}, 502)), 'unavailable')
  assert.equal(await reason(async () => { throw new Error('network') }), 'unavailable')
  assert.equal(await reason(async () => new Response('<html>', { status: 200 })), 'invalid')
})

test('a missing key or url is a configuration error', async () => {
  await assert.rejects(fetchHiveOfferings({ env: { HIVE_OFFERINGS_URL: 'x' }, fetch: async () => json(feed) }), /HIVE_OFFERINGS_API_KEY/)
})
