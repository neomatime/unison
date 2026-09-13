import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let projectId: string
let siblingProjectId: string
let outsiderProjectId: string
let requirementId: string
let siblingRequirementId: string
let deliveryItemId: string
let siblingDeliveryItemId: string
let outsiderDeliveryItemId: string
let evidenceId: string
let siblingEvidenceId: string
let outsiderEvidenceId: string

before(async () => {
  orgId = await createFixtureOrg('traceability')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('traceability-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const framework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'TRC Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (framework.error) throw framework.error
  const frameworkId = framework.data.id

  const project = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'TRC Project', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (project.error) throw project.error
  projectId = project.data.id

  const sibling = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'TRC Sibling Project', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (sibling.error) throw sibling.error
  siblingProjectId = sibling.data.id

  const outsiderFramework = await admin.from('frameworks')
    .insert({ organization_id: outsiderOrg, name: 'TRC Outsider Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (outsiderFramework.error) throw outsiderFramework.error

  const outsiderProject = await admin.from('projects')
    .insert({ organization_id: outsiderOrg, name: 'TRC Outsider Project', status: 'Active', health: 'On Track', framework_id: outsiderFramework.data.id })
    .select('id').single()
  if (outsiderProject.error) throw outsiderProject.error
  outsiderProjectId = outsiderProject.data.id

  const requirement = await admin.from('requirements')
    .insert({ organization_id: orgId, project_id: projectId, title: 'TRC Requirement' })
    .select('id').single()
  if (requirement.error) throw requirement.error
  requirementId = requirement.data.id

  const siblingRequirement = await admin.from('requirements')
    .insert({ organization_id: orgId, project_id: siblingProjectId, title: 'TRC Sibling Requirement' })
    .select('id').single()
  if (siblingRequirement.error) throw siblingRequirement.error
  siblingRequirementId = siblingRequirement.data.id

  const deliveryItem = await admin.from('delivery_items')
    .insert({ organization_id: orgId, project_id: projectId, framework_id: frameworkId, level: 1, name: 'TRC Delivery Item' })
    .select('id').single()
  if (deliveryItem.error) throw deliveryItem.error
  deliveryItemId = deliveryItem.data.id

  const siblingDeliveryItem = await admin.from('delivery_items')
    .insert({ organization_id: orgId, project_id: siblingProjectId, framework_id: frameworkId, level: 1, name: 'TRC Sibling Delivery Item' })
    .select('id').single()
  if (siblingDeliveryItem.error) throw siblingDeliveryItem.error
  siblingDeliveryItemId = siblingDeliveryItem.data.id

  const outsiderDeliveryItem = await admin.from('delivery_items')
    .insert({ organization_id: outsiderOrg, project_id: outsiderProjectId, framework_id: outsiderFramework.data.id, level: 1, name: 'TRC Outsider Delivery Item' })
    .select('id').single()
  if (outsiderDeliveryItem.error) throw outsiderDeliveryItem.error
  outsiderDeliveryItemId = outsiderDeliveryItem.data.id

  const evidence = await admin.from('governance_artefacts')
    .insert({ organization_id: orgId, project_id: projectId, name: 'TRC Evidence', external_url: 'https://example.com/trc-evidence' })
    .select('id').single()
  if (evidence.error) throw evidence.error
  evidenceId = evidence.data.id

  const siblingEvidence = await admin.from('governance_artefacts')
    .insert({ organization_id: orgId, project_id: siblingProjectId, name: 'TRC Sibling Evidence', external_url: 'https://example.com/trc-sibling-evidence' })
    .select('id').single()
  if (siblingEvidence.error) throw siblingEvidence.error
  siblingEvidenceId = siblingEvidence.data.id

  const outsiderEvidence = await admin.from('governance_artefacts')
    .insert({ organization_id: outsiderOrg, project_id: outsiderProjectId, name: 'TRC Outsider Evidence', external_url: 'https://example.com/trc-outsider-evidence' })
    .select('id').single()
  if (outsiderEvidence.error) throw outsiderEvidence.error
  outsiderEvidenceId = outsiderEvidence.data.id
})

after(async () => { await cleanup([orgId, outsiderOrg], [member.id, outsider.id]) })

function deliveryLink(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, project_id: projectId, requirement_id: requirementId, delivery_item_id: deliveryItemId, ...over }
}
function evidenceLink(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, project_id: projectId, requirement_id: requirementId, evidence_id: evidenceId, ...over }
}

test('a valid delivery item link is accepted', async () => {
  const { data, error } = await admin.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.equal(error, null)
  await admin.from('requirement_delivery_items').delete().eq('id', data!.id)
})

test('a delivery item from a different project is refused', async () => {
  const { error } = await admin.from('requirement_delivery_items')
    .insert(deliveryLink({ delivery_item_id: siblingDeliveryItemId })).select('id').single()

  assert.ok(error, "a delivery item outside the link's project must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirement_delivery_items_delivery_item_fkey/)
})

test('a requirement from a different project is refused', async () => {
  const { error } = await admin.from('requirement_delivery_items')
    .insert(deliveryLink({ requirement_id: siblingRequirementId })).select('id').single()

  assert.ok(error, "a requirement outside the link's project must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirement_delivery_items_requirement_fkey/)
})

test('a cross-tenant delivery item is unrepresentable', async () => {
  const { error } = await admin.from('requirement_delivery_items')
    .insert(deliveryLink({ delivery_item_id: outsiderDeliveryItemId })).select('id').single()

  assert.ok(error, 'a delivery item from another organisation must be refused')
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirement_delivery_items_delivery_item_fkey/)
})

test('a duplicate delivery item link is refused', async () => {
  const first = await admin.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.equal(first.error, null)

  const { error } = await admin.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.ok(error, 'a duplicate link must be refused')
  assert.equal(error!.code, '23505')

  await admin.from('requirement_delivery_items').delete().eq('id', first.data!.id)
})

test('deleting the requirement removes its delivery item links', async () => {
  const requirement = await admin.from('requirements')
    .insert({ organization_id: orgId, project_id: projectId, title: 'TRC Disposable Requirement' })
    .select('id').single()
  assert.equal(requirement.error, null)

  const link = await admin.from('requirement_delivery_items')
    .insert(deliveryLink({ requirement_id: requirement.data!.id })).select('id').single()
  assert.equal(link.error, null)

  await admin.from('requirements').delete().eq('id', requirement.data!.id)

  const after = await admin.from('requirement_delivery_items').select('id').eq('id', link.data!.id)
  assert.deepEqual(after.data, [], 'the link must not survive its requirement')
})

test('an outsider can neither read, write nor delete delivery item links', async () => {
  const seeded = await admin.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.equal(seeded.error, null)

  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('requirement_delivery_items').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [], "another organisation's links must not be visible")

  const write = await client.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.ok(write.error, 'an outsider must not be able to write')
  assert.equal(write.error!.code, '42501')

  const remove = await client.from('requirement_delivery_items').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null)
  assert.deepEqual(remove.data, [], "an outsider's delete must match no rows")

  await admin.from('requirement_delivery_items').delete().eq('id', seeded.data!.id)
})

