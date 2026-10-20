import 'server-only'

import { createHash } from 'node:crypto'

import type { EmailTemplate } from '@/lib/email/templates/invitation'
import { quoteEmailTemplate } from '@/lib/email/templates/quote'
import { readAppUrl } from '@/lib/env'
import { getPortalQuote } from '@/lib/quote-portal/portal-client'
import { isPortalToken } from '@/lib/quote-portal/token'
import { buildDocumentView } from '../documents/document-view'
import type { EmailFields } from '../documents/email'
import { documentErrorMessage } from '../documents/errors'
import type { DocumentBundle } from '../documents/queries/get-document'
import { buildQuoteEmailData } from './email-data'

/**
 * The branded quote email with a secure link, for the email action (features/documents/actions/email.ts), which calls
 * this only for a Sent quote of an organisation that has switched the portal on.
 *
 * WHAT THIS FILE PROMISES
 * - The link is made by create_quote_access_link with the signed-in member's own client (never the service role), so
 *   the database decides: switch on, quote Sent and not archived, address valid, quote not past its valid-until date.
 * - The new link is then opened with getPortalQuote, the same read the client's browser makes (portal-client is the
 *   portal's service-role module; this file builds no client of its own). Only an open quote goes on: that proves the
 *   link works before anything is sent, and gives the version the email shows. Reading does not mark it opened.
 * - Nothing is sent from here. Anything that fails before the template is built returns an error and the action sends
 *   nothing; a link made for an email that then does not go is revoked with abandonPortalLink.
 * - The raw token lives only in the review and PDF addresses inside the template. It is never logged, thrown, returned
 *   on its own or written into an error message.
 * - This module, not the action, reads the environment (the app's public address).
 */

const NOT_SENT = 'The secure quotation link could not be added, so nothing was sent. Please try again.'

/** A database error as far as a log line repeats it: its code and message, never its details or the call's parameters. */
const describe = (error: { code?: unknown; message?: unknown } | null | undefined) =>
  `${typeof error?.code === 'string' ? error.code : ''} ${typeof error?.message === 'string' ? error.message : 'no row'}`.trim()

