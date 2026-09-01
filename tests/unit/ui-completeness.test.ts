import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { modules as moduleDefinitions } from '../../config/modules.ts'
import { lockedModuleIds, unisonTiers } from '../../config/unison-tiers.ts'

const workspace = process.cwd()
const unisonRoot = join(workspace, 'app', '(unison)')
const internalRoot = join(workspace, 'app', '(internal)', 'internal')

const visibleRoutes = [
  ['overview', 'overview'],
  ['portfolio', 'delivery/portfolio'],
  ['projects', 'operations/projects'],
  ['frameworks', 'delivery/frameworks'],
  ['approvals', 'delivery/approvals'],
  ['vendors', 'delivery/vendors'],
  ['clients', 'operations/clients'],
  ['onboarding', 'operations/onboarding'],
  ['leads', 'commercial/leads'],
  ['quotes', 'commercial/quotes'],
  ['sales', 'commercial/sales'],
  ['invoices', 'finance/invoices'],
  ['expenses', 'finance/expenses'],
  ['forecast', 'finance/forecast'],
  ['team', 'people/team'],
] as const

test('every visible navigation module has a workspace route', () => {
  for (const [moduleId, route] of visibleRoutes) {
    assert.ok(existsSync(join(unisonRoot, ...route.split('/'), 'page.tsx')), `${moduleId} workspace route is missing`)
  }
})

test('major delivery records have complete create, detail, and edit routes', () => {
  for (const [route, parameter] of [
    ['operations/projects', 'projectId'],
    ['delivery/frameworks', 'frameworkId'],
    ['delivery/vendors', 'vendorId'],
  ] as const) {
    const root = join(unisonRoot, ...route.split('/'))
    assert.ok(existsSync(join(root, 'new', 'page.tsx')), `${route} create route is missing`)
    assert.ok(existsSync(join(root, `[${parameter}]`, 'page.tsx')), `${route} detail route is missing`)
    assert.ok(existsSync(join(root, `[${parameter}]`, 'edit', 'page.tsx')), `${route} edit route is missing`)
  }
  assert.ok(existsSync(join(unisonRoot, 'operations', 'onboarding', '[onboardingId]', 'page.tsx')))
})

test('portfolio and programme journeys include their complete nested route hierarchy', () => {
  const portfolio = join(unisonRoot, 'delivery', 'portfolio')
  assert.ok(existsSync(join(portfolio, 'new', 'page.tsx')))
  assert.ok(existsSync(join(portfolio, '[portfolioId]', 'page.tsx')))
  assert.ok(existsSync(join(portfolio, '[portfolioId]', 'edit', 'page.tsx')))
  assert.ok(existsSync(join(portfolio, '[portfolioId]', 'programmes', 'new', 'page.tsx')))
  assert.ok(existsSync(join(portfolio, '[portfolioId]', 'programmes', '[programmeId]', 'page.tsx')))
  assert.ok(existsSync(join(portfolio, '[portfolioId]', 'programmes', '[programmeId]', 'edit', 'page.tsx')))
})

test('approval and onboarding workflows expose create and detail experiences', () => {
  const approvals = join(unisonRoot, 'delivery', 'approvals')
  const onboarding = join(unisonRoot, 'operations', 'onboarding')
  assert.ok(existsSync(join(approvals, 'new', 'page.tsx')))
  assert.ok(existsSync(join(approvals, '[approvalId]', 'page.tsx')))
  assert.ok(existsSync(join(onboarding, 'new', 'page.tsx')))
  assert.ok(existsSync(join(onboarding, '[onboardingId]', 'page.tsx')))
  assert.ok(existsSync(join(onboarding, '[onboardingId]', 'edit', 'page.tsx')))
})

test('commercial and finance registers use the shared production register', () => {
  for (const route of ['commercial/leads', 'commercial/quotes', 'commercial/sales', 'finance/invoices', 'finance/expenses', 'finance/forecast']) {
    const source = readFileSync(join(unisonRoot, ...route.split('/'), 'page.tsx'), 'utf8')
    assert.match(source, /DomainModuleWorkspace/, `${route} is not using the shared CRUD register`)
  }
  const domainRegister = readFileSync(join(workspace, 'features', 'product-ui', 'components', 'domain-module-workspace.tsx'), 'utf8')
  for (const action of ['Qualify', 'Convert', 'Submit', 'Mark Paid', 'Approve']) assert.match(domainRegister, new RegExp(action))
})

