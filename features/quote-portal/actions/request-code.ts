'use server'

import { sendEmail } from '@/lib/email/send-email'
import { quoteCodeEmailTemplate } from '@/lib/email/templates/quote-decision'
import { issuePortalCode } from '@/lib/quote-portal/portal-client'
import type { IssueCodeResult } from '@/lib/quote-portal/types'
import { REFUSAL_FALLBACK } from '../copy'
import { maskEmail, refusalMessage } from '../decision'

/**
 * Called from the portal page when the client asks for a confirmation code. A public endpoint: the token is the only
 * input, and portal-client checks its shape before anything else.
 *
 * - The code goes only to the address the database returned with it, the link's own recipient. There is no address
 *   parameter, so the browser cannot choose where a code is sent.
 * - The browser hears the address masked and how long the code lasts, or a message: never the code, the token or the
 *   address. A refusal is refusalMessage's sentence for it; a failed send is the send_failed one; a database failure
 *   is the general one.
 * - The log lines carry none of the three either: the database failure's message is portal-client's own (token-free),
 *   and a failed send names the quote number only, because a mail server's error can quote the address.
 */
export async function requestCodeAction(token: string): Promise<{ ok: true; maskedEmail: string; expiresInMinutes: 10 } | { ok: false; message: string }> {
  let issued: IssueCodeResult
  try {
    issued = await issuePortalCode(token)
  } catch (error) {
    console.error('[quote-portal:code]', error instanceof Error ? error.message : 'unknown error')
    return { ok: false, message: REFUSAL_FALLBACK }
  }
  if (!issued.ok) return { ok: false, message: refusalMessage(issued.reason) }

  try {
    await sendEmail({
      to: issued.recipientEmail,
      template: quoteCodeEmailTemplate({ code: issued.code, quoteNumber: issued.quoteNumber, clientName: issued.clientName }),
    })
  } catch {
    console.error('[quote-portal:code]', 'the confirmation code email was not sent for', issued.quoteNumber)
    return { ok: false, message: refusalMessage('send_failed') }
  }
  return { ok: true, maskedEmail: maskEmail(issued.recipientEmail), expiresInMinutes: 10 }
}
