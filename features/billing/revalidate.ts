import 'server-only'

import { revalidatePath } from 'next/cache'

import { revalidateDocumentPages } from '../documents/revalidate'

/** The client page (its Billing package section and timeline), plus every page that shows a quote or an invoice. */
export function revalidateBillingPages() {
  revalidatePath('/(unison)/operations/clients/[clientId]', 'page')
  revalidateDocumentPages()
}
