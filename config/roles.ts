import type { PermissionId } from '@/config/permissions'

export type RoleDefinition = {
  id: string
  label: string
  permissions: readonly PermissionId[]
}

export const roles = [
  {
    id: 'owner',
    label: 'Owner',
    permissions: ['organization.manage', 'members.manage', 'modules.manage'],
  },
  {
    id: 'admin',
    label: 'Admin',
    permissions: ['members.manage', 'modules.manage'],
  },
  {
    id: 'member',
    label: 'Member',
    permissions: [],
  },
] as const satisfies readonly RoleDefinition[]

/**
 * Resolve permissions from the central role registry instead of repeating
 * role-name checks in server actions and page components.
 */
export function roleHasPermission(roleId: string, permission: PermissionId) {
  const role = roles.find((candidate) => candidate.id === roleId)
  return role ? (role.permissions as readonly PermissionId[]).includes(permission) : false
}
