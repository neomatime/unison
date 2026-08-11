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

