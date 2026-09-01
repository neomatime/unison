import type { Organization } from '@/types/tenancy'

export type BootstrapTenant = Organization & {
  enabledModuleIds: readonly string[]
}

/**
 * Development bootstrap tenancy. Persisted organizations should replace this
 * configuration once the database and authentication layers are connected.
 */
export const himarkTenant = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'HIMARK',
  slug: 'himark',
  status: 'active',
  createdAt: '2026-08-10T00:00:00.000Z',
  tier: 'strategic-enterprise',
  enabledModuleIds: [],
} as const satisfies BootstrapTenant

export const bootstrapTenants = [himarkTenant] as const

