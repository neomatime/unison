'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { isUuid } from '@/lib/utils'
import { documentErrorMessage } from '../errors'
import { readPriceItemFields } from '../fields'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'

export async function savePriceItemAction(id: string | undefined, _previous: ActionState, form: FormData): Promise<ActionState> {
  const fields = readPriceItemFields(form)
  if ('error' in fields) return { error: fields.error }
  if (id !== undefined && !isUuid(id)) return { error: 'That price list item was not found.' }
  const { organization, db } = await documentContext()
  const saved = id
    ? await db.from('price_list_items').update(fields).eq('id', id).eq('organization_id', organization.id).select('id').maybeSingle()
    : await db.from('price_list_items').insert({ organization_id: organization.id, ...fields }).select('id').single()
  if (saved.error || !saved.data) {
    // A known database refusal (a rate card change by a member, a fixed rate column) says why; anything else keeps the old text.
    return { error: documentErrorMessage(saved.error?.message) ?? (id ? 'That item no longer exists.' : 'The item could not be saved. Check the values and try again.') }
  }
  revalidatePath('/settings/price-list')
  redirect(`/settings/price-list?saved=${Date.now()}`)
}

export async function archivePriceItemAction(id: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(id)) return { error: 'That price list item was not found.' }
  const { organization, db } = await documentContext()
  // Custom items only: a rate card item is never archived from the app (the database refuses it too), so for this action it does not exist.
  const archived = await db
    .from('price_list_items')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .is('rate_key', null)
    .select('id')
    .maybeSingle()
  if (archived.error || !archived.data) return { error: 'That item no longer exists.' }
  revalidatePath('/settings/price-list')
  return { success: 'Archived.' }
}
