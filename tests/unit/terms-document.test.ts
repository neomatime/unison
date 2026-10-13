import assert from 'node:assert/strict'
import test from 'node:test'

import { offeringFromRateKey, offeringsForDocument, planFill, sourceSummary, targetsForDocument } from '../../features/terms/document-terms.ts'
import type { ResolvedTerms } from '../../features/terms/resolve-terms.ts'

const resolved = (over: Partial<ResolvedTerms> = {}): ResolvedTerms => ({
  lines: ['Payment is due in 30 days.', 'Work starts on acceptance.'],
  inclusions: ['Engagement lead'],
  sources: [{ layer: 'company', templateId: 't1', versionId: 'v1', version: 1 }],
  missing: [],
  skipped: [],
  ...over,
})

test('a rate key names its offering; top-ups and unknown shapes name none', () => {
  assert.deepEqual(offeringFromRateKey('retainer.growth.monthly'), { kind: 'retainer', key: 'growth' })
  assert.deepEqual(offeringFromRateKey('project.digital_presence'), { kind: 'project', key: 'digital_presence' })
  assert.deepEqual(offeringFromRateKey('support.website_care'), { kind: 'support', key: 'website_care' })
  assert.equal(offeringFromRateKey('project.top_up'), null)
  assert.equal(offeringFromRateKey('credit.thing'), null)
  assert.equal(offeringFromRateKey(null), null)
  assert.equal(offeringFromRateKey('retainer.Bad Key.monthly'), null)
})

test('the engagement beats the lines', () => {
  const found = offeringsForDocument({ engagement: { kind: 'retainer', packageKey: 'growth' }, lines: [{ rateKey: 'support.website_care' }] })
  assert.deepEqual(found, [{ kind: 'retainer', key: 'growth' }])
})

test('without an engagement the locked lines give the offerings, in order, without repeats', () => {
  const found = offeringsForDocument({
    engagement: null,
    lines: [{ rateKey: 'project.operating_model' }, { rateKey: null }, { rateKey: 'support.website_care' }, { rateKey: 'project.operating_model' }, { rateKey: 'project.top_up' }],
  })
  assert.deepEqual(found, [{ kind: 'project', key: 'operating_model' }, { kind: 'support', key: 'website_care' }])
})

test('targets start with company terms and add each offering once', () => {
  const targets = targetsForDocument([{ kind: 'retainer', key: 'growth' }, { kind: 'retainer', key: 'growth' }, { kind: 'project', key: 'intelligence_ai' }])
  assert.deepEqual(targets.map((t) => `${t.targetKind}:${t.targetKey}`), ['company:null', 'retainer:growth', 'project:intelligence_ai'])
  assert.deepEqual(targetsForDocument([]).map((t) => t.targetKind), ['company'])
})

test('a fill with a missing value is refused and names it', () => {
  const plan = planFill({ resolved: resolved({ missing: ['initiative_limit'] }), existingTerms: '' })
  assert.deepEqual(plan, { ok: false, missing: ['initiative_limit'] })
})

test('a fill writes plain lines, inclusions and snake_case sources', () => {
  const plan = planFill({ resolved: resolved(), existingTerms: null })
  assert.equal(plan.ok, true)
  if (!plan.ok) return
  assert.equal(plan.terms, 'Payment is due in 30 days.\nWork starts on acceptance.')
  assert.equal(plan.inclusions, 'Engagement lead')
  assert.deepEqual(plan.sources, [{ template_id: 't1', version_id: 'v1', version: 1, layer: 'company' }])
  assert.equal(plan.needsConfirm, false)
})

test('typed terms need confirming before they are replaced; identical text or blank does not', () => {
  const confirm = (existing: string) => {
    const plan = planFill({ resolved: resolved(), existingTerms: existing })
    return plan.ok && plan.needsConfirm
  }
  assert.equal(confirm('My own terms'), true)
  assert.equal(confirm('   \r\n  '), false)
  assert.equal(confirm('Payment is due in 30 days.\r\nWork starts on acceptance.'), false)
})

test('the summary names each template and version', () => {
  assert.equal(sourceSummary([{ template_id: 'a', version: 1 }, { template_id: 'b', version: 2 }], { a: 'Company terms', b: 'HIMARK Growth' }), 'Company terms v1, HIMARK Growth v2')
  assert.equal(sourceSummary([], {}), null)
  assert.equal(sourceSummary([{ template_id: 'x', version: 3 }], {}), 'Terms v3')
})
