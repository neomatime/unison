import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { modules as moduleDefinitions } from '../../config/modules.ts'
import { lockedModuleIds, unisonTiers } from '../../config/unison-tiers.ts'
import { moduleFixtures } from '../../features/product-ui/mocks/modules.ts'
import { productModules } from '../../features/product-ui/registry.ts'

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

test('the project detail screen offers no archive-state control with no backing action', () => {
  // Archive now posts to the real archiveProjectAction and redirects away.
  // The "Restore project" button that used to sit beside it did only
  // setArchived(false) -- pure client state, never touched the server -- so a
  // user who clicked it saw the full editing UI reappear and reasonably
  // believed the project was live again, when it would silently revert on the
  // next load. That is worse than the old theatre (which was at least
  // internally consistent), so the control was removed rather than wired to a
  // restoreProjectAction that does not exist and is out of scope here. This
  // pins the removal: no clickable control on this screen may flip archive
  // state through local state alone.
  const project = readFileSync(join(workspace, 'features', 'delivery', 'components', 'project-detail-screen.tsx'), 'utf8')
  assert.doesNotMatch(project, /setArchived/, 'no local archive-state setter may exist on this screen -- archive state comes only from the database')
  assert.doesNotMatch(project, />Restore project</, 'a "Restore project" control has no backing action and must not be offered')

  // And the one archive control that does exist must submit the real form
  // (not just open a dialog that only flips local state), and must be gated
  // behind a confirmation -- archiving is a single click with no in-UI undo
  // once "Restore" is gone, so a bare unconfirmed submit button would be a new
  // hazard the two changes combine to create.
  assert.match(project, /action=\{archiveProjectAction\}/, 'the archive form must post to the real server action')
  assert.match(project, /ConfirmationDialog[\s\S]*?onConfirm=\{[^}]*requestSubmit/, 'archiving must be confirmed before the real form submits')
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

  // The wizard collected Default User Access, Guest Access, Restricted Project
  // Access, SSO Required and MFA Required, and provision_organization persists
  // none of them — a tenant provisioned with "MFA Required" on enforced no MFA.
  // A control claiming a security guarantee it does not deliver is worse than an
  // absent one: absence is a roadmap conversation, a fake toggle is a trust
  // failure in the area enterprise buyers audit hardest. Each may return only
  // with the enforcement behind it, which is why this pins the type as well as
  // the markup — reinstating the field is what makes the control possible again.
  const provisioningTypes = readFileSync(join(workspace, 'features', 'internal-provisioning', 'types.ts'), 'utf8')
  for (const control of ['Access Settings', 'Default User Access', 'Guest Access', 'Restricted Project Access', 'SSO Required', 'MFA Required']) {
    assert.ok(!wizard.includes(control), `"${control}" enforces nothing, so it must not be offered`)
  }
  for (const field of ['defaultAccess', 'guestAccess', 'restrictedProjects', 'ssoRequired', 'mfaRequired']) {
    assert.ok(!provisioningTypes.includes(`${field}:`), `${field} is unenforced state; it must not be reinstated without enforcement`)
    assert.ok(!data.includes(`${field}:`), `${field} must not be seeded into the wizard's initial state`)
  }
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
  for (const action of ["'Suspend'", "'Archive'", "'Edit Internal Metadata'"]) {
    assert.ok(!screen.includes(action), `${action} has no backing action, so it must not be offered`)
  }
  // The drawer opened editable and its Save button only closed it, so typed
  // changes vanished while the close read as confirmation. Nothing in this
  // screen may open an editable drawer until a mutation backs it.
  assert.doesNotMatch(screen, /open\(record, true\)/, 'no row action may open an editable drawer here')
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

  // Matched as `label: 'X'`, which only a row action produces. Matching the bare
  // name against the whole file meant a comment satisfied the assertion: this
  // test passed with TenantsScreen's Suspend action deleted, because the phrase
  // "local-state Suspend/Archive" survives in a comment thirty lines above.
  const rowAction = (label: string) => new RegExp(`label: '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`)

  for (const action of ['Continue Setup', 'Duplicate Setup', 'Pause', 'Resume', 'Archive']) {
    assert.match(provisioning, rowAction(action), `${action} must be offered as a row action`)
  }
  for (const action of ['View Tenant', 'View Provisioning', 'Manage Subscription', 'Change Tier', 'Update Subscription', 'Suspend']) {
    assert.match(registers, rowAction(action), `${action} must be offered as a row action`)
  }

  // Copy rather than row actions, so these stay whole-file matches.
  for (const copy of ['Module Impact', 'Data is not deleted when a module is disabled']) {
    assert.match(registers, new RegExp(copy))
  }
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

test('the projects register reports only what the database holds', () => {
  // Six hard-coded metric cards ("Active Projects 36", "At Risk 7") sat above a
  // register of real rows, and three hard-coded summary panels below it. The
  // delivery overview already carries real counts; a register is a register.
  assert.ok(
    !existsSync(join(workspace, 'features', 'delivery', 'components', 'projects-screen.tsx')),
    'ProjectsScreen carried fabricated metrics above real rows and must not return',
  )
  assert.ok(
    !existsSync(join(workspace, 'features', 'delivery', 'components', 'project-form.tsx')) ||
      !readFileSync(join(workspace, 'features', 'delivery', 'components', 'project-form.tsx'), 'utf8').includes('setComplete'),
    'the four-step wizard reported success without writing; it must not return',
  )

  const registry = readFileSync(join(workspace, 'features', 'product-ui', 'registry.ts'), 'utf8')
  const projects = registry.slice(registry.indexOf("id: 'projects'"), registry.indexOf("id: 'onboarding'"))
  assert.ok(projects.length > 0, 'the projects definition must still exist')
  for (const invented of ['Neo Morake', 'Amara Dlamini', 'LGNDRY.CO', 'Growthpoint Properties', 'Pioneertown']) {
    assert.ok(!projects.includes(invented), `${invented} is fabricated data and must not be offered`)
  }
  // projects_status_check accepts Active / On Hold / Complete / Cancelled.
  for (const rejected of ['Planning', 'On Track']) {
    assert.ok(!projects.includes(`'${rejected}'`), `${rejected} is not a status the database accepts`)
  }

  const page = readFileSync(join(workspace, 'app', '(unison)', 'operations', 'projects', 'page.tsx'), 'utf8')
  for (const passed of ['total', 'pageSize', 'initialQuery', 'connected']) {
    assert.match(page, new RegExp(passed), `the register must receive ${passed} from the server`)
  }
})

// Pulls the `{ Label: 'key', 'Two Word Label': 'key' }` alias map out of a
// source file by name. Values here are always bare lowercase/camelCase
// identifiers with no nested braces, so a non-greedy scan to the first `}`
// is a complete parse, not just an approximation -- there's nothing inside
// the map these two files build that this could mis-parse.
function extractAliasMap(source: string, constName: string): Record<string, string> {
  const declaration = source.match(new RegExp(`const ${constName}: Record<string, string> = \\{([^}]*)\\}`))
  assert.ok(declaration, `${constName} literal not found -- this test is out of sync with the source it checks`)
  const entries: Record<string, string> = {}
  for (const pair of declaration[1].matchAll(/(?:'((?:[^'\\]|\\.)*)'|([A-Za-z][A-Za-z0-9]*))\s*:\s*'((?:[^'\\]|\\.)*)'/g)) {
    entries[pair[1] ?? pair[2]] = pair[3]
  }
  return entries
}

// Pulls the top-level keys out of a connected query's `(data ?? []).map((row)
// => ({ ... }))` mapper by reading the source between that call and the
// function's `return {`. Every mapper this repo has today puts one key per
// line at 4-space indent and never returns a key from a nested object
// literal, so matching lines that start with exactly 4 spaces then a bare
// identifier and a colon captures precisely the returned shape, not an
// approximation of it -- but it depends on that formatting continuing to
// hold, which nothing enforces beyond this comment and a lint/format rule.
function extractMapperKeys(source: string): Set<string> {
  const start = source.indexOf('.map((row) => ({')
  const end = source.indexOf('return {', start)
  assert.ok(start !== -1 && end !== -1, 'query mapper shape not found -- this test is out of sync with the source it checks')
  const body = source.slice(start, end)
  const keys = new Set<string>()
  for (const match of body.matchAll(/^ {4}(\w+):/gm)) keys.add(match[1])
  return keys
}

test('every registry column resolves to a key its records actually carry', () => {
  // module-workspace.tsx's Cell() silently rendered '—' for every 'Next Gate'
  // row because its alias map had no entry for that label and the fallback
  // (`column.toLowerCase()`) doesn't match the mapper's camelCase `nextGate`
  // key. Nothing that runs `tsc` or a text-scanning test would catch that: the
  // column renders, just always empty. This test resolves every column label
  // in every registry module definition the same way the real UI does, and
  // fails if the result is not a key the module's records actually carry.
  //
  // Two different components read `module.columns` against a record, each
  // with its own alias map and fallback (confirmed by grepping every page
  // under app/(unison) for which one it imports):
  //   - ModuleWorkspace (module-workspace.tsx) renders Clients, Projects,
  //     Tasks, Calendar, Knowledge and Settings, via `aliases[column] ??
  //     column.toLowerCase()`.
  //   - DomainModuleWorkspace (domain-module-workspace.tsx) renders Leads,
  //     Quotes, Sales, Invoices, Expenses and Forecast. It resolves each
  //     column to a `{ id, label }` pair via `fieldAliases[column] ??
  //     column.toLowerCase().replaceAll(' ', '')` and hands that off to
  //     record-collection-workspace.tsx (not modified here, only read), which
  //     renders `record[column.id]` with no further fallback -- confirmed by
  //     reading that file, so DomainModuleWorkspace's resolution is the whole
  //     story for these six modules.
  //
  // Record keys come from whichever side is authoritative for that module:
  // the query mapper for a connected module (Projects, Clients), the fixture
  // record for everything else.
  //
  // What this does NOT cover: Onboarding and Team have their own bespoke
  // screens (OnboardingScreen, TeamScreen) that never read `module.columns`
  // at all, so there is no key-resolution mechanism to check their column
  // lists against, and they are excluded below rather than checked against a
  // mechanism they don't use. If either is ever pointed at one of the two
  // shared workspaces above, its columns need checking by hand the way this
  // task had to -- this test will not have exercised that path.
  const moduleWorkspaceSource = readFileSync(join(workspace, 'features', 'product-ui', 'components', 'module-workspace.tsx'), 'utf8')
  const domainWorkspaceSource = readFileSync(join(workspace, 'features', 'product-ui', 'components', 'domain-module-workspace.tsx'), 'utf8')
  const moduleAliases = extractAliasMap(moduleWorkspaceSource, 'aliases')
  const domainAliases = extractAliasMap(domainWorkspaceSource, 'fieldAliases')

  // moduleFixtures still has 'projects' and 'clients' entries left over from
  // before they were connected to the database, but neither page reads them
  // any more (both pass live query results to ModuleWorkspace instead) -- so
  // those two fixture entries must not be allowed to override the query
  // mappers below, which are what the live pages actually render.
  const recordKeysByModule: Record<string, Set<string>> = {}
  for (const [id, records] of Object.entries(moduleFixtures)) {
    recordKeysByModule[id] = new Set(records.flatMap((record) => Object.keys(record)))
  }
  recordKeysByModule.projects = extractMapperKeys(readFileSync(join(workspace, 'features', 'delivery', 'queries', 'list-projects.ts'), 'utf8'))
  recordKeysByModule.clients = extractMapperKeys(readFileSync(join(workspace, 'features', 'clients', 'queries', 'list-clients.ts'), 'utf8'))

  const moduleWorkspaceModules = new Set(['clients', 'projects', 'tasks', 'calendar', 'knowledge', 'settings'])
  const domainWorkspaceModules = new Set(['leads', 'quotes', 'sales', 'invoices', 'expenses', 'forecast'])

  let checked = 0
  for (const module of productModules) {
    const usesModuleWorkspace = moduleWorkspaceModules.has(module.id)
    const usesDomainWorkspace = domainWorkspaceModules.has(module.id)
    if (!usesModuleWorkspace && !usesDomainWorkspace) continue // Onboarding, Team: see comment above

    const keys = recordKeysByModule[module.id]
    assert.ok(keys, `no record source (query mapper or fixture) found for module '${module.id}'`)

    for (const [index, column] of module.columns.entries()) {
      // The first (primary) column never goes through this resolution in
      // either component: ModuleWorkspace's Cell() renders `record.name`
      // outright for it regardless of the label (module-workspace.tsx:133,
      // `if (primary) return <Link ...>{record.name}</Link>`), and
      // record-collection-workspace.tsx falls back to `record.name` for it
      // (`record[column.id] ?? record.name`). So a mismatched first-column
      // alias -- Clients' own 'Client' column resolves to 'client', which its
      // connected records don't carry -- is real but inert, not the class of
      // bug this test exists to catch. Checking it here would fail on that
      // inert case instead of a load-bearing one.
      if (index === 0) continue

      const resolved = usesModuleWorkspace
        ? moduleAliases[column] ?? column.toLowerCase()
        : domainAliases[column] ?? column.toLowerCase().replaceAll(' ', '')
      assert.ok(keys.has(resolved), `${module.id}'s '${column}' column resolves to record key '${resolved}', which its records do not carry -- the cell will render '—' for every row`)
      checked += 1
    }
  }
  assert.ok(checked >= 60, `expected to have checked columns across all 12 wired modules, only checked ${checked}`)
})

test('the projects register renders a real Next Gate value instead of always dashing it out', () => {
  // This does not render the component -- module-workspace.tsx is a 'use
  // client' component with JSX, which this plain node:test file has no
  // renderer for. Instead it exercises the exact resolution the component's
  // own `recordValue()` performs (`aliases[column] ?? column.toLowerCase()`,
  // then `record[key] ?? '—'`), against a record shaped exactly like
  // list-projects.ts's real mapper output, so this fails the same way the
  // shipped bug did: silently, by falling through to the '—' fallback.
  const source = readFileSync(join(workspace, 'features', 'product-ui', 'components', 'module-workspace.tsx'), 'utf8')
  const aliases = extractAliasMap(source, 'aliases')
  assert.match(source, /return record\[aliases\[column\] \?\? column\.toLowerCase\(\)\] \?\? '—'/, 'recordValue\'s resolution logic changed shape -- this test is out of sync with it')

  const resolvedKey = aliases['Next Gate'] ?? 'next gate'.toLowerCase()
  const projectRecord = { id: 'proj-1', name: 'Meridian Growth Programme', status: 'On Track', owner: 'Amara Dlamini', updated: '28 Aug 2026', nextGate: 'Governance Sign-off', due: '28 Aug 2026' } as Record<string, string>
  const rendered = projectRecord[resolvedKey] ?? '—'

  assert.notEqual(rendered, '—', `'Next Gate' resolved to '${resolvedKey}', which this real-shaped project record does not carry -- every row would dash out`)
  assert.equal(rendered, 'Governance Sign-off')
})

test('the projects register renders Health through the colour badge, not plain text', () => {
  // Same caveat as above: this exercises Cell()'s branch condition directly
  // rather than rendering JSX. The bug was that 'Health' was absent from the
  // set of column labels that route through <StatusBadge>, so real On
  // Track/At Risk/Critical values rendered as a plain <span> -- present, but
  // uncoloured. This pins that 'Health' is now in that set.
  const source = readFileSync(join(workspace, 'features', 'product-ui', 'components', 'module-workspace.tsx'), 'utf8')
  const cellBody = source.slice(source.indexOf('function Cell('), source.indexOf('function statusTone('))
  assert.ok(cellBody.length > 0, 'Cell() not found -- this test is out of sync with the source it checks')

  const badgeColumns = new Set([...cellBody.matchAll(/column === '([^']+)'/g)].map((match) => match[1]))
  assert.ok(badgeColumns.has('Health'), "'Health' must route through <StatusBadge>, the same as 'Status'/'Risk'/'Client Health'/'Stage'")

  // And confirm the badge-or-not decision itself, not just that the string is
  // present somewhere in the file: build the exact condition from the source
  // and evaluate it the way Cell() does.
  const conditionSource = cellBody.match(/if \((column === '[^)]+)\) return <StatusBadge/)?.[1]
  assert.ok(conditionSource, 'badge condition not found in the expected shape')
  // eslint-disable-next-line no-new-func -- evaluating the exact extracted boolean expression, not arbitrary input
  const isBadgeColumn = new Function('column', `return (${conditionSource})`) as (column: string) => boolean
  assert.equal(isBadgeColumn('Health'), true, "column === 'Health' must satisfy Cell()'s badge condition")
})
