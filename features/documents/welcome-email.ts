// What goes out as the HIMARK Welcome Email, worked out from plain values. Pure: relative imports only, no directive and no
// 'server-only', so `node --test` runs it for real. It reads no file, no environment and no database, and it sends nothing:
// features/documents/prepare-welcome-email.ts fetches the values and the action that owns the one send uses what this returns.
import type { EmailTemplate } from '../../lib/email/templates/invitation.ts'
import { welcomeEmailTemplate } from '../../lib/email/templates/welcome.ts'
import { BODY_MAX } from './email.ts'
import {
  attachmentsTooLarge,
  attachmentsTotalBytes,
  tooLargeMessage,
  welcomeAttachments,
  welcomeRecordBody,
  type EmailAttachment,
  type WelcomeDocument,
} from './welcome-documents.ts'

export type PreparedWelcomeEmail = {
  /** The message: the approved subject, the HTML and the plain-text alternative. */
  template: EmailTemplate
  /** The invoice, then the Welcome Letter, then Your Next Steps. */
  attachments: EmailAttachment[]
  /** What "Emails sent" keeps as the message: the text of the email and the list of attachments with their SHA-256. */
  recordBody: string
}

const NOT_PREPARED = 'The HIMARK Welcome Email could not be prepared, so nothing was sent. Please try again.'

export function buildWelcomeEmail(input: {
  /** The invoice's contact name, as the database holds it: anything but a non-blank string gives the approved default greeting. */
  contactName: unknown
  /** The app's public address, which the two pictures load from. */
  appUrl: string
  /** The invoice PDF the action already made, under the name it has today. */
  invoice: { filename: string; bytes: Uint8Array }
  documents: readonly WelcomeDocument[]
}): PreparedWelcomeEmail | { error: string } {
  const attachments = welcomeAttachments(input.invoice, input.documents)
  if (attachmentsTooLarge(attachments)) return { error: tooLargeMessage(attachmentsTotalBytes(attachments)) }

  let template: EmailTemplate
  try {
    template = welcomeEmailTemplate({ recipientName: typeof input.contactName === 'string' ? input.contactName : null, assetBaseUrl: input.appUrl })
  } catch (error) {
    console.error('[documents:welcome:template]', error instanceof Error ? error.message : 'unknown error')
    return { error: NOT_PREPARED }
  }

  // The contact name is capped at 200 characters, so this is far inside the database's 10,000; checked anyway, before the send, so
  // a record that the database would refuse is never discovered after the message has gone.
  const recordBody = welcomeRecordBody(template.text, attachments)
  if (recordBody.length > BODY_MAX) return { error: NOT_PREPARED }
  return { template, attachments, recordBody }
}
