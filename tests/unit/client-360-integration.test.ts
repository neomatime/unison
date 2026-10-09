import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8')
const migration = read('supabase', 'migrations', '20261009130000_client_relationship_intelligence.sql')
const query = read('features', 'clients', 'queries', 'get-client-360.ts')
const workspace = read('features', 'clients', 'components', 'client-relationship-workspace.tsx')
const dashboardQuery = read('features', 'crm-overview', 'queries', 'get-relationship-overview.ts')

test('client relationship persistence is tenant-scoped and protected by RLS', () => {
  for (const table of ['client_contacts', 'client_interactions', 'client_milestones', 'client_recommendation_dismissals']) {
    assert.match(migration, new RegExp(`create table public\\.${table}`))
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  }
  assert.match(migration, /public\.is_member_of\(organization_id\)/)
  assert.match(migration, /confidentiality = 'Internal'[\s\S]*created_by = auth\.uid\(\)[\s\S]*public\.has_role/)
  assert.match(migration, /references public\.clients\(id, organization_id\)/)
  assert.match(migration, /record_audit_event\(\)/)
  assert.match(migration, /revoke all on public\.client_contacts[\s\S]*from anon/)
})

test('Client 360 uses authoritative linked records and no sample relationship data', () => {
  for (const table of ['client_contacts', 'client_interactions', 'client_milestones', 'client_onboardings', 'tasks', 'calendar_events', 'sales_opportunities', 'quotes', 'invoices', 'documents']) {
    assert.match(query, new RegExp(`from\\('${table}'\\)`))
  }
  assert.match(query, /\.eq\('organization_id', org\)/)
  assert.match(query, /linked_record_type', 'clients'/)
  assert.doesNotMatch(workspace, /Lerato Molefe|Mandla Khumalo|Brand Platform Rollout|Growth Partner Renewal/)
  assert.match(workspace, /Relationship insight/)
  assert.match(workspace, /Next best actions/)
})

test('personalised dashboard batches assigned-client relationship reads', () => {
  assert.match(dashboardQuery, /\.eq\('owner_id', userId\)/)
  assert.match(dashboardQuery, /\.in\('client_id', ids\)/)
  assert.match(dashboardQuery, /Promise\.all\(/)
  assert.match(dashboardQuery, /assessRelationship\(/)
  assert.match(dashboardQuery, /recommendationKey\('quote-follow-up'/)
  assert.doesNotMatch(dashboardQuery, /Math\.random|mock|fixture/i)
})
