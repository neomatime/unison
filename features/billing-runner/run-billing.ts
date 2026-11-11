import 'server-only'

import { createHash } from 'node:crypto'

import { sendEmail } from '@/lib/email/send-email'
import { readAppUrl } from '@/lib/env'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { reminderEmail } from '../documents/billing-reminder-copy'
import { monthlyInvoiceEmail } from '../documents/billing-run-copy'
import { buildDocumentView, formatAmount, formatDocumentDate } from '../documents/document-view'
import { HOURLY_EMAIL_CAP, MAX_EMAIL_PDF_BYTES } from '../documents/email'
import { makeDocumentPdf } from '../documents/pdf/make-document-pdf'
import type { CompanySettings, DocumentLine } from '../documents/types'
import { noticeEmail } from './notices'
import type { ReminderContext } from './reminders'
import { runBilling, type PreparedMonth, type RunDeps, type RunSummary, type SendContext } from './run'

/**
 * The billing runner's server wiring (accept to invoice, stage 2). This is the only file of the runner that holds the service role,
 * and it is on the service-role list in tests/unit/service-role-boundary.test.ts with its reason: the runner has no session. It
 * issues and emails only what the database has already chosen, through functions granted to the service role alone
 * (billing_due_items, billing_run_item, billing_send_context, billing_record_send, billing_record_send_failure).
 *
 * WHAT THIS FILE PROMISES
 * - It decides nothing about billing (features/billing-runner/run.ts walks the database's answers).
 * - It loads an invoice only by the id the database named, with the company and client it belongs to, and makes its PDF with the
 *   same code the signed-in action uses. A PDF over the email size cap is a failure, not a send.
 * - It sends the plain invoice email, never the Welcome Email: only the first invoice of a plan goes out as the welcome.
 * - It never logs an address, a message, a token or an invoice body.
 */

/** The invoice, its lines, its client and its company, read by id with the service client. Null when the invoice is gone. */
async function loadInvoiceBundle(db: any, invoiceId: string) {
  const invoice = await db.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
  if (invoice.error || !invoice.data) return null
  const record = invoice.data as Record<string, any>
  const organizationId = record.organization_id as string
  const [lines, client, settings] = await Promise.all([
    db.from('invoice_lines').select('*').eq('invoice_id', invoiceId).eq('organization_id', organizationId).order('position').order('created_at'),
    record.client_id
      ? db.from('clients').select('name,address_line1,address_line2,city,postal_code,country,vat_number,billing_email').eq('id', record.client_id).eq('organization_id', organizationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from('organization_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
  ])
  if (lines.error || client.error || settings.error) return null
  return {
    record,
    lines: (lines.data ?? []) as DocumentLine[],
    client: (client.data as Record<string, any> | null) ?? null,
    settings: (settings.data as CompanySettings | null) ?? null,
  }
}

/** The invoice's PDF, with the bundle and view it was made from; null when it cannot be made or is too big to email. */
async function makeInvoicePdf(db: any, invoiceId: string) {
  const bundle = await loadInvoiceBundle(db, invoiceId)
  if (!bundle) return null
  let made: Awaited<ReturnType<typeof makeDocumentPdf>>
  try {
    made = await makeDocumentPdf('invoice', bundle)
  } catch (error) {
    console.error('[billing-runner:pdf]', invoiceId, error instanceof Error ? error.name : 'unknown error')
    return null
  }
  if (made.bytes.length > MAX_EMAIL_PDF_BYTES) return null
  return { bundle, made, view: buildDocumentView({ kind: 'invoice', ...bundle }) }
}

async function prepare(db: any, input: { invoiceId: string; context: SendContext }): Promise<PreparedMonth | { error: 'PDF_FAILED' | 'NO_ADDRESS' }> {
  const { invoiceId, context } = input
  if (!context.to) return { error: 'NO_ADDRESS' }
  const pdf = await makeInvoicePdf(db, invoiceId)
  if (!pdf) return { error: 'PDF_FAILED' }
  const email = monthlyInvoiceEmail(pdf.view, { monthNumber: context.month_number, termMonths: context.term_months, senderName: context.sender_name ?? pdf.view.from.name ?? 'HIMARK' })
  return {
    message: { to: context.to, replyTo: context.reply_to ?? undefined, subject: email.subject, text: email.text, html: email.html },
    attachment: { filename: pdf.made.filename, bytes: pdf.made.bytes },
    sha256: createHash('sha256').update(pdf.made.bytes).digest('hex'),
  }
}

/** The payment reminder (accept to invoice, stage 3): the same invoice PDF, attached again, with the reminder wording. */
async function prepareReminder(db: any, input: { invoiceId: string; context: ReminderContext }): Promise<PreparedMonth | { error: 'PDF_FAILED' | 'NO_ADDRESS' }> {
  const { invoiceId, context } = input
  if (!context.to) return { error: 'NO_ADDRESS' }
  const pdf = await makeInvoicePdf(db, invoiceId)
  if (!pdf) return { error: 'PDF_FAILED' }
  const email = reminderEmail(pdf.view, {
    sequence: context.sequence,
    total: 5,
    balance: formatAmount(Number(context.balance)),
    currency: context.currency,
    dueDateLabel: formatDocumentDate(context.due_date),
    senderName: context.sender_name ?? pdf.view.from.name ?? 'HIMARK',
  })
  return {
    message: { to: context.to, replyTo: context.reply_to ?? undefined, subject: email.subject, text: email.text, html: email.html },
    attachment: { filename: pdf.made.filename, bytes: pdf.made.bytes },
    sha256: createHash('sha256').update(pdf.made.bytes).digest('hex'),
  }
}

/** One run, with the real database, PDF and mail transport. Counts only. */
export async function runBillingNow(): Promise<RunSummary> {
  const db = createAdminSupabase() as any
  const deps: RunDeps = {
    db,
    emailCap: HOURLY_EMAIL_CAP,
    maxItems: 20,
    prepare: (input) => prepare(db, input),
    prepareReminder: (input) => prepareReminder(db, input),
    send: (message, attachment) =>
      sendEmail({
        to: message.to,
        template: { subject: message.subject, text: message.text, html: message.html },
        replyTo: message.replyTo,
        attachments: [{ filename: attachment.filename, contentType: 'application/pdf', content: Buffer.from(attachment.bytes) }],
      }),
    sendNotice: (notice) => {
      // A missing app address throws MissingEnvError, which run.ts counts as one failed attempt on this notice.
      const template = noticeEmail({ subject: notice.subject, body: notice.body, appUrl: readAppUrl(process.env), quotePath: notice.quoteId ? `/commercial/quotes/${notice.quoteId}` : null })
      return sendEmail({ to: notice.to, template })
    },
  }
  return runBilling(deps)
}
