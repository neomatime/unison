// User rights: what each person may do in each area of UNISON. Pure, no imports, so unit tests and the server load it.
//
// Three layers, in this order: (1) restrictions, which always deny; (2) the person's own overrides; (3) the role's defaults.
// An Owner always has every right and cannot be restricted. Data access (Own / Assigned / Team / All) is saved per module here and
// is enforced on records in the database in the next phase; the rights below are enforced by the server now.

export const RIGHT_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const
export type RightAction = (typeof RIGHT_ACTIONS)[number]

export type RightModule = { id: string; label: string; actions: readonly RightAction[]; scoped: boolean }

const crud: readonly RightAction[] = ['view', 'create', 'edit', 'delete']
const crudExport: readonly RightAction[] = ['view', 'create', 'edit', 'delete', 'export']
const money: readonly RightAction[] = ['view', 'create', 'edit', 'delete', 'approve', 'export']

/** The areas of UNISON, in sidebar order. `scoped` areas can be limited to Own / Assigned / Team / All records. */
export const RIGHT_MODULES: readonly RightModule[] = [
  { id: 'overview', label: 'Overview', actions: ['view', 'export'], scoped: false },
  { id: 'team', label: 'Team', actions: crud, scoped: false },
  { id: 'clients', label: 'Clients', actions: crudExport, scoped: true },
  { id: 'onboarding', label: 'Onboarding', actions: crud, scoped: true },
  { id: 'vendors', label: 'Vendors', actions: crudExport, scoped: false },
  { id: 'calendar', label: 'Calendar', actions: crud, scoped: true },
  { id: 'leads', label: 'Leads', actions: crudExport, scoped: true },
  { id: 'acquisition', label: 'Acquisition', actions: ['view', 'create', 'edit', 'export'], scoped: false },
  { id: 'quotes', label: 'Quotes', actions: money, scoped: true },
  { id: 'sales', label: 'Sales', actions: crudExport, scoped: true },
  { id: 'invoices', label: 'Invoices', actions: money, scoped: true },
  { id: 'expenses', label: 'Expenses', actions: money, scoped: true },
  { id: 'forecasting', label: 'Forecasting', actions: ['view', 'create', 'edit', 'export'], scoped: false },
  { id: 'settings', label: 'Organisation settings', actions: ['view', 'edit'], scoped: false },
]

export const MODULE_IDS = RIGHT_MODULES.map((module) => module.id)
export const moduleById = (id: string): RightModule | undefined => RIGHT_MODULES.find((module) => module.id === id)

export type RoleId = 'owner' | 'admin' | 'member'
export type Overrides = Record<string, Partial<Record<RightAction, boolean>>>

/**
 * What each role can do before anyone is customised. Owner and Admin can do everything. A Member can view, create, edit and
 * export in every area except Organisation settings, and cannot delete or approve. This matches what Members can do in the app
 * today (everything is archived rather than deleted, and there are no approvals Members make).
 */
export function roleAllows(role: string, moduleId: string, action: RightAction): boolean {
  const module = moduleById(moduleId)
  if (!module || !module.actions.includes(action)) return false
  if (role === 'owner' || role === 'admin') return true
  if (role !== 'member') return false
  if (moduleId === 'settings') return false
  return action === 'view' || action === 'create' || action === 'edit' || action === 'export'
}

// ---- Restrictions -------------------------------------------------------------------------------------------------

export type Restriction = { id: string; label: string; description: string; enforced: boolean }

/** Extra limits that always deny, whatever the role or overrides say. `enforced: false` are saved and shown, and applied in the next phase. */
export const RESTRICTIONS: readonly Restriction[] = [
  { id: 'financial', label: 'Financial records', description: 'No access to invoices, expenses and forecasting.', enforced: true },
  { id: 'integrations', label: 'Integrations and automations', description: 'No access to integrations, automations and jobs in Settings.', enforced: true },
  { id: 'admin', label: 'Administrative functions', description: 'Cannot manage users, company details or organisation settings.', enforced: true },
  { id: 'sensitive', label: 'Sensitive contact details', description: 'Personal contact details on leads and clients are hidden.', enforced: false },
]
export const RESTRICTION_IDS = RESTRICTIONS.map((restriction) => restriction.id)

const FINANCIAL_MODULES = new Set(['invoices', 'expenses', 'forecasting'])

/** Whether a restriction denies this right outright. */
export function restrictionDenies(restrictions: readonly string[], moduleId: string, action: RightAction): boolean {
  if (restrictions.includes('financial') && FINANCIAL_MODULES.has(moduleId)) return true
  if (restrictions.includes('admin') && moduleId === 'settings' && action === 'edit') return true
  if (restrictions.includes('admin') && moduleId === 'team' && action !== 'view') return true
  return false
}

// ---- Data access --------------------------------------------------------------------------------------------------

export const DATA_SCOPES = ['own', 'assigned', 'team', 'all'] as const
export type DataScope = (typeof DATA_SCOPES)[number]
export const SCOPE_LABELS: Record<DataScope, string> = { own: 'Own records', assigned: 'Assigned records', team: 'Team records', all: 'All records' }
export const SCOPE_HINTS: Record<DataScope, string> = {
  own: 'Records the person owns.',
  assigned: 'Records they are assigned to, such as tasks, projects and onboardings.',
  team: 'Records owned by anyone in their team.',
  all: 'Every record in the workspace.',
}
export type Scopes = Record<string, DataScope>

export function defaultScope(): DataScope {
  return 'all'
}

// ---- Effective rights ---------------------------------------------------------------------------------------------

export type RightsInput = { role: string; overrides?: Overrides | null; restrictions?: readonly string[] | null }