test('Team is the only People module and exposes the complete accountability workspace', () => {
  const modules = readFileSync(join(workspace, 'config', 'modules.ts'), 'utf8')
  const teamRoute = readFileSync(join(unisonRoot, 'people', 'team', 'page.tsx'), 'utf8')
  const screen = readFileSync(join(workspace, 'features', 'team', 'components', 'team-screen.tsx'), 'utf8')
  const workspaces = readFileSync(join(workspace, 'features', 'team', 'components', 'team-workspaces.tsx'), 'utf8')
  const dialogs = readFileSync(join(workspace, 'features', 'team', 'components', 'team-dialogs.tsx'), 'utf8')

  assert.match(modules, /id: 'team'.*enabled: true.*category: 'people'/)
  assert.equal([...modules.matchAll(/category: 'people'/g)].length, 1)
  assert.doesNotMatch(modules, /id: 'hr'|id: 'leave'/)
  assert.match(teamRoute, /TeamScreen/)
  for (const tab of ['Directory', 'Departments', 'Teams', 'Roles', 'Project Assignments', 'Capacity', 'Availability', 'Activity']) assert.match(workspaces, new RegExp(tab))
  for (const capability of ['Invite Member', 'Total Members', 'Active on Projects', 'Capacity Utilisation', 'Department Snapshot', 'Recent Team Activity']) assert.match(screen, new RegExp(capability))
  for (const action of ['View Profile', 'Edit', 'View Assignments', 'View Capacity', 'Change Team', 'Change Role', 'Deactivate', 'Reactivate', 'New Department', 'New Team', 'New Role', 'Assign Member', 'Remove Assignment']) assert.match(workspaces, new RegExp(action))
  for (const state of ['loading', 'success', 'error', 'First Name', 'Work Email', 'Access Role', 'Initial Project Assignment']) assert.match(dialogs, new RegExp(state, 'i'))
  for (const path of ['new/page.tsx', '[employeeId]/page.tsx', '[employeeId]/edit/page.tsx']) assert.ok(existsSync(join(unisonRoot, 'people', 'team', ...path.split('/'))))
})

test('retired People routes redirect to Team without exposing orphan workspaces', () => {
  for (const path of [
    'hr/page.tsx', 'hr/new/page.tsx', 'hr/[recordId]/page.tsx', 'hr/[recordId]/edit/page.tsx',
    'leave/page.tsx', 'leave/new/page.tsx', 'leave/[requestId]/page.tsx', 'leave/[requestId]/edit/page.tsx',
  ]) {
    const source = readFileSync(join(unisonRoot, 'people', ...path.split('/')), 'utf8')
    assert.match(source, /redirect\('\/people\/team'\)/)
    assert.doesNotMatch(source, /@\/features\/product-ui|<Module(?:Workspace|Record|Form)/)
  }
})

test('shared register UI covers CRUD, archived records, export, import, and table controls', () => {
  const register = readFileSync(join(workspace, 'features', 'product-ui', 'components', 'record-collection-workspace.tsx'), 'utf8')
  for (const capability of [
    'Create',
    'Edit',
    'Duplicate',
    'Archive',
    'Restore',
    'Export',
    'Import',
    'Columns',
    'Sort',
    'Search',
  ]) assert.match(register, new RegExp(capability, 'i'), `${capability} control is missing from the shared register`)
})

