'use server'

import { isUuid } from '@/lib/utils'
import { readContactFields } from '../fields'
import { revalidateWorkspacePages } from '../revalidate'
import { writeContext } from '../server-context'
import type { ActionState } from '../types'

const PARENT_COLUMN = { client: 'client_id', lead: 'lead_id' } as const

export async function addContactAction(
  parentKind: 'client' | 'lead',
  parentId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!(parentKind in PARENT_COLUMN) || !isUuid(parentId)) return { error: 'That record is invalid.' }
  const fields = readContactFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, db } = await writeContext()
  const column = PARENT_COLUMN[parentKind]

  const existing = await db
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organization.id)
    .eq(column, parentId)
    .is('archived_at', null)
  if (existing.error) return { error: 'The contact could not be added.' }

  const inserted = await db
    .from('contacts')
    .insert({ organization_id: organization.id, [column]: parentId, ...fields, is_primary: false })
    .select('id')
    .single()
  if (inserted.error) {
    return { error: inserted.error.code === '23503' ? 'That record no longer exists.' : 'The contact could not be added.' }
  }
  // The first contact is primary automatically; later ones only when asked.
  if ((existing.count ?? 0) === 0 || form.get('isPrimary') === 'on') {
    const primary = await db.rpc('set_primary_contact', { p_contact_id: inserted.data.id })
    if (primary.error) return { error: 'The contact was added, but could not be made primary.' }
  }
  revalidateWorkspacePages()
  return { success: 'Contact added.' }
}

export async function updateContactAction(contactId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(contactId)) return { error: 'That contact is invalid.' }
  const fields = readContactFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('contacts')
    .update(fields)
    .eq('id', contactId)
    .eq('organization_id', organization.id)
    .is('archived_at', null)
    .select('id')
    .maybeSingle()
  if (error) return { error: 'The contact could not be updated.' }
  if (!data) return { error: 'That contact no longer exists.' }
  revalidateWorkspacePages()
  return { success: 'Contact updated.' }
}

export async function archiveContactAction(contactId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(contactId)) return { error: 'That contact is invalid.' }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('contacts')
    .update({ archived_at: new Date().toISOString(), is_primary: false })
    .eq('id', contactId)
    .eq('organization_id', organization.id)
    .is('archived_at', null)
    .select('id')
    .maybeSingle()
  if (error) return { error: 'The contact could not be removed.' }
  if (!data) return { error: 'That contact no longer exists.' }
  revalidateWorkspacePages()
  return { success: 'Contact removed.' }
}

export async function makePrimaryContactAction(contactId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(contactId)) return { error: 'That contact is invalid.' }
  const { db } = await writeContext()
  const { error } = await db.rpc('set_primary_contact', { p_contact_id: contactId })
  if (error) return { error: error.code === 'P0002' ? 'That contact no longer exists.' : 'The primary contact could not be changed.' }
  revalidateWorkspacePages()
  return { success: 'Primary contact changed.' }
}
