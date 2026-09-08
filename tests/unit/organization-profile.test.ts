import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { roleHasPermission } from '../../config/roles.ts'
import { organizationProfileInputSchema } from '../../features/organizations/schemas/organization-profile.ts'

const route = readFileSync('app/(unison)/settings/page.tsx', 'utf8')
const query = readFileSync('features/organizations/queries/get-organization-profile.ts', 'utf8')
const action = readFileSync('features/organizations/actions/update-organization-profile.ts', 'utf8')
const screen = readFileSync('features/organizations/components/organization-profile-screen.tsx', 'utf8')
const legacyDetail = readFileSync('app/(unison)/settings/[settingId]/page.tsx', 'utf8')
const legacyEdit = readFileSync('app/(unison)/settings/[settingId]/edit/page.tsx', 'utf8')
const legacyNew = readFileSync('app/(unison)/settings/new/page.tsx', 'utf8')

test('settings composes the real active-tenant organisation profile', () => {
  assert.match(route, /getOrganizationProfile\(\)/)
  assert.match(route, /<OrganizationProfileScreen/)
  assert.doesNotMatch(route, /moduleFixtures|ModuleWorkspace/)
  assert.match(query, /\.from\('organizations'\)/)
  assert.match(query, /\.eq\('id', organization\.id\)/)
  assert.equal((query.match(/\.eq\('organization_id', organization\.id\)/g) ?? []).length, 2)
})

test('summary counts use active persisted records and never vendor fixtures', () => {
  assert.equal((query.match(/\.eq\('status', 'Active'\)/g) ?? []).length, 2)
  assert.equal((query.match(/\.is\('archived_at', null\)/g) ?? []).length, 2)
  assert.match(query, /activeMembers\.length/)
  assert.match(query, /vendors:\s*null/)
  assert.doesNotMatch(query, /features\/delivery\/data|moduleFixtures/)
  assert.match(screen, /Vendor register not connected/)
})

test('organisation name validation trims input and rejects blank or oversized values', () => {
  assert.deepEqual(organizationProfileInputSchema.parse({ name: '  HIMARK  ' }), { name: 'HIMARK' })
  assert.equal(organizationProfileInputSchema.safeParse({ name: ' ' }).success, false)
  assert.equal(organizationProfileInputSchema.safeParse({ name: 'x'.repeat(121) }).success, false)
})

test('organisation editing follows the existing owner-only permission contract', () => {
  assert.equal(roleHasPermission('owner', 'organization.manage'), true)
  assert.equal(roleHasPermission('admin', 'organization.manage'), false)
  assert.equal(roleHasPermission('member', 'organization.manage'), false)
  assert.match(action, /roleHasPermission\(role, 'organization\.manage'\)/)
  assert.match(action, /\.update\(\{ name: parsed\.data\.name \}\)/)
  assert.match(action, /\.eq\('id', organization\.id\)/)
  assert.doesNotMatch(action, /slug:|tier:|status:|email_domain:/)
})

test('unsupported organisation capabilities are represented truthfully', () => {
  assert.match(screen, /No custom branding configured/)
  assert.match(screen, /No integrations connected/)
  assert.match(screen, /not available in this release/)
  for (const fabricatedValue of ['Microsoft Azure DevOps', 'Atlassian Jira', 'Microsoft 365']) {
    assert.doesNotMatch(screen, new RegExp(fabricatedValue))
  }
  for (const billingField of ['Renewal date', 'Billing cycle', 'Payment method']) {
    assert.doesNotMatch(screen, new RegExp(billingField))
  }
})

test('legacy fixture settings routes retire safely to the authoritative profile', () => {
  for (const source of [legacyDetail, legacyEdit, legacyNew]) {
    assert.match(source, /redirect\('\/settings'\)/)
    assert.doesNotMatch(source, /ModuleForm|ModuleRecord|moduleById/)
  }
})
