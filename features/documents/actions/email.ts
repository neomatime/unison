'use server'

import { createHash } from 'node:crypto'

import { sendEmail } from '@/lib/email/send-email'
import { MissingEnvError } from '@/lib/env'
import { isUuid } from '@/lib/utils'
import { failureState } from '../action-failure'
import { HOURLY_EMAIL_CAP, MAX_EMAIL_PDF_BYTES, emailHtml, readEmailFields } from '../email'
import { DocumentPdfError, makeDocumentPdf } from '../pdf/make-document-pdf'
import { getDocument } from '../queries/get-document'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'
import { DOCUMENTS, isDocumentKind, isDraftStatus } from '../vocabulary'

export async function emailDocumentAction(kind: string, id: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isDocumentKind(kind) || !isUuid(id)) return { error: 'That document was not found.' }
  const fields = readEmailFields(form)
  if ('error' in fields) return { error: fields.error }

  const { organization, user, db } = await documentContext()
  const bundle = await getDocument(kind, id)
  if (!bundle) return { error: `That ${DOCUMENTS[kind].label} was not found.` }
  if (isDraftStatus(kind, bundle.record.status)) return { error: 'Send or issue this document before emailing it.' }

  // The cap counts what has been handed to the mail server in the last hour. A failed count stops the send:
  // nothing falls back to "no limit".
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recent = await db.from('document_emails').select('id', { count: 'exact', head: true }).eq('organization_id', organization.id).gte('sent_at', since)
  if (recent.error) return { error: 'The email limit could not be checked. Please try again.' }
  if ((recent.count ?? 0) >= HOURLY_EMAIL_CAP) {
    return { error: `This organisation has sent ${HOURLY_EMAIL_CAP} document emails in the last hour; try again later.` }
  }

  let made
  try {
    made = await makeDocumentPdf(kind, bundle)
  } catch (error) {
    return { error: error instanceof DocumentPdfError ? error.message : 'The PDF could not be made. Please try again.' }
  }
  if (made.bytes.length > MAX_EMAIL_PDF_BYTES) {
    const megabytes = (made.bytes.length / 1_000_000).toFixed(1)
    return { error: `This PDF is ${megabytes} MB, which is too large to email. Download it and send it yourself, or use a lighter header image under Settings, Company details.` }
  }

  try {
    await sendEmail({
      to: fields.to,
      template: { subject: fields.subject, text: fields.body, html: emailHtml(fields.body) },
      replyTo: user.email ?? undefined,
      attachments: [{ filename: made.filename, contentType: 'application/pdf', content: made.bytes }],
    })
  } catch (error) {
    console.error('[documents:email]', error)
    if (error instanceof MissingEnvError) return { error: 'Email sending is not set up on this server yet.' }
    return { error: 'The mail server refused the message. Nothing was sent; please try again.' }
  }

  // Only now, with the message accepted, is the send recorded.
  const recorded = await db.rpc('record_document_email', {
    p_kind: kind,
    p_id: id,
    p_to: fields.to,
    p_subject: fields.subject,
    p_body: fields.body,
    p_sha256: createHash('sha256').update(made.bytes).digest('hex'),
    p_bytes: made.bytes.length,
  })
  revalidateDocumentPages()
  if (recorded.error) {
    console.error('[documents:email:record]', recorded.error)
    return failureState(recorded.error, "Sent, but we couldn't record it.")
  }
  return { success: `Sent to ${fields.to}.` }
}
