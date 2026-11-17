import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { RIGHT_MODULES, can, cleanOverrides, cleanRestrictions, cleanScopes, describeChanges, effectiveGrid, escalations, mayEditRights, roleAllows, sensitiveChanges } from '../../features/rights/model.ts'
import { EXPORT_MODULES, NAV_MODULES, PHASE_SIX_MODULES, REGISTER_MODULES } from '../../features/rights/modules.ts'

test('role defaults: an Owner and an Admin can do everything; a Member views, creates, edits and exports, never deletes, approves or reaches settings', () => {
  for (const module of RIGHT_MODULES) for (const action of module.actions) {
    assert.equal(can({ role: 'owner' }, module.id, action), true)
    assert.equal(can({ role: 'admin' }, module.id, action), true)
  }
  assert.equal(can({ role: 'member' }, 'leads', 'create'), true)
  assert.equal(can({ role: 'member' }, 'leads', 'export'), true)
  assert.equal(can({ role: 'member' }, 'leads', 'delete'), false)
  assert.equal(can({ role: 'member' }, 'quotes', 'approve'), false)
  assert.equal(can({ role: 'member' }, 'settings', 'view'), false)
  assert.equal(can({ role: 'nobody' }, 'leads', 'view'), false)
  assert.equal(can({ role: 'owner' }, 'not-a-module', 'view'), false)
  assert.equal(can({ role: 'member' }, 'overview', 'delete'), false, 'an action the area does not have is never allowed')
})

test('overrides change the role defaults; creating or editing needs View', () => {
  assert.equal(can({ role: 'member', overrides: { leads: { delete: true } } }, 'leads', 'delete'), true)
  assert.equal(can({ role: 'admin', overrides: { invoices: { export: false } } }, 'invoices', 'export'), false)
  assert.equal(can({ role: 'member', overrides: { leads: { view: false } } }, 'leads', 'edit'), false, 'no View, so no Edit even though the role allows it')
  assert.equal(can({ role: 'member', overrides: { leads: { view: false, edit: true } } }, 'leads', 'edit'), false)
})

test('restrictions always deny, and never an Owner', () => {
  assert.equal(can({ role: 'admin', restrictions: ['financial'] }, 'invoices', 'view'), false)
  assert.equal(can({ role: 'admin', restrictions: ['financial'], overrides: { invoices: { view: true } } }, 'invoices', 'view'), false, 'an override cannot lift a restriction')
  assert.equal(can({ role: 'admin', restrictions: ['financial'] }, 'leads', 'view'), true)
  assert.equal(can({ role: 'admin', restrictions: ['admin'] }, 'settings', 'edit'), false)
  assert.equal(can({ role: 'admin', restrictions: ['admin'] }, 'settings', 'view'), true)
  assert.equal(can({ role: 'owner', restrictions: ['financial', 'admin'] }, 'invoices', 'delete'), true)
})

test('only what differs from the role is saved, and nothing unknown is kept', () => {
  assert.deepEqual(cleanOverrides('member', { leads: { create: true, delete: true }, junk: { view: true }, quotes: { nope: true } as never }), { leads: { delete: true } })
  assert.deepEqual(cleanScopes({ leads: 'own', overview: 'own', clients: 'all', quotes: 'bogus' }), { leads: 'own' })
  assert.deepEqual(cleanRestrictions(['financial', 'x', 'admin']), ['financial', 'admin'])
  assert.deepEqual(cleanRestrictions('financial'), [])
  const grid = effectiveGrid({ role: 'member' })
  assert.equal(grid.leads.delete, false)
  assert.equal(grid.overview.create, null)
})

test('who may change whose rights: nobody changes their own, Owners are fixed, an Admin changes Members only', () => {
  assert.equal(mayEditRights('owner', 'a', 'member', 'b'), true)
  assert.equal(mayEditRights('owner', 'a', 'admin', 'b'), true)
  assert.equal(mayEditRights('owner', 'a', 'owner', 'b'), false)
  assert.equal(mayEditRights('owner', 'a', 'member', 'a'), false)
  assert.equal(mayEditRights('admin', 'a', 'member', 'b'), true)
  assert.equal(mayEditRights('admin', 'a', 'admin', 'b'), false)
  assert.equal(mayEditRights('member', 'a', 'member', 'b'), false)
  assert.equal(mayEditRights('admin', 'a', 'member', null), true, 'someone who has not signed in yet')
})

