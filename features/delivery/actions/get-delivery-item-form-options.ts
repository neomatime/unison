'use server'
import { listDeliveryItemFormOptions } from '../queries/list-project-form-options'

/**
 * A thin bridge, not a second implementation.
 *
 * `listDeliveryItemFormOptions` lives in a `server-only` query module, so a
 * client component cannot call it directly — the create/edit dialog is opened
 * from a click in `DeliveryItemsPanel`, not rendered by a server component
 * that already knows which item (if any) is being edited. This is the one
 * function whose job is crossing that boundary: it holds no retention logic
 * of its own, and exists so the dialog can ask for the right picker options
 * — this project's, with this item's owner and phase retained — at the moment
 * it opens, rather than the panel guessing them in advance for every item.
 */
export async function getDeliveryItemFormOptionsAction(
  projectId: string,
  current: { ownerId?: string | null; phaseId?: string | null } = {},
) {
  return listDeliveryItemFormOptions(projectId, current)
}
