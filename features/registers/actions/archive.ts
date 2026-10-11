'use server'

import { revalidatePath } from 'next/cache'

import { documentContext } from '@/features/documents/server-context'
import type { ActionState } from '@/features/documents/types'
import { isUuid } from '@/lib/utils'
import { REGISTER_FRAMES } from '../register-view'
import { REGISTERS, isRegisterKind, type RegisterKind } from '../register-spec'

function refresh(kind: RegisterKind, id: string) {
  const base = REGISTER_FRAMES[kind].base
  revalidatePath(base)
  revalidatePath(`${base}/${id}`)
  revalidatePath('/overview')
  revalidatePath('/finance/forecast')
}

async function setArchived(kind: string, id: string, archive: boolean): Promise<ActionState> {
  if (!isRegisterKind(kind)) return { error: 'That register was not found.' }
  if (!isUuid(id)) return { error: 'That record was not found.' }
  const { organization, db } = await documentContext()
  const table = REGISTERS[kind].table
  const found = await db.from(table).select('id,archived_at').eq('id', id).eq('organization_id', organization.id).maybeSingle()
  if (found.error) return { error: 'The record could not be changed. Please try again.' }
  if (!found.data) return { error: 'That record was not found.' }
  if (archive && found.data.archived_at) return { error: 'This record is already archived.' }
  if (!archive && !found.data.archived_at) return { error: 'This record is not archived.' }
  const result = await db
    .from(table)
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .select('id')
  if (result.error || !result.data?.length) return { error: 'The record could not be changed. Please try again.' }
  refresh(kind, id)
  return { success: archive ? 'Archived.' : 'Restored.' }
}

export async function archiveRecordAction(kind: string, id: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  return setArchived(kind, id, true)
}

export async function restoreRecordAction(kind: string, id: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  return setArchived(kind, id, false)
}
