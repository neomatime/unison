import assert from 'node:assert/strict'
import test from 'node:test'

import { groupTemplates, templateStatus, type TemplateSummary } from '../../features/terms/grouping.ts'

const row = (over: Partial<TemplateSummary> & Pick<TemplateSummary, 'targetKind' | 'title'>): TemplateSummary => ({
  id: over.title, targetKey: over.targetKind === 'company' ? null : 'k', appliesTo: 'quote', current: null, upcoming: null, hasDraft: false, ...over,
})

test('templates are grouped Company, Strategic Partnerships, Projects, then the three support groups', () => {
  const groups = groupTemplates([
    row({ targetKind: 'support', targetKey: 'podcast_content', title: 'Podcast Content' }),
    row({ targetKind: 'project', title: 'Digital Presence' }),
    row({ targetKind: 'retainer', title: 'Growth Partner' }),
    row({ targetKind: 'company', title: 'Company terms: quotes' }),
    row({ targetKind: 'support', targetKey: 'website_care', title: 'Website Care' }),
    row({ targetKind: 'support', targetKey: 'digital_presence_management', title: 'Digital Presence Management' }),
  ])
  assert.deepEqual(groups.map((group) => group.label), ['Company', 'Strategic Partnerships', 'Projects', 'Project Care', 'Managed Services', 'Recurring Content'])
  assert.deepEqual(groups.find((group) => group.label === 'Project Care')!.rows.map((entry) => entry.title), ['Website Care'])
})

test('an empty group is left out and an unknown support service goes under Other services', () => {
  const groups = groupTemplates([row({ targetKind: 'support', targetKey: 'brand_new_service', title: 'Brand New' })])
  assert.deepEqual(groups.map((group) => group.label), ['Other services'])
})

test('rows keep their order inside a group, sorted by title', () => {
  const groups = groupTemplates([row({ targetKind: 'project', title: 'B' }), row({ targetKind: 'project', title: 'A' })])
  assert.deepEqual(groups[0].rows.map((entry) => entry.title), ['A', 'B'])
})

test('the status says which version is in force, which is coming, or that there are none', () => {
  assert.deepEqual(templateStatus(row({ targetKind: 'project', title: 'x', current: { version: 2, effectiveFrom: '2026-10-12' } })), { kind: 'current', version: 2, effectiveFrom: '2026-10-12' })
  assert.deepEqual(templateStatus(row({ targetKind: 'project', title: 'x', upcoming: { version: 3, effectiveFrom: '2027-01-01' } })), { kind: 'upcoming', version: 3, effectiveFrom: '2027-01-01' })
  assert.deepEqual(templateStatus(row({ targetKind: 'project', title: 'x' })), { kind: 'none' })
  const both = templateStatus(row({ targetKind: 'project', title: 'x', current: { version: 1, effectiveFrom: '2026-01-01' }, upcoming: { version: 2, effectiveFrom: '2027-01-01' } }))
  assert.equal(both.kind, 'current', 'a current version wins over an upcoming one')
  assert.deepEqual(both, { kind: 'current', version: 1, effectiveFrom: '2026-01-01', upcoming: { version: 2, effectiveFrom: '2027-01-01' } }, 'the pending version is still reported')
})