test('no privilege escalation: you cannot grant what you do not hold', () => {
  const restrictedAdmin = { role: 'admin', restrictions: ['financial'] }
  assert.deepEqual(escalations(restrictedAdmin, {}, { invoices: { approve: true } }, 'member'), ['Invoices: approve'])
  assert.deepEqual(escalations({ role: 'admin' }, {}, { invoices: { approve: true } }, 'member'), [])
})

test('sensitive changes and the history text are readable', () => {
  const none = { overrides: {}, scopes: {}, restrictions: [] as string[] }
  assert.deepEqual(sensitiveChanges('member', none, { overrides: { leads: { delete: true } }, restrictions: [] }), ['Allow delete in Leads'])
  assert.deepEqual(sensitiveChanges('member', { overrides: {}, restrictions: ['financial'] }, { overrides: {}, restrictions: [] }), ['Remove the “Financial records” restriction'])
  const changes = describeChanges('member', none, { overrides: { leads: { delete: true } }, scopes: { leads: 'own' }, restrictions: ['financial'] })
  assert.deepEqual(changes.map((c) => c.label), ['Leads: delete', 'Leads: data access', 'Restriction: Financial records'])
  assert.equal(roleAllows('member', 'leads', 'delete'), false)
})

test('the database rule is in the migration, the history is append-only, and rights are enforced on the server', () => {
  const sql = readFileSync('supabase/migrations/20261118100000_user_rights.sql', 'utf8')
  assert.match(sql, /function public\.rights_value/)
  assert.match(sql, /function public\.has_right/)
  assert.match(sql, /function public\.rights_editable/)
  assert.match(sql, /grant select, insert on public\.rights_audit/)
  assert.doesNotMatch(sql, /grant [^;]*(update|delete)[^;]* on public\.rights_audit/)
  assert.match(sql, /user_rights_one_subject/)
  const guarded: Array<[string, RegExp]> = [
    ['features/registers/actions/archive.ts', /rightDenied\(REGISTER_MODULES\[kind\], 'edit'\)/],
    ['features/commercial-finance/actions/phase-six.ts', /rightDenied\(PHASE_SIX_MODULES\[kind\]/],
    ['features/clients/actions/create-client.ts', /rightDenied\('clients', 'create'\)/],
    ['features/clients/actions/update-client.ts', /rightDenied\('clients', 'edit'\)/],
    ['features/clients/actions/archive-client.ts', /rightDenied\('clients', 'edit'\)/],
    ['features/crm-workspace/actions/opportunity-stage.ts', /rightDenied\('sales', 'edit'\)/],
    ['features/crm-workspace/actions/sales-board.ts', /rightDenied\('sales', 'edit'\)/],
    ['features/documents/actions/billing-plan.ts', /rightDenied\('invoices', 'approve'\)/],
    ['app/api/records/export/route.ts', /myRight\(exportModule, "export"\)/],
    ['features/registers/components/register-screen.tsx', /requireViewOrRedirect\(REGISTER_MODULES\[kind\]\)/],
    ['app/(unison)/settings/(tabs)/layout.tsx', /requireViewOrRedirect\('settings'\)/],
    ['app/(unison)/layout.tsx', /myRight\(area, 'view'\)/],
  ]
  for (const [path, pattern] of guarded) assert.match(readFileSync(path, 'utf8'), pattern, `${path} must check the right`)
  assert.deepEqual(Object.values(REGISTER_MODULES).sort(), ['expenses', 'invoices', 'leads', 'quotes', 'sales'])
  assert.equal(PHASE_SIX_MODULES.forecast, 'forecasting')
  assert.equal(NAV_MODULES.forecast, 'forecasting')
  assert.equal(EXPORT_MODULES['sales-opportunities'], 'sales')
  for (const area of [...Object.values(NAV_MODULES), ...Object.values(EXPORT_MODULES)]) assert.ok(RIGHT_MODULES.some((m) => m.id === area), `${area} is a known area`)
})

test('the actions check who is changing whose rights and write every change to the history', () => {
  const actions = readFileSync('features/rights/actions.ts', 'utf8')
  assert.match(actions, /mayEditRights/)
  assert.match(actions, /escalations/)
  assert.match(actions, /from\('rights_audit'\)\.insert/)
  assert.match(actions, /resolveTarget/)
  const page = readFileSync('app/(unison)/settings/(tabs)/access/page.tsx', 'utf8')
  assert.match(page, /canManage \? await listRightsData\(\)/)
})
