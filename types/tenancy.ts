export type OrganizationId = string
export type UserId = string

export type OrganizationStatus = 'active' | 'suspended' | 'archived'
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'removed'
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export type Organization = {
  id: OrganizationId
  name: string
  slug: string
  status: OrganizationStatus
  createdAt: string
}

export type OrganizationMembership = {
  id: string
  organizationId: OrganizationId
  userId: UserId
  roleId: string
  status: MembershipStatus
  createdAt: string
}

export type OrganizationInvitation = {
  id: string
  organizationId: OrganizationId
  email: string
  roleId: string
  status: InvitationStatus
  expiresAt: string
  createdAt: string
}

export type ActiveTenantContext = {
  organization: Organization
  membership: OrganizationMembership
}

