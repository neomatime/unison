export type { Organization, OrganizationId, OrganizationStatus } from '@/types/tenancy'

import type { UnisonTierId } from '@/config/unison-tiers'
import type { OrganizationStatus } from '@/types/tenancy'

export type OrganizationWorkspaceOwner = {
  displayName: string
  email: string | null
}

export type OrganizationProfileData = {
  id: string
  name: string
  slug: string
  status: OrganizationStatus
  createdAt: string
  updatedAt: string
  emailDomain: string | null
  tierId: UnisonTierId
  tierLabel: string
  tierDescription: string
  /** An active owner membership, not a primary-contact designation. */
  workspaceOwner: OrganizationWorkspaceOwner | null
  metrics: {
    users: number
    projects: number
    clients: number
    /** No persisted vendor register exists yet. Never replace this with fixture data. */
    vendors: null
  }
  canEdit: boolean
}
