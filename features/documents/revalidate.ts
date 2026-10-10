import 'server-only'

import { revalidatePath } from 'next/cache'

/**
 * Every page that shows a quote or an invoice, plus the registers and the dashboard. A page's cache tag is
 * its route file path, which includes the route group, so the patterns name `(unison)`; a pattern without
 * it matches no page (see the revalidatePath docs).
 */
export function revalidateDocumentPages() {
  revalidatePath('/(unison)/commercial/quotes/[quoteId]', 'page')
  revalidatePath('/(unison)/commercial/quotes/[quoteId]/document', 'page')
  revalidatePath('/(unison)/finance/invoices/[invoiceId]', 'page')
  revalidatePath('/(unison)/finance/invoices/[invoiceId]/document', 'page')
  revalidatePath('/commercial/quotes')
  revalidatePath('/finance/invoices')
  revalidatePath('/overview')
}
