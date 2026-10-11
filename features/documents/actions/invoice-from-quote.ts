'use server'

import { redirect } from 'next/navigation'

import { isUuid } from '@/lib/utils'
import { failureState } from '../action-failure'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'
import { DOCUMENTS } from '../vocabulary'

export async function createInvoiceFromQuoteAction(quoteId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(quoteId)) return { error: 'That quote was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('create_invoice_from_quote', { p_quote_id: quoteId })
  if (result.error) return failureState(result.error)
  if (typeof result.data !== 'string' || !isUuid(result.data)) return { error: 'The invoice was created but could not be opened. Find it in the Invoices list.' }
  revalidateDocumentPages()
  redirect(`${DOCUMENTS.invoice.base}/${result.data}`)
}
