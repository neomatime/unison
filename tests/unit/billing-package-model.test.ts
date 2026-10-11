import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBillingPackageView, packageState, type BillingPackageInput } from '../../features/billing/billing-package-model.ts'

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
  rate({ rate_key: 'retainer.growth.top_up', item_kind: 'retainer_top_up', package_key: 'growth', title: 'Growth Partner: top-up credits', unit_price: 2000, rate_status: 'proposed' }),
  rate({ rate_key: 'retainer.private.top_up', item_kind: 'retainer_top_up', package_key: 'private', title: 'Private Partner: top-up credits', unit_price: '1666.67', rate_status: 'proposed' }),
  // Agreed here (the seed has it proposed) so the model is seen to follow the row's status either way.
  rate({ rate_key: 'project.top_up', item_kind: 'project_top_up', package_key: null, title: 'Project top-up credits', unit_price: 3000, rate_status: 'agreed' }),
]
/** The South African date the query passes in. */
const TODAY = '2026-10-11'

const engagement = (over: Record<string, unknown>) => ({
  id: 'e1', kind: 'retainer', package_key: 'growth', start_date: '2026-07-01', ended_on: null, replaces_id: null, root_id: 'e1', ...over,
}) as BillingPackageInput['engagements'][number]

test('a client with nothing recorded offers every retainer tier and project to choose from', () => {
  const view = buildBillingPackageView({ today: TODAY, engagements: [], support: [], rateRows: RATES, firstInvoiceEngagementIds: [], documents: [] })
  assert.deepEqual(view.active, [])
  assert.deepEqual(view.packageOptions.retainers.map((o) => o.key), ['growth', 'private', 'reserve'])
  assert.deepEqual(view.packageOptions.projects.map((o) => o.key), ['digital_presence'])
  assert.equal(view.canBuildMonthly, false)
})

