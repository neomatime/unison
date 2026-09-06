'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Archive and restore. A level-1 item with unarchived children is refused.
 *
 * This one rule lives here rather than in the schema, and the distinction
 * matters: a level-2 item whose parent is archived is not invalid data -- the
 * foreign key still holds, because archived_at does not affect referential
 * integrity -- it is merely confusing. Schema constraints are for impossible
 * states; this is a workflow rule.
 */
export async function setDeliveryItemArchivedAction(_prev: { error?: string } | undefined, formData: FormData) {
  const id = formData.get('id')?.toString()
  const projectId = formData.get('projectId')?.toString()
  const archived = formData.get('archived')?.toString() === 'true'
  if (!id || !projectId) return { error: 'No delivery item was named.' }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  if (archived) {
    const { count, error: childError } = await supabase
      .from('delivery_items')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', id)
      .eq('organization_id', organization.id)
      .is('archived_at', null)
    if (childError) return { error: 'The delivery item could not be archived.' }
    if (count && count > 0) {
      return { error: `Archive or move the ${count} item${count === 1 ? '' : 's'} beneath this one first.` }
    }
  } else {
    // Mirror of the children check above. Archiving a parent while a child
    // stays live, then restoring that child, was the exact sequence that
    // left list-delivery-items.ts's tree assembly with a live level-2 item
    // under an archived parent -- a state the read side now has to surface
    // as an orphan rather than silently drop. Refusing it here, on restore,
    // is what keeps that state from being reachable through the product in
    // the first place. A level-1 item has no parent to check, so this only
    // ever fires for a level-2 item.
    const { data: item, error: itemError } = await supabase
      .from('delivery_items')
      .select('level, parent_id')
      .eq('id', id)
      .eq('organization_id', organization.id)
      .maybeSingle()
    if (itemError) return { error: 'The delivery item could not be restored.' }

    if (item?.level === 2 && item.parent_id) {
      const { data: parent, error: parentError } = await supabase
        .from('delivery_items')
        .select('name, archived_at')
        .eq('id', item.parent_id)
        .eq('organization_id', organization.id)
        .maybeSingle()
      if (parentError) return { error: 'The delivery item could not be restored.' }
      if (parent?.archived_at) {
        return { error: `"${parent.name}" is still archived. Restore it first before restoring this item.` }
      }
    }
  }

  const { data, error } = await supabase.from('delivery_items')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id).eq('organization_id', organization.id).select('id')

  if (error) return { error: `The delivery item could not be ${archived ? 'archived' : 'restored'}.` }
  if (!data?.length) return { error: 'That delivery item no longer exists, or is not yours to change.' }

  revalidatePath(`/operations/projects/${projectId}`)
  return {}
}
