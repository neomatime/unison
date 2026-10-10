import 'server-only'

import { revalidatePath } from 'next/cache'

/**
 * Every page that shows contacts, a timeline or follow-ups, plus the dashboard.
 * A page's cache tag is its route file path, which includes the route group, so the
 * patterns name `(unison)`; a pattern without it matches no page (see the revalidatePath docs).
 */
export function revalidateWorkspacePages() {
  revalidatePath('/(unison)/commercial/leads/[leadId]', 'page')
  revalidatePath('/(unison)/commercial/sales/[opportunityId]', 'page')
  revalidatePath('/(unison)/commercial/quotes/[quoteId]', 'page')
  revalidatePath('/(unison)/operations/clients/[clientId]', 'page')
  revalidatePath('/overview')
}
