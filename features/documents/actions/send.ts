'use server'

import { redirect } from 'next/navigation'

import { isUuid } from '@/lib/utils'
import { documentErrorMessage } from '../errors'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'
import { DOCUMENTS } from '../vocabulary'

const failure = (error: { message?: string } | null): ActionState => ({
  error: documentErrorMessage(error?.message) ?? 'The document could not be completed. Please try again.',
})

const numberOf = (data: unknown): string | null => {
  const number = (data as { number?: unknown } | null)?.number
  return typeof number === 'string' ? number : null
}

export async function sendQuoteAction(quoteId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(quoteId)) return { error: 'That quote was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('send_quote', { p_id: quoteId })
  if (result.error) return failure(result.error)
  revalidateDocumentPages()
  const number = numberOf(result.data)
  return { success: number ? `Quote ${number} sent.` : 'Quote sent.' }
}

export async function issueInvoiceAction(invoiceId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(invoiceId)) return { error: 'That invoice was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('issue_invoice', { p_id: invoiceId })
  if (result.error) return failure(result.error)
  revalidateDocumentPages()
  const number = numberOf(result.data)
  return { success: number ? `Invoice ${number} issued.` : 'Invoice issued.' }
}

export async function duplicateQuoteAction(quoteId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(quoteId)) return { error: 'That quote was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('duplicate_quote', { p_id: quoteId })
  if (result.error) return failure(result.error)
  if (typeof result.data !== 'string' || !isUuid(result.data)) return { error: 'The copy could not be opened. Find it in the Quotes list.' }
  revalidateDocumentPages()
  redirect(`${DOCUMENTS.quote.base}/${result.data}`)
}