test('project records include requirements, traceability, document management, and upload states', () => {
  const project = readFileSync(join(workspace, 'features', 'delivery', 'components', 'project-detail-screen.tsx'), 'utf8')
  const documents = readFileSync(join(workspace, 'features', 'delivery', 'components', 'project-documents-workspace.tsx'), 'utf8')
  for (const capability of ['Requirements', 'Traceability', 'Documents', 'Processes', 'Testing', 'Risks', 'Decisions', 'Benefits']) {
    assert.match(project, new RegExp(capability), `${capability} project workspace is missing`)
  }
  for (const state of ['progress', 'Cancel', 'Retry', 'Remove', 'duplicate', 'unsupported', 'classification']) {
    assert.match(documents, new RegExp(state, 'i'), `${state} document-upload state is missing`)
  }
})

test('navigation follows the delivery-focused product structure', () => {
  const navigation = readFileSync(join(workspace, 'config', 'navigation.ts'), 'utf8')
  const modules = readFileSync(join(workspace, 'config', 'modules.ts'), 'utf8')
  for (const [moduleId] of visibleRoutes) assert.match(modules, new RegExp(`id: '${moduleId}'.*enabled: true`))
  for (const heading of ['Delivery', 'Operations', 'Commercial', 'Finance', 'People']) assert.match(navigation, new RegExp(heading))
  for (const removed of ['tasks', 'calendar', 'hr', 'leave', 'knowledge']) assert.doesNotMatch(modules, new RegExp(`id: '${removed}'`))
})

test('protected sign-in and client data paths remain connected', () => {
  assert.match(readFileSync(join(workspace, 'app', '(auth)', 'sign-in', 'page.tsx'), 'utf8'), /AuthScreen/)
  assert.match(readFileSync(join(unisonRoot, 'operations', 'clients', 'page.tsx'), 'utf8'), /listClients/)
  assert.match(readFileSync(join(unisonRoot, 'operations', 'clients', 'new', 'page.tsx'), 'utf8'), /createClientAction/)
  assert.match(readFileSync(join(unisonRoot, 'operations', 'clients', '[clientId]', 'edit', 'page.tsx'), 'utf8'), /updateClientAction/)
})

test('the projects route reads from the database, not the delivery mocks', () => {
  const source = readFileSync('app/(unison)/operations/projects/page.tsx', 'utf8')
  assert.match(source, /listProjects/)
  assert.doesNotMatch(source, /features\/delivery\/data/)
})

test('main sign-in uses the centered secure workspace experience', () => {
  const screen = readFileSync(join(workspace, 'features', 'auth-ui', 'auth-screen.tsx'), 'utf8')
  for (const copy of [
    'Secure workspace access',
    'Sign in to UNISON',
    'Continue with Microsoft',
    'Enterprise-grade security',
    'SSO-ready',
    'Role-based access',
    'your UNISON administrator',
  ]) assert.match(screen, new RegExp(copy))
  for (const behavior of ['signInAction', 'signInWithMicrosoftAction', 'useFormStatus', 'name="next"', 'Show password']) assert.match(screen, new RegExp(behavior))
  assert.doesNotMatch(screen, /DeliveryPreview|Create account|Sign up/)
})

test('HIMARK internal administration is isolated from tenant onboarding', () => {
  for (const path of [
    'overview/page.tsx',
    'organisations/page.tsx',
    'provisioning/page.tsx',
    'provisioning/new/page.tsx',
    'provisioning/[provisioningId]/page.tsx',
    'tenants/page.tsx',
    'subscriptions/page.tsx',
    'support/page.tsx',
    'knowledge/page.tsx',
  ]) assert.ok(existsSync(join(internalRoot, ...path.split('/'))), `${path} internal route is missing`)

  const internalLayout = readFileSync(join(internalRoot, 'layout.tsx'), 'utf8')
  const tenantOnboarding = readFileSync(join(unisonRoot, 'operations', 'onboarding', 'page.tsx'), 'utf8')
  assert.match(internalLayout, /resolveInternalAccess/)
  assert.match(tenantOnboarding, /OnboardingScreen/)
  assert.doesNotMatch(tenantOnboarding, /ProvisioningWizard|InternalAppShell/)
})

