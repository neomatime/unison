import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBillingPackageView, type BillingPackageInput } from '../../features/billing/billing-package-model.ts'

const rate = (over: Record<string, unknown>) => ({
  rate_key: 'x', item_kind: 'project', package_key: null, title: 'Item', unit_price: 1000, credits: null, initiative_limit: null, rate_status: 'agreed', ...over,
}) as BillingPackageInput['rateRows'][number]

const RATES: BillingPackageInput['rateRows'] = [
  rate({ rate_key: 'retainer.growth.monthly', item_kind: 'retainer_monthly', package_key: 'growth', title: 'Growth Partner: monthly retainer', unit_price: 150000, credits: 75, initiative_limit: 4 }),
  rate({ rate_key: 'retainer.private.monthly', item_kind: 'retainer_monthly', package_key: 'private', title: 'Private Partner: monthly retainer', unit_price: 200000, credits: 120, initiative_limit: 6 }),
  rate({ rate_key: 'retainer.reserve.monthly', item_kind: 'retainer_monthly', package_key: 'reserve', title: 'HIMARK Reserve: monthly retainer', unit_price: 300000, credits: 220, initiative_limit: null }),
  rate({ rate_key: 'project.digital_presence', item_kind: 'project', package_key: 'digital_presence', title: 'Digital Presence: project', unit_price: 45000, credits: 15 }),
  rate({ rate_key: 'support.website_care', item_kind: 'support', package_key: 'digital_presence', title: 'Website Care: monthly', unit_price: 5000, credits: 2 }),
  rate({ rate_key: 'support.digital_presence_management', item_kind: 'support', package_key: 'digital_presence', title: 'Digital Presence Management: monthly', unit_price: 20000, credits: 7 }),
]

const engagement = (over: Record<string, unknown>) => ({
  id: 'e1', kind: 'retainer', package_key: 'growth', start_date: '2026-07-01', ended_on: null, replaces_id: null, root_id: 'e1', ...over,
}) as BillingPackageInput['engagements'][number]

test('a client with nothing recorded offers every retainer tier and project to choose from', () => {
  const view = buildBillingPackageView({ engagements: [], support: [], rateRows: RATES, firstInvoiceEngagementIds: [], documents: [] })
  assert.deepEqual(view.active, [])
  assert.deepEqual(view.packageOptions.retainers.map((o) => o.key), ['growth', 'private', 'reserve'])
  assert.deepEqual(view.packageOptions.projects.map((o) => o.key), ['digital_presence'])
  assert.equal(view.canBuildMonthly, false)
})

test('an active retainer shows its fee, credits, limit, usage, other tiers and whether the first invoice can still be built', () => {
  const view = buildBillingPackageView({
    engagements: [engagement({}), engagement({ id: 'p1', kind: 'project', package_key: 'digital_presence', root_id: 'p1' })],
    support: [], rateRows: RATES, firstInvoiceEngagementIds: [], documents: [],
  })
  const retainer = view.active.find((p) => p.kind === 'retainer')!
  assert.equal(retainer.name, 'Growth Partner')
  assert.equal(retainer.fee, 150000)
  assert.equal(retainer.credits, 75)
  assert.equal(retainer.initiativeLimit, 4)
  assert.equal(retainer.activeProjects, 1)
  assert.equal(retainer.canBuildFirst, true)
  assert.deepEqual(retainer.otherTiers.map((t) => t.key), ['private', 'reserve'])
  assert.equal(view.canBuildMonthly, true)
})

test('when the chain\'s first invoice exists neither the root nor the successor can build it, and a successor whose chain has none yet can', () => {
  const chain = [
    engagement({ id: 'e1', ended_on: '2026-09-30' }),
    engagement({ id: 'e2', package_key: 'private', replaces_id: 'e1', root_id: 'e1', start_date: '2026-10-01' }),
  ]
  const built = buildBillingPackageView({ engagements: chain, support: [], rateRows: RATES, firstInvoiceEngagementIds: ['e1'], documents: [] })
  assert.equal(built.active.length, 1)
  assert.equal(built.past.length, 1)
  assert.equal(built.past[0].active, false)
  for (const view of [...built.active, ...built.past]) {
    assert.equal(view.firstBuilt, true, `${view.id}: the chain's first invoice stands for every engagement of the chain`)
    assert.equal(view.canBuildFirst, false, `${view.id} cannot build the first invoice again`)
  }

  const notBuilt = buildBillingPackageView({ engagements: chain, support: [], rateRows: RATES, firstInvoiceEngagementIds: [], documents: [] })
  assert.equal(notBuilt.active[0].id, 'e2')
  assert.equal(notBuilt.active[0].firstBuilt, false)
  assert.equal(notBuilt.active[0].canBuildFirst, true, 'the first invoice of a chain can be built through the successor')
  assert.equal(notBuilt.past[0].canBuildFirst, false, 'an ended package never builds anything')
})

test('a project lists its running support and the services it can still add, and the Reserve tier shows no limit', () => {
  const view = buildBillingPackageView({
    engagements: [
      engagement({ id: 'r', package_key: 'reserve', root_id: 'r' }),
      engagement({ id: 'p1', kind: 'project', package_key: 'digital_presence', root_id: 'p1' }),
    ],
    support: [
      { id: 's1', engagement_id: 'p1', service_key: 'support.website_care', start_date: '2026-08-01', ended_on: null },
      { id: 's2', engagement_id: 'p1', service_key: 'support.digital_presence_management', start_date: '2026-07-01', ended_on: '2026-07-31' },
    ],
    rateRows: RATES, firstInvoiceEngagementIds: [], documents: [],
  })
  const project = view.active.find((p) => p.kind === 'project')!
  assert.deepEqual(project.support.filter((s) => s.active).map((s) => s.title), ['Website Care: monthly'])
  assert.deepEqual(project.availableSupport.map((s) => s.key), ['support.digital_presence_management'])
  assert.equal(view.active.find((p) => p.kind === 'retainer')!.initiativeLimit, null)
  assert.equal(view.canBuildMonthly, true)
})

test('the billing history lists documents newest first with a plain label', () => {
  const view = buildBillingPackageView({
    engagements: [], support: [], rateRows: RATES, firstInvoiceEngagementIds: [],
    documents: [
      { id: 'd1', invoice_number: 'DRAFT-1', status: 'Draft', billing_kind: 'monthly', billing_month: '2026-10-01', total_amount: 172500, currency: 'ZAR', created_at: '2026-10-05T10:00:00Z' },
      { id: 'd2', invoice_number: 'TST-I-2026-00001', status: 'Issued', billing_kind: 'first', billing_month: null, total_amount: 345000, currency: 'ZAR', created_at: '2026-09-01T10:00:00Z' },
    ],
  })
  assert.deepEqual(view.documents.map((d) => d.id), ['d1', 'd2'])
  assert.equal(view.documents[0].label, 'Monthly invoice, October 2026')
  assert.equal(view.documents[1].label, 'First invoice')
  assert.equal(view.documents[0].isDraft, true)
})
