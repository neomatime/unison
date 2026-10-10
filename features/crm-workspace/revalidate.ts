import 'server-only'

import { revalidatePath } from 'next/cache'

/** Every page that shows contacts, a timeline or follow-ups, plus the dashboard. */
export function revalidateWorkspacePages() {
  revalidatePath('/commercial/leads/[leadId]', 'page')
  revalidatePath('/commercial/sales/[opportunityId]', 'page')
  revalidatePath('/commercial/quotes/[quoteId]', 'page')
  revalidatePath('/operations/clients/[clientId]', 'page')
  revalidatePath('/overview')
}