export async function preparePortalEmail(input: {
  db: any
  quoteId: string
  bundle: DocumentBundle
  fields: EmailFields
  senderName: string
  senderUserId: string
  organizationId: string
}): Promise<{ template: EmailTemplate; linkId: string } | { error: string }> {
  const { db, quoteId, bundle, fields, senderName, senderUserId, organizationId } = input
  // The email shows what the PDF shows: both come from the frozen copy of the quote, through the same view.
  const view = buildDocumentView({ kind: 'quote', ...bundle })
  // A Sent quote always has its number; without one there is nothing to put in front of the client.
  if (!view.number) return { error: NOT_SENT }

  // Everything that can be read is read before the link is made, so a failure here leaves no link behind.
  let appUrl: string
  try {
    appUrl = readAppUrl(process.env).replace(/\/+$/, '')
  } catch (error) {
    console.error('[quote-portal:email]', error instanceof Error ? error.message : 'unknown error')
    return { error: 'Email sending is not set up on this server yet.' }
  }

  // The sender's role under their name, from their own team record. It is decoration: a failed read leaves it out.
  let role: string | null = null
  try {
    const member = await db
      .from('team_members')
      .select('job_title')
      .eq('organization_id', organizationId)
      .eq('user_id', senderUserId)
      .is('archived_at', null)
      .limit(1)
      .maybeSingle()
    if (member.error) console.error('[quote-portal:email:role]', describe(member.error))
    const jobTitle = member.data?.job_title
    role = typeof jobTitle === 'string' && jobTitle.trim() ? jobTitle.trim() : null
  } catch (error) {
    console.error('[quote-portal:email:role]', error instanceof Error ? error.message : 'unknown error')
  }

  // The link. The database refuses with a token (QUOTE_ARCHIVED_LINK, QUOTE_EXPIRED, RECIPIENT_INVALID, ...) that
  // becomes the sender's message; nothing is sent.
  let token: unknown
  try {
    const created = await db.rpc('create_quote_access_link', {
      p_quote_id: quoteId,
      p_recipient_email: fields.to,
      p_recipient_name: bundle.record.contact_name ?? null,
    })
    if (created.error) {
      console.error('[quote-portal:email:create]', describe(created.error))
      return { error: documentErrorMessage(created.error.message) ?? NOT_SENT }
    }
    token = created.data
  } catch (error) {
    console.error('[quote-portal:email:create]', error instanceof Error ? error.message : 'unknown error')
    return { error: NOT_SENT }
  }
  if (!isPortalToken(token)) {
    console.error('[quote-portal:email:create]', 'create_quote_access_link did not return a usable link')
    return { error: NOT_SENT }
  }

  // The new link's id, found by the hash the database stored, under the member's own RLS. Without it the link could
  // not be revoked if the send fails, so it is a failure: nothing is sent, and the unsent link expires on its own.
  let linkId: string
  try {
    const found = await db
      .from('quote_access_links')
      .select('id')
      .eq('token_hash', createHash('sha256').update(token).digest('hex'))
      .eq('quote_id', quoteId)
      .eq('organization_id', organizationId)
      .single()
    if (found.error || typeof found.data?.id !== 'string') {
      console.error('[quote-portal:email:link]', describe(found.error))
      return { error: NOT_SENT }
    }
    linkId = found.data.id
  } catch (error) {
    console.error('[quote-portal:email:link]', error instanceof Error ? error.message : 'unknown error')
    return { error: NOT_SENT }
  }

  // The link exists from here on. It is opened exactly as the client will open it: anything but an open quote, or a
  // read that fails, revokes it and nothing is sent. The answer also says which version the client will see.
  // getPortalQuote's errors never carry the token, and neither do these log lines.
  let version: { version: number; replacesNumber: string | null }
  try {
    const opened = await getPortalQuote(token)
    if (opened.state !== 'open') {
      console.error('[quote-portal:email:open]', 'the new link does not read as open:', opened.state)
      await abandonPortalLink(db, linkId)
      return { error: NOT_SENT }
    }
    version = { version: opened.version, replacesNumber: opened.replaces_number }
  } catch (error) {
    console.error('[quote-portal:email:open]', error instanceof Error ? error.message : 'unknown error')
    await abandonPortalLink(db, linkId)
    return { error: NOT_SENT }
  }

  // Anything that throws while the email is built revokes the link too, and nothing is sent.
  try {
    const reviewUrl = `${appUrl}/q/${token}`
    const data = buildQuoteEmailData({
      view,
      record: bundle.record,
      personalNote: fields.body,
      reviewUrl,
      pdfUrl: `${reviewUrl}/pdf`,
      assetBaseUrl: appUrl,
      sender: { name: senderName, role },
      version,
    })
    return { template: quoteEmailTemplate(data, fields.subject), linkId }
  } catch (error) {
    // The template's own errors never repeat an address, so this line carries no link.
    console.error('[quote-portal:email:build]', error instanceof Error ? error.message : 'unknown error')
    await abandonPortalLink(db, linkId)
    return { error: NOT_SENT }
  }
}

/**
 * Revokes a link whose email did not go (the mail server refused it, or the transport is in log mode), so the quote
 * page shows it as "Not sent". Never throws: the sender's message about the send must stay the same, so a failure
 * here is logged, by link id only.
 */
export async function abandonPortalLink(db: any, linkId: string): Promise<void> {
  try {
    const { error } = await db.rpc('revoke_quote_access_link', { p_link_id: linkId, p_reason: 'email not sent' })
    if (error) console.error('[quote-portal:email:abandon]', linkId, describe(error))
  } catch (error) {
    console.error('[quote-portal:email:abandon]', linkId, error instanceof Error ? error.message : 'unknown error')
  }
}
