import 'server-only'

import { roleHasPermission } from '@/config/roles'
import { documentContext } from '../server-context'
import type { CompanySettings } from '../types'

/** The company (issuer) details for the active organisation, or null when none were saved yet. */
export async function getCompanySettings(): Promise<{ settings: CompanySettings | null; canEdit: boolean }> {
  const { organization, role, db } = await documentContext()
  const result = await db.from('organization_settings').select('*').eq('organization_id', organization.id).maybeSingle()
  if (result.error) throw result.error
  return { settings: (result.data as CompanySettings | null) ?? null, canEdit: roleHasPermission(role, 'company.manage') }
}
