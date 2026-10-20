import 'server-only'

import { sendEmail } from '@/lib/email/send-email'
import { quoteAcknowledgementEmailTemplate, quoteOwnerNoticeEmailTemplate } from '@/lib/email/templates/quote-decision'
import { readAppUrl } from '@/lib/env'
import type { DecisionOutcome } from '@/lib/quote-portal/types'

/**
 * The two emails that follow a client's decision. decideAction calls this after portal_decide has committed, and only
 * for a new decision: a replay sends nothing a second time.
 *
 * WHAT THIS FILE PROMISES
 * - The client's acknowledgement goes to the address the code was verified at (outcome.recipientEmail). The owner's
 *   notice goes to outcome.notifyEmail (the owner's team email, else the sender's) and is skipped when there is none.
 * - Best effort: the two are sent side by side and both are waited for, so the action answers once they are done, but
 *   neither can undo or fail the decision. A template that refuses its data, a missing app address or a mail server
 *   that refuses the message is one log line naming the email and the quote number, and nothing else: a mail server's
 *   error can quote the address. This function never rejects.
 * - This module, not the action, reads the environment (the app's public address, for the owner's link).
 */

/** The decision day as the client reads it: South African time, "20 October 2026". */
const SOUTH_AFRICAN_DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Africa/Johannesburg' })

export async function sendDecisionEmails(outcome: DecisionOutcome): Promise<void> {
  const [acknowledgement, notice] = await Promise.allSettled([
    sendAcknowledgement(outcome),
    outcome.notifyEmail ? sendOwnerNotice(outcome, outcome.notifyEmail) : null,
  ])
  if (acknowledgement.status === 'rejected') console.error('[quote-portal:decision-email]', 'acknowledgement not sent for', outcome.quoteNumber)
  if (notice.status === 'rejected') console.error('[quote-portal:decision-email]', 'owner notice not sent for', outcome.quoteNumber)
}

async function sendAcknowledgement(outcome: DecisionOutcome): Promise<void> {
  await sendEmail({
    to: outcome.recipientEmail,
    template: quoteAcknowledgementEmailTemplate({
      decision: outcome.decision,
      quoteNumber: outcome.quoteNumber,
      decidedOn: SOUTH_AFRICAN_DATE.format(new Date(outcome.decidedAt)),
      ownerName: outcome.ownerName,
      signatoryName: outcome.signatoryName,
    }),
  })
}

async function sendOwnerNotice(outcome: DecisionOutcome, to: string): Promise<void> {
  const appUrl = readAppUrl(process.env).replace(/\/+$/, '')
  const template = quoteOwnerNoticeEmailTemplate({
    decision: outcome.decision,
    clientName: outcome.clientName,
    quoteNumber: outcome.quoteNumber,
    signatoryName: outcome.signatoryName,
    signatoryPosition: outcome.signatoryPosition,
    declineReason: outcome.declineReason,
    declineComments: outcome.declineComments,
    quoteUrl: `${appUrl}/commercial/quotes/${outcome.quoteId}`,
  })
  await sendEmail({ to, template })
}