test('internal administration has its own secure sign-in journey', () => {
  const pagePath = join(workspace, 'app', '(auth)', 'internal', 'sign-in', 'page.tsx')
  const screenPath = join(workspace, 'features', 'auth-ui', 'internal-sign-in-screen.tsx')
  assert.ok(existsSync(pagePath), 'internal sign-in route is missing')
  const page = readFileSync(pagePath, 'utf8')
  const screen = readFileSync(screenPath, 'utf8')
  const proxy = readFileSync(join(workspace, 'proxy.ts'), 'utf8')
  const microsoft = readFileSync(join(workspace, 'features', 'auth-ui', 'actions', 'sign-in-with-microsoft.ts'), 'utf8')
  const callback = readFileSync(join(workspace, 'app', 'auth', 'callback', 'route.ts'), 'utf8')
  const signOut = readFileSync(join(workspace, 'features', 'auth-ui', 'actions', 'sign-out.ts'), 'utf8')

  assert.match(page, /InternalSignInScreen/)
  for (const copy of ['HIMARK Internal', 'Sign in to UNISON Internal', 'Continue with Microsoft', 'Tenant provisioning', 'authorised HIMARK administrators']) {
    assert.match(screen, new RegExp(copy))
  }
  assert.match(screen, /signInAction/)
  assert.match(screen, /signInWithMicrosoftAction/)
  assert.doesNotMatch(screen, /Create account|Sign up/)
  assert.match(proxy, /INTERNAL_SIGN_IN_PATH/)
  assert.match(microsoft, /callbackUrl\.searchParams\.set\('next', next\)/)
  assert.match(callback, /safeRedirectPath\(url\.searchParams\.get\('next'\)\)/)
  assert.match(signOut, /signOutInternalAction/)
})

test('internal navigation exposes only HIMARK platform operations', () => {
  const sidebar = readFileSync(join(workspace, 'components', 'internal', 'internal-sidebar.tsx'), 'utf8')
  for (const heading of ['Platform', 'Provisioning', 'Support']) assert.match(sidebar, new RegExp(heading))
  for (const item of ['Overview', 'Organisations', 'Client Provisioning', 'Tenants', 'Subscriptions', 'Support Tickets', 'Knowledge Base']) assert.match(sidebar, new RegExp(item))
  for (const tenantModule of ['Portfolio', 'Projects', 'Frameworks', 'Clients', 'Leads', 'Finance', 'Team']) assert.doesNotMatch(sidebar, new RegExp(`label: '${tenantModule}'`))
})

