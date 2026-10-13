import assert from 'node:assert/strict'
import test from 'node:test'

import { offeringFromToken, planFill, sourceSummary, targetsForDocument } from '../../features/terms/document-terms.ts'
import type { ResolvedTerms } from '../../features/terms/resolve-terms.ts'

const resolved = (over: Partial<ResolvedTerms> = {}): ResolvedTerms => ({
  lines: ['Payment is due in 30 days.', 'Work starts on acceptance.'],
  inclusions: ['Engagement lead'],
  sources: [{ layer: 'company', templateId: 't1', versionId: 'v1', version: 1 }],
  missing: [],
  skipped: [],
  ...over,
})

test('a stored offering token names its offering; anything malformed names none', () => {
  assert.deepEqual(offeringFromToken('retainer.growth'), { kind: 'retainer', key: 'growth' })
  assert.deepEqual(offeringFromToken('project.digital_presence'), { kind: 'project', key: 'digital_presence' })
  assert.deepEqual(offeringFromToken('support.website_care'), { kind: 'support', key: 'website_care' })
  assert.equal(offeringFromToken('retainer.growth.monthly'), null)
  assert.equal(offeringFromToken('credit.thing'), null)
  assert.equal(offeringFromToken('retainer.Bad Key'), null)
  assert.equal(offeringFromToken(''), null)
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

test('a fill writes plain lines, inclusions and camelCase sources', () => {
  const plan = planFill({ resolved: resolved(), existingTerms: null })
  assert.equal(plan.ok, true)
  if (!plan.ok) return
  assert.equal(plan.terms, 'Payment is due in 30 days.\nWork starts on acceptance.')
  assert.equal(plan.inclusions, 'Engagement lead')
  assert.deepEqual(plan.sources, [{ layer: 'company', templateId: 't1', versionId: 'v1', version: 1 }])
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
  assert.equal(sourceSummary([{ templateId: 'a', version: 1 }, { templateId: 'b', version: 2 }], { a: 'Company terms', b: 'HIMARK Growth' }), 'Company terms v1, HIMARK Growth v2')
  assert.equal(sourceSummary([], {}), null)
  assert.equal(sourceSummary(null, {}), null)
  assert.equal(sourceSummary([{ templateId: 'x', version: 3 }], {}), 'Terms v3')
})
