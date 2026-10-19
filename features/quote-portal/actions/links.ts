'use server'

import { redirect } from 'next/navigation'

import { failureState } from '@/features/documents/action-failure'
import { revalidateDocumentPages } from '@/features/documents/revalidate'
import { documentContext } from '@/features/documents/server-context'
import type { ActionState } from '@/features/documents/types'
import { DOCUMENTS } from '@/features/documents/vocabulary'
import { isUuid } from '@/lib/utils'

/**
 * Stop a client link from working. The database function decides: it refuses a link outside the member's organisation
 * (LINK_NOT_FOUND), keeps the first time and reason of a link that was already revoked, and records "revoked by staff".
 */
export async function revokeLinkAction(linkId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(linkId)) return { error: 'That link was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('revoke_quote_access_link', { p_link_id: linkId })
  if (result.error) return failureState(result.error, 'The link could not be revoked. Please try again.')
  revalidateDocumentPages()
  return { success: 'Link revoked.' }
}

/**
 * Make a new draft from a Sent, Declined or Expired quote, pointing back at it, and open it. The original changes only
 * when the revision is sent (a database trigger then supersedes it, if it is still Sent).
 */
export async function reviseQuoteAction(quoteId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(quoteId)) return { error: 'That quote was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('revise_quote', { p_id: quoteId })
  if (result.error) return failureState(result.error, 'The quote could not be revised. Please try again.')
  if (typeof result.data !== 'string' || !isUuid(result.data)) return { error: 'The revision could not be opened. Find it in the Quotes list.' }
  revalidateDocumentPages()
  redirect(`${DOCUMENTS.quote.base}/${result.data}`)
}