/** The one rule the server, the screen and the tests all use. */
export function can(input: RightsInput, moduleId: string, action: RightAction): boolean {
  const module = moduleById(moduleId)
  if (!module || !module.actions.includes(action)) return false
  if (input.role === 'owner') return true
  if (restrictionDenies(input.restrictions ?? [], moduleId, action)) return false
  const override = input.overrides?.[moduleId]?.[action]
  const allowed = typeof override === 'boolean' ? override : roleAllows(input.role, moduleId, action)
  // Creating, editing, deleting, approving or exporting something you cannot view makes no sense, so those need View too.
  if (allowed && action !== 'view') return can(input, moduleId, 'view')
  return allowed
}

export type RightsGrid = Record<string, Record<RightAction, boolean | null>>

/** Every module and action with its effective value (null where the action does not apply). */
export function effectiveGrid(input: RightsInput): RightsGrid {
  const grid: RightsGrid = {}
  for (const module of RIGHT_MODULES) {
    const row = {} as Record<RightAction, boolean | null>
    for (const action of RIGHT_ACTIONS) row[action] = module.actions.includes(action) ? can(input, module.id, action) : null
    grid[module.id] = row
  }
  return grid
}

/** The overrides that differ from the role's defaults (what is worth saving). Unknown modules and actions are dropped. */
export function cleanOverrides(role: string, wanted: Overrides): Overrides {
  const clean: Overrides = {}
  for (const module of RIGHT_MODULES) {
    for (const action of module.actions) {
      const value = wanted[module.id]?.[action]
      if (typeof value === 'boolean' && value !== roleAllows(role, module.id, action)) (clean[module.id] ??= {})[action] = value
    }
  }
  return clean
}

export function cleanScopes(wanted: Record<string, unknown>): Scopes {
  const clean: Scopes = {}
  for (const module of RIGHT_MODULES) {
    const value = wanted[module.id]
    if (module.scoped && (DATA_SCOPES as readonly unknown[]).includes(value) && value !== defaultScope()) clean[module.id] = value as DataScope
  }
  return clean
}

export function cleanRestrictions(wanted: unknown): string[] {
  return Array.isArray(wanted) ? RESTRICTION_IDS.filter((id) => wanted.includes(id)) : []
}

// ---- Who may change whose rights ----------------------------------------------------------------------------------

/**
 * An Owner can change anyone's rights except another Owner's. An Admin can change a Member's only. Nobody changes their own.
 * A person who has not signed in yet counts as the role they will get (Member unless chosen in advance).
 */
export function mayEditRights(actorRole: string, actorId: string, targetRole: string, targetId: string | null): boolean {
  if (targetId && actorId === targetId) return false
  if (targetRole === 'owner') return false
  if (actorRole === 'owner') return true
  if (actorRole === 'admin') return targetRole === 'member'
  return false
}

/** Rights a person is granting that they do not hold themselves (no privilege escalation). */
export function escalations(actor: RightsInput, before: Overrides, after: Overrides, role: string): string[] {
  const found: string[] = []
  for (const module of RIGHT_MODULES) {
    for (const action of module.actions) {
      const was = before[module.id]?.[action] ?? roleAllows(role, module.id, action)
      const now = after[module.id]?.[action] ?? roleAllows(role, module.id, action)
      if (now && !was && !can(actor, module.id, action)) found.push(`${module.label}: ${action}`)
    }
  }
  return found
}

/** Changes that deserve a confirmation: granting delete, approve or export, or removing a restriction. */
export function sensitiveChanges(role: string, before: { overrides: Overrides; restrictions: string[] }, after: { overrides: Overrides; restrictions: string[] }): string[] {
  const found: string[] = []
  for (const module of RIGHT_MODULES) {
    for (const action of ['delete', 'approve', 'export'] as const) {
      if (!module.actions.includes(action)) continue
      const was = before.overrides[module.id]?.[action] ?? roleAllows(role, module.id, action)
      const now = after.overrides[module.id]?.[action] ?? roleAllows(role, module.id, action)
      if (now && !was) found.push(`Allow ${action} in ${module.label}`)
    }
  }
  for (const id of before.restrictions) if (!after.restrictions.includes(id)) found.push(`Remove the “${RESTRICTIONS.find((r) => r.id === id)?.label}” restriction`)
  return found
}

export type RightsChange = { label: string; before: string; after: string }

/** A readable list of what changed, for the activity history. */
export function describeChanges(role: string, before: { overrides: Overrides; scopes: Scopes; restrictions: string[] }, after: { overrides: Overrides; scopes: Scopes; restrictions: string[] }): RightsChange[] {
  const changes: RightsChange[] = []
  const yn = (value: boolean) => (value ? 'Allowed' : 'Not allowed')
  for (const module of RIGHT_MODULES) {
    for (const action of module.actions) {
      const was = before.overrides[module.id]?.[action] ?? roleAllows(role, module.id, action)
      const now = after.overrides[module.id]?.[action] ?? roleAllows(role, module.id, action)
      if (was !== now) changes.push({ label: `${module.label}: ${action}`, before: yn(was), after: yn(now) })
    }
    if (module.scoped) {
      const was = before.scopes[module.id] ?? defaultScope()
      const now = after.scopes[module.id] ?? defaultScope()
      if (was !== now) changes.push({ label: `${module.label}: data access`, before: SCOPE_LABELS[was], after: SCOPE_LABELS[now] })
    }
  }
  for (const restriction of RESTRICTIONS) {
    const was = before.restrictions.includes(restriction.id)
    const now = after.restrictions.includes(restriction.id)
    if (was !== now) changes.push({ label: `Restriction: ${restriction.label}`, before: was ? 'On' : 'Off', after: now ? 'On' : 'Off' })
  }
  return changes
}
