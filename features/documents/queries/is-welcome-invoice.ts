import 'server-only'

import type { DocumentKind } from '../vocabulary'
import { getPlanLink } from './get-plan-link'

/**
 * Whether a document goes out as the HIMARK Welcome Email (accept to invoice, stage 1): only an invoice that is the first invoice
 * of a billing plan, that is, whose billing plan item is of kind first. The email action asks it to choose the email, and the
 * email form's defaults ask it to show the same choice, so the two cannot disagree. A monthly invoice of the same plan, an invoice
 * that belongs to no plan and every quote are not welcome invoices and are emailed as before. Read only (through getPlanLink,
 * which is cached per request).
 */
export async function isWelcomeInvoice(kind: DocumentKind, invoiceId: string): Promise<boolean> {
  if (kind !== 'invoice') return false
  const link = await getPlanLink(invoiceId)
  return link?.kind === 'first'
}