test('a member of the organisation can link and unlink a delivery item', async () => {
  const client = await signedInClient(member.email, member.password)

  const created = await client.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('requirement_delivery_items').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const removed = await client.from('requirement_delivery_items').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)

  const after = await client.from('requirement_delivery_items').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [], 'the unlinked row must be gone')
})

test('a valid evidence link is accepted', async () => {
  const { data, error } = await admin.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.equal(error, null)
  await admin.from('requirement_evidence').delete().eq('id', data!.id)
})

test('evidence from a different project is refused', async () => {
  const { error } = await admin.from('requirement_evidence')
    .insert(evidenceLink({ evidence_id: siblingEvidenceId })).select('id').single()

  assert.ok(error, "evidence outside the link's project must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirement_evidence_evidence_fkey/)
})

test('a cross-tenant evidence link is unrepresentable', async () => {
  const { error } = await admin.from('requirement_evidence')
    .insert(evidenceLink({ evidence_id: outsiderEvidenceId })).select('id').single()

  assert.ok(error, 'evidence from another organisation must be refused')
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirement_evidence_evidence_fkey/)
})

test('a duplicate evidence link is refused', async () => {
  const first = await admin.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.equal(first.error, null)

  const { error } = await admin.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.ok(error, 'a duplicate link must be refused')
  assert.equal(error!.code, '23505')

  await admin.from('requirement_evidence').delete().eq('id', first.data!.id)
})

test('deleting the evidence removes its requirement link', async () => {
  const evidence = await admin.from('governance_artefacts')
    .insert({ organization_id: orgId, project_id: projectId, name: 'TRC Disposable Evidence', external_url: 'https://example.com/trc-disposable' })
    .select('id').single()
  assert.equal(evidence.error, null)

  const link = await admin.from('requirement_evidence')
    .insert(evidenceLink({ evidence_id: evidence.data!.id })).select('id').single()
  assert.equal(link.error, null)

  await admin.from('governance_artefacts').delete().eq('id', evidence.data!.id)

  const after = await admin.from('requirement_evidence').select('id').eq('id', link.data!.id)
  assert.deepEqual(after.data, [], 'the link must not survive its evidence')
})

test('an outsider can neither read, write nor delete evidence links', async () => {
  const seeded = await admin.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.equal(seeded.error, null)

  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('requirement_evidence').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [], "another organisation's links must not be visible")

  const write = await client.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.ok(write.error, 'an outsider must not be able to write')
  assert.equal(write.error!.code, '42501')

  const remove = await client.from('requirement_evidence').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null)
  assert.deepEqual(remove.data, [], "an outsider's delete must match no rows")

  await admin.from('requirement_evidence').delete().eq('id', seeded.data!.id)
})

test('a member of the organisation can link and unlink evidence', async () => {
  const client = await signedInClient(member.email, member.password)

  const created = await client.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('requirement_evidence').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const removed = await client.from('requirement_evidence').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)

  const after = await client.from('requirement_evidence').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [], 'the unlinked row must be gone')
})
