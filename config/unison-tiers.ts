import { modules } from './modules.ts'

export type UnisonModuleId = (typeof modules)[number]['id']
export type UnisonTierId = 'core' | 'framework' | 'enterprise' | 'strategic-enterprise'

export type UnisonTier = {
  id: UnisonTierId
  label: string
  description: string
  includedGroups: readonly ModuleGroupId[]
  moduleIds: readonly UnisonModuleId[]
}

export type ModuleGroupId = 'delivery' | 'people' | 'operations' | 'commercial' | 'finance'

export const moduleGroups = [
  { id: 'delivery', label: 'Delivery', moduleIds: ['overview', 'portfolio', 'projects', 'frameworks', 'approvals', 'vendors'] },
  { id: 'people', label: 'People', moduleIds: ['team'] },
  { id: 'operations', label: 'Operations', moduleIds: ['clients', 'onboarding'] },
  { id: 'commercial', label: 'Commercial', moduleIds: ['leads', 'quotes', 'sales'] },
  { id: 'finance', label: 'Finance', moduleIds: ['invoices', 'expenses', 'forecast'] },
] as const satisfies readonly { id: ModuleGroupId; label: string; moduleIds: readonly UnisonModuleId[] }[]

export const lockedModuleIds = ['overview', 'portfolio', 'projects', 'frameworks', 'approvals', 'vendors', 'team'] as const satisfies readonly UnisonModuleId[]

const coreModules = [...moduleGroups[0].moduleIds, ...moduleGroups[1].moduleIds] as const
const frameworkModules = [...coreModules, ...moduleGroups[2].moduleIds] as const
const fullModules = moduleGroups.flatMap((group) => group.moduleIds) as UnisonModuleId[]

export const unisonTiers = [
  {
    id: 'core',
    label: 'UNISON Core',
    description: 'The governed delivery foundation for portfolio, project and team accountability.',
    includedGroups: ['delivery', 'people'],
    moduleIds: coreModules,
  },
  {
    id: 'framework',
    label: 'UNISON Framework',
    description: 'Core delivery controls with client and onboarding operations.',
    includedGroups: ['delivery', 'people', 'operations'],
    moduleIds: frameworkModules,
  },
  {
    id: 'enterprise',
    label: 'UNISON Enterprise',
    description: 'The complete operating platform across delivery, operations, commercial and finance.',
    includedGroups: ['delivery', 'people', 'operations', 'commercial', 'finance'],
    moduleIds: fullModules,
  },
  {
    id: 'strategic-enterprise',
    label: 'Strategic Enterprise',
    description: 'Full UNISON product entitlement for strategic enterprise delivery environments.',
    includedGroups: ['delivery', 'people', 'operations', 'commercial', 'finance'],
    moduleIds: fullModules,
  },
] as const satisfies readonly UnisonTier[]

export function getTier(tierId: UnisonTierId): UnisonTier {
  return unisonTiers.find((tier) => tier.id === tierId) ?? unisonTiers[0]
}

export function getEntitledModuleIds(tierId: UnisonTierId): UnisonModuleId[] {
  return [...getTier(tierId).moduleIds]
}

export function reconcileActiveModules(tierId: UnisonTierId, current: readonly UnisonModuleId[] = []): UnisonModuleId[] {
  const entitled = new Set(getEntitledModuleIds(tierId))
  const retained = current.filter((moduleId) => entitled.has(moduleId))
  const required = lockedModuleIds.filter((moduleId) => entitled.has(moduleId))
  const initial = current.length ? [...retained, ...required] : [...entitled]
  return [...new Set(initial)]
}

export function getModuleEntitlement(tierId: UnisonTierId, moduleId: UnisonModuleId, activeModules: readonly UnisonModuleId[]) {
  const included = getTier(tierId).moduleIds.includes(moduleId)
  const locked = lockedModuleIds.includes(moduleId as (typeof lockedModuleIds)[number])
  return {
    included,
    locked,
    active: included && (locked || activeModules.includes(moduleId)),
  }
}

export function getEnabledCounts(activeModules: readonly UnisonModuleId[]) {
  return Object.fromEntries(moduleGroups.map((group) => [group.id, group.moduleIds.filter((moduleId) => activeModules.includes(moduleId)).length])) as Record<ModuleGroupId, number>
}
