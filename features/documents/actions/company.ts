'use server'

import { revalidatePath } from 'next/cache'

import { roleHasPermission } from '@/config/roles'
import { readCompanyFields } from '../fields'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'

export async function saveCompanyDetailsAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { organization, role, db } = await documentContext()
  if (!roleHasPermission(role, 'company.manage')) return { error: 'Only an owner or admin can change the company details.' }
  const fields = readCompanyFields(form)
  if ('error' in fields) return { error: fields.error }
  const saved = await db
    .from('organization_settings')
    .upsert({ organization_id: organization.id, ...fields }, { onConflict: 'organization_id' })
    .select('id')
  if (saved.error || !saved.data?.length) return { error: 'The company details could not be saved. Check the values and try again.' }
  revalidatePath('/settings/company')
  revalidateDocumentPages()
  return { success: 'Company details saved.' }
}