test('an active retainer shows its fee, credits, limit, usage, other tiers and whether the first invoice can still be built', () => {
  const view = buildBillingPackageView({ today: TODAY,
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
  const built = buildBillingPackageView({ today: TODAY, engagements: chain, support: [], rateRows: RATES, firstInvoiceEngagementIds: ['e1'], documents: [] })
  assert.equal(built.active.length, 1)
  assert.equal(built.past.length, 1)
  assert.equal(built.past[0].active, false)
  for (const view of [...built.active, ...built.past]) {
    assert.equal(view.firstBuilt, true, `${view.id}: the chain's first invoice stands for every engagement of the chain`)
    assert.equal(view.canBuildFirst, false, `${view.id} cannot build the first invoice again`)
  }

  const notBuilt = buildBillingPackageView({ today: TODAY, engagements: chain, support: [], rateRows: RATES, firstInvoiceEngagementIds: [], documents: [] })
  assert.equal(notBuilt.active[0].id, 'e2')
  assert.equal(notBuilt.active[0].firstBuilt, false)
  assert.equal(notBuilt.active[0].canBuildFirst, true, 'the first invoice of a chain can be built through the successor')
  assert.equal(notBuilt.past[0].canBuildFirst, false, 'an ended package never builds anything')
})

test('a project lists its running support and the services it can still add, and the Reserve tier shows no limit', () => {
  const view = buildBillingPackageView({ today: TODAY,
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
  const view = buildBillingPackageView({ today: TODAY,
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

test('the state of a package follows the South African today the query passes, the way the database decides it', () => {
  assert.equal(packageState({ start_date: '2026-10-11', ended_on: null }, TODAY), 'in_force', 'starts today')
  assert.equal(packageState({ start_date: '2026-10-12', ended_on: null }, TODAY), 'scheduled', 'starts tomorrow')
  assert.equal(packageState({ start_date: '2026-07-01', ended_on: '2026-10-11' }, TODAY), 'in_force', 'ends today: still in force today')
  assert.equal(packageState({ start_date: '2026-07-01', ended_on: '2026-10-20' }, TODAY), 'in_force', 'a future end date (a scheduled tier change)')
  assert.equal(packageState({ start_date: '2026-07-01', ended_on: '2026-10-10' }, TODAY), 'ended', 'ended yesterday')
})

test('a scheduled tier change: the retainer in force keeps Top-up but not Change tier, the successor is scheduled with no buttons', () => {
  const view = buildBillingPackageView({
    today: TODAY,
    engagements: [
      engagement({ id: 'e1', ended_on: '2026-10-19' }),
      engagement({ id: 'e2', package_key: 'private', replaces_id: 'e1', root_id: 'e1', start_date: '2026-10-20' }),
    ],
    support: [], rateRows: RATES, firstInvoiceEngagementIds: [], documents: [],
  })
  assert.deepEqual(view.active.map((p) => p.id), ['e1', 'e2'], 'both are listed: neither has ended')
  assert.deepEqual(view.past, [])
  const [current, next] = view.active
  assert.equal(current.state, 'in_force')
  assert.equal(current.active, true)
  assert.equal(current.canBuildFirst, true, 'the chain has no first invoice yet; it is built at the root\'s tier')
  assert.equal(current.canTopUp, true)
  assert.equal(current.canChangeTier, false, 'the database refuses a second change while one is scheduled')
  assert.equal(current.canEnd, false, 'the database refuses to end a retainer that already has an end date')
  assert.equal(current.topUpRate, 2000, 'the Growth rate, the tier in force today')
  assert.equal(current.topUpProposed, true)

  assert.equal(next.state, 'scheduled')
  assert.equal(next.active, true)
  for (const flag of ['canBuildFirst', 'canTopUp', 'canChangeTier'] as const) assert.equal(next[flag], false, `a scheduled successor has no ${flag}`)
  assert.equal(next.topUpRate, 1666.67)
  assert.equal(view.canBuildMonthly, true)
})

test('after a past-dated change the successor is in force and builds the chain\'s first invoice while the chain has none', () => {
  const chain = [
    engagement({ id: 'e1', ended_on: '2026-10-04' }),
    engagement({ id: 'e2', package_key: 'private', replaces_id: 'e1', root_id: 'e1', start_date: '2026-10-05' }),
  ]
  const view = buildBillingPackageView({ today: TODAY, engagements: chain, support: [], rateRows: RATES, firstInvoiceEngagementIds: [], documents: [] })
  assert.deepEqual(view.active.map((p) => p.id), ['e2'])
  assert.deepEqual(view.past.map((p) => p.id), ['e1'])
  const successor = view.active[0]
  assert.equal(successor.state, 'in_force')
  assert.equal(successor.canBuildFirst, true)
  assert.equal(successor.canTopUp, true)
  assert.equal(successor.canChangeTier, true)
  assert.equal(successor.canEnd, true)
  const ended = view.past[0]
  assert.equal(ended.state, 'ended')
  assert.equal(ended.active, false)
  for (const flag of ['canBuildFirst', 'canTopUp', 'canChangeTier', 'canEnd', 'canManageSupport'] as const) assert.equal(ended[flag], false, `an ended package has no ${flag}`)
})

test('an ended project goes to the earlier packages, is not counted, and offers no support; a scheduled project offers none either', () => {
  const view = buildBillingPackageView({
    today: TODAY,
    engagements: [
      engagement({}),
      engagement({ id: 'p1', kind: 'project', package_key: 'digital_presence', root_id: 'p1', start_date: '2026-08-01', ended_on: '2026-09-30' }),
      engagement({ id: 'p2', kind: 'project', package_key: 'digital_presence', root_id: 'p2', start_date: '2026-11-01' }),
    ],
    support: [], rateRows: RATES, firstInvoiceEngagementIds: [], documents: [],
  })
  assert.deepEqual(view.past.map((p) => p.id), ['p1'])
  const scheduled = view.active.find((p) => p.id === 'p2')!
  assert.equal(scheduled.state, 'scheduled')
  assert.equal(scheduled.canManageSupport, false)
  assert.deepEqual(scheduled.availableSupport, [])
  assert.equal(scheduled.canTopUp, false)
  assert.equal(scheduled.topUpRate, 3000, 'a project uses the project top-up rate')
  assert.equal(scheduled.topUpProposed, false, 'the model follows the row: this one is agreed')
  // The database counts a project while it has no end date, so the scheduled one counts and the ended one does not.
  assert.equal(view.active.find((p) => p.kind === 'retainer')!.activeProjects, 1)
})

test('a support-only client can build the monthly invoice, and a client whose packages have all ended cannot', () => {
  const supportOnly = buildBillingPackageView({
    today: TODAY,
    engagements: [engagement({ id: 'p1', kind: 'project', package_key: 'digital_presence', root_id: 'p1' })],
    support: [{ id: 's1', engagement_id: 'p1', service_key: 'support.website_care', start_date: '2026-08-01', ended_on: null }],
    rateRows: RATES, firstInvoiceEngagementIds: [], documents: [],
  })
  assert.equal(supportOnly.canBuildMonthly, true)
  assert.equal(supportOnly.active[0].canManageSupport, true)
  const allEnded = buildBillingPackageView({
    today: TODAY,
    engagements: [engagement({ ended_on: '2026-09-30' })],
    support: [], rateRows: RATES, firstInvoiceEngagementIds: [], documents: [],
  })
  assert.equal(allEnded.canBuildMonthly, false)
})