test('client provisioning wizard includes every designed stage and provisions for real', () => {
  const wizard = readFileSync(join(workspace, 'features', 'internal-provisioning', 'components', 'provisioning-wizard.tsx'), 'utf8')
  const data = readFileSync(join(workspace, 'features', 'internal-provisioning', 'data.ts'), 'utf8')
  for (const stage of ['Organisation', 'UNISON Tier', 'Modules', 'Delivery Setup', 'Admin & Access', 'Review & Provision']) assert.match(`${wizard}\n${data}`, new RegExp(stage))
  for (const capability of ['Save Draft', 'Save & Continue', 'beforeunload', 'Not Included', 'Locked', 'Provision UNISON', 'UNISON Workspace Ready']) assert.match(wizard, new RegExp(capability))
  // The simulated seven-step progress screen and its 'Provisioning Failed' /
  // 'Retry Failed Step' state are no longer reachable: submit calls the server
  // action instead. Pinning those strings here would have enforced the presence
  // of code nothing can reach, so this now pins the real behaviour instead.
  assert.match(wizard, /provisionOrganizationAction\(undefined, formData\)/)
  for (const outcome of [/result\.error/, /result\.emailFailed/, /setScreen\('success'\)/]) assert.match(wizard, outcome)
  assert.match(wizard, /reissue_invitation/, 'an email failure must name its recovery')
  // Nothing the database does not hold may be reported back as achieved, and
  // nothing it does hold may be reported as unconfigured. Modules and go-live
  // are still stored nowhere; tier is stored, so the success screen must show
  // the tier the tenant was actually provisioned on.
  assert.match(wizard, /const NOT_PERSISTED = 'Not yet configured'/)
  assert.match(wizard, /\['Tier', getTier\(wizard\.selectedTier\)\.label\]/, 'the success screen must show the provisioned tier')
  assert.doesNotMatch(wizard, /\['Tier', NOT_PERSISTED\]/, 'tier is stored, so it may not be reported as unconfigured')
  assert.doesNotMatch(wizard, /Tier, modules and go-live were collected by this wizard but are not stored/, 'the success paragraph must not deny that tier was stored')
  // Submit sends a real invitation email to whatever these two fields hold, so
  // the wizard must not arrive pre-loaded with a plausible provisioning target.
  assert.match(data, /organisation: \{\s+name: '',/, 'the organisation name must start empty')
  assert.match(data, /primaryAdmin: \{ id: 'admin-1', name: '', email: '',/, 'the primary admin must start empty')
})

test('the selected tier reaches the database, not just the wizard state', () => {
  // wizard.selectedTier is collected across the whole wizard but is local
  // state until it is put into the FormData submitted to
  // provisionOrganizationAction. Without this line the action's own
  // `formData.get('tier') ?? undefined` falls through to the zod
  // `.default('core')` -- every UI-provisioned tenant silently becomes Core
  // regardless of what tier the operator selected, with nothing on screen or
  // in an error to say so.
  const wizard = readFileSync(join(workspace, 'features', 'internal-provisioning', 'components', 'provisioning-wizard.tsx'), 'utf8')
  assert.match(wizard, /formData\.set\('tier', wizard\.selectedTier\)/, 'the selected tier must be sent to provisionOrganizationAction')
})

test('an operator who never chooses a tier provisions the smallest entitlement', () => {
  // Because the wizard always sends wizard.selectedTier, the two fail-safe
  // defaults behind it -- organizations.tier's `default 'core'` and the
  // action's zod `.default('core')` -- are unreachable from the only production
  // path that creates an organisation. Whatever data.ts pre-selects is what an
  // operator provisions if they click through the Tier stage without touching
  // it, and validateCurrent() does not force a choice. Pinning it to the
  // smallest tier keeps a slip withholding access rather than granting it, and
  // stops a future edit to these demo defaults silently re-granting the largest
  // tier. unisonTiers is ordered smallest to largest.
  const smallest = unisonTiers[0].id
  const data = readFileSync(join(workspace, 'features', 'internal-provisioning', 'data.ts'), 'utf8')
  assert.match(data, new RegExp(`selectedTier: '${smallest}',`), `the wizard must start on ${smallest}, the smallest entitlement`)
  assert.match(data, new RegExp(`activeModules: getEntitledModuleIds\\('${smallest}'\\),`), 'the pre-activated modules must match the pre-selected tier')
})

test('the organisations register reports only what the database holds', () => {
  // Same rule as the wizard's success screen: nothing the database does not
  // hold may be reported back as achieved. This register renders real
  // organizations rows, so a local-state Suspend/Archive that flips a badge
  // until the next refresh, and four hard-coded metric tiles above live data,
  // are the same defect class as a fabricated success.
  const registers = readFileSync(join(workspace, 'features', 'internal-provisioning', 'components', 'internal-registers.tsx'), 'utf8')
  const screen = registers.slice(
    registers.indexOf('export function OrganisationsScreen'),
    registers.indexOf('export function TenantsScreen'),
  )
  assert.ok(screen.length > 0, 'OrganisationsScreen must still exist')
  assert.doesNotMatch(screen, /setRecords|ConfirmationDialog/, 'no row action may mutate the register locally')
  for (const action of ["'Suspend'", "'Archive'"]) {
    assert.ok(!screen.includes(action), `${action} has no backing action, so it must not be offered`)
  }
  assert.doesNotMatch(screen, /<InternalMetric[^>]*value="\d/, 'metric tiles must not be literals')
  assert.match(screen, /value=\{String\(counts\.total\)\}/, 'the tiles must be counted from the rendered rows')
})

test('the provisioning success dialog claims only the invitation that was actually sent', () => {
  // provision_organization writes exactly one invitation: the owner invitation
  // for the primary administrator. The dialog used to claim
  // access.users.length + 1 people were "ready to receive workspace
  // invitations", counting two fabricated demo people at a real external
  // domain that data.ts pre-loaded.
  const wizard = readFileSync(join(workspace, 'features', 'internal-provisioning', 'components', 'provisioning-wizard.tsx'), 'utf8')
  const data = readFileSync(join(workspace, 'features', 'internal-provisioning', 'data.ts'), 'utf8')
  assert.doesNotMatch(wizard, /configured users are ready to receive/, 'the dialog must not claim uninvited users')
  assert.match(wizard, /One invitation was created and emailed/)
  assert.match(data, /users: \[\],/, 'no demo user may be pre-loaded into the wizard')
  assert.doesNotMatch(data, /james\.carter@|tessa\.williams@/, 'fabricated people at a real domain must not survive')
})

test('internal registers provide non-destructive operational actions and tier impact review', () => {
  const provisioning = readFileSync(join(workspace, 'features', 'internal-provisioning', 'components', 'provisioning-register.tsx'), 'utf8')
  const registers = readFileSync(join(workspace, 'features', 'internal-provisioning', 'components', 'internal-registers.tsx'), 'utf8')
  for (const action of ['Continue Setup', 'Duplicate Setup', 'Pause', 'Resume', 'Archive']) assert.match(provisioning, new RegExp(action))
  for (const action of ['View Tenant', 'View Provisioning', 'Manage Subscription', 'Change Tier', 'Module Impact', 'Data is not deleted when a module is disabled', 'Update Subscription', 'Suspend']) assert.match(registers, new RegExp(action))
})

test('tier configuration is the single HR-free, Atlas-free entitlement source', () => {
  const tiers = readFileSync(join(workspace, 'config', 'unison-tiers.ts'), 'utf8')
  assert.match(tiers, /lockedModuleIds/)
  assert.match(tiers, /reconcileActiveModules/)
  assert.match(tiers, /strategic-enterprise/)
  assert.doesNotMatch(tiers, /\bhr\b|\batlas\b/i)
  assert.equal([...tiers.matchAll(/moduleIds: \['team'\]/g)].length, 1)
})

test('removed product direction is absent from application UI', () => {
  const roots = ['app', 'components', 'config', 'features'].map((directory) => join(workspace, directory))
  const files: string[] = []
  function collect(directory: string) {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry)
      if (statSync(path).isDirectory()) collect(path)
      else if (/\.(ts|tsx)$/.test(entry)) files.push(path)
    }
  }
  roots.forEach(collect)
  const source = files.map((file) => readFileSync(file, 'utf8')).join('\n')
  assert.doesNotMatch(source, /Atlas|ATLAS|Project Intelligence|Portfolio Intelligence|Framework Intelligence|Vendor Intelligence/)
})

test('global fallback and loading screens exist', () => {
  for (const file of [
    join(workspace, 'app', 'error.tsx'),
    join(workspace, 'app', 'not-found.tsx'),
    join(unisonRoot, 'loading.tsx'),
    join(workspace, 'app', '(auth)', 'loading.tsx'),
    join(workspace, 'app', '(onboarding)', 'loading.tsx'),
    join(workspace, 'components', 'shared', 'navigation-loading.tsx'),
  ]) assert.ok(existsSync(file), `${file} is missing`)
})

test('every module a tier can withhold is guarded by its own layout', () => {
  // The failure mode is forgetting a guard on a new module, which fails open —
  // the module would simply be reachable on every tier. Locked modules need no
  // guard: no tier can withhold Delivery or Team.
  const gated = moduleDefinitions
    .filter((module) => !(lockedModuleIds as readonly string[]).includes(module.id))
    .map((module) => ({ id: module.id, dir: join(unisonRoot, module.route.replace(/^\//, '')) }))

  assert.equal(gated.length, 8, 'expected exactly the Operations, Commercial and Finance modules')

  for (const { id, dir } of gated) {
    const layout = join(dir, 'layout.tsx')
    assert.ok(existsSync(layout), `${id} has no guard layout at ${layout}`)
    assert.match(
      readFileSync(layout, 'utf8'),
      new RegExp(`moduleId="${id}"`),
      `${id}'s layout must gate on its own module id`,
    )
  }
})
