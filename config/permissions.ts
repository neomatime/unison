export const permissions = [
  { id: 'organization.manage', description: 'Manage organization settings.' },
  { id: 'members.manage', description: 'Invite, update, and remove organization members.' },
  { id: 'modules.manage', description: 'Configure modules enabled for an organization.' },
] as const

export type PermissionId = (typeof permissions)[number]['id']
export type PermissionDefinition = (typeof permissions)[number]

