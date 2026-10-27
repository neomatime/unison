import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { collectNameIds, emptyNameMaps, mapPhaseSixRow } from '../../features/commercial-finance/phase-six-mappers.ts'

const ID_A = '3b241101-e2bb-4255-8caf-4136c566a962'
const ID_B = '4c352212-f3cc-4366-9dbf-5247d677b073'

test('a draft quote or invoice is named for its client, not by its generated reference', () => {
  const names = emptyNameMaps()
  assert.equal(mapPhaseSixRow('quote', { id: 'q', quote_number: 'DRAFT-1a2b3c4d', client_name: 'Acme', status: 'Draft', updated_at: 'x', archived_at: null }, names).name, 'Draft quote · Acme')
  assert.equal(mapPhaseSixRow('invoice', { id: 'i', invoice_number: 'TST-I-2026-00001', client_name: 'Acme', status: 'Issued', updated_at: 'x', archived_at: null }, names).name, 'TST-I-2026-00001')
  assert.equal(mapPhaseSixRow('invoice', { id: 'i', invoice_number: 'DRAFT-1a2b3c4d', client_name: null, status: 'Draft', updated_at: 'x', archived_at: null }, names).name, 'Draft invoice')
})

test('names are looked up from the maps, with the old fallbacks', () => {
  const names = emptyNameMaps()
  names.members.set(ID_A, 'Sam Member')
  names.projects.set(ID_B, 'Project X')
  const invoice = mapPhaseSixRow('invoice', { id: 'i', invoice_number: 'N-1', client_name: 'c', owner_id: ID_A, project_id: ID_B, quote_id: null, opportunity_id: null, status: 'Issued', updated_at: 'x', archived_at: null }, names)
  assert.equal(invoice.owner, 'Sam Member')
  assert.equal(invoice.project, 'Project X')
  assert.equal(invoice.quote, '—')
  const unassigned = mapPhaseSixRow('invoice', { id: 'i', invoice_number: 'N-1', client_name: 'c', owner_id: null, status: 'Issued', updated_at: 'x', archived_at: null }, names)
  assert.equal(unassigned.owner, 'Unassigned')
})

test('the Sales status is the stage, and an expense shows its vendor name when the vendor is not in the map', () => {
  const names = emptyNameMaps()
  assert.equal(mapPhaseSixRow('opportunity', { id: 'o', name: 'Deal', stage: 'Proposal', updated_at: 'x', archived_at: null }, names).status, 'Proposal')
  const expense = mapPhaseSixRow('expense', { id: 'e', description: 'Flight', vendor_id: ID_A, vendor_name: 'Typed Air', status: 'Draft', updated_at: 'x', archived_at: null }, names)
  assert.equal(expense.vendor, 'Typed Air')
  assert.equal(expense.name, 'Flight')
})

test('the ids to look up are collected per kind, once each, and only real ids', () => {
  const ids = collectNameIds('invoice', [
    { owner_id: ID_A, project_id: ID_B, quote_id: null, opportunity_id: undefined },
    { owner_id: ID_A, project_id: 'not-a-uuid', quote_id: ID_B, opportunity_id: ID_B },
  ])
  assert.deepEqual(ids.members, [ID_A])
  assert.deepEqual([...ids.projects], [ID_B])
  assert.deepEqual(ids.quotes, [ID_B])
  assert.deepEqual(ids.opportunities, [ID_B])
  assert.deepEqual(ids.leads, [])
  assert.deepEqual(collectNameIds('expense', [{ submitted_by: ID_A, approved_by: ID_B, vendor_id: ID_A, project_id: null, client_id: ID_B }]).members.sort(), [ID_A, ID_B].sort())
  assert.deepEqual(collectNameIds('lead', []).members, [])
})

test('an invoice carries the billing plan item it follows, or null when it follows none', () => {
  const names = emptyNameMaps()
  const base = { id: 'i', invoice_number: 'DRAFT-1a2b3c4d', client_name: 'Acme', status: 'Draft', updated_at: 'x', archived_at: null }
  assert.equal(mapPhaseSixRow('invoice', { ...base, billing_plan_item_id: ID_A }, names).billingPlanItemId, ID_A)
  assert.equal(mapPhaseSixRow('invoice', { ...base, billing_plan_item_id: null }, names).billingPlanItemId, null)
  assert.equal(mapPhaseSixRow('invoice', base, names).billingPlanItemId, null, 'a row with no such column reads as not linked')
})

test('the mapper file is pure: no leftover placeholder and no server-only import', () => {
  const source = readFileSync(join(process.cwd(), 'features', 'commercial-finance', 'phase-six-mappers.ts'), 'utf8').replace(/\r\n/g, '\n')
  assert.doesNotMatch(source, /\/\* MOVE/)
  assert.doesNotMatch(source, /import\s+['"]server-only['"]/)
})
