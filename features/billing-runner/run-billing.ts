import 'server-only'

import { createHash } from 'node:crypto'

import { sendEmail } from '@/lib/email/send-email'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { monthlyInvoiceEmail } from '../documents/billing-run-copy'
import { buildDocumentView } from '../documents/document-view'
import { HOURLY_EMAIL_CAP, MAX_EMAIL_PDF_BYTES, emailHtml } from '../documents/email'
import { makeDocumentPdf } from '../documents/pdf/make-document-pdf'
import type { CompanySettings, DocumentLine } from '../documents/types'
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

async function prepare(db: any, input: { invoiceId: string; context: SendContext }): Promise<PreparedMonth | { error: 'PDF_FAILED' | 'NO_ADDRESS' }> {
  const { invoiceId, context } = input
  if (!context.to) return { error: 'NO_ADDRESS' }
  const bundle = await loadInvoiceBundle(db, invoiceId)
  if (!bundle) return { error: 'PDF_FAILED' }
  let made: Awaited<ReturnType<typeof makeDocumentPdf>>
  try {
    made = await makeDocumentPdf('invoice', bundle)
  } catch (error) {
    console.error('[billing-runner:pdf]', invoiceId, error instanceof Error ? error.name : 'unknown error')
    return { error: 'PDF_FAILED' }
  }
  if (made.bytes.length > MAX_EMAIL_PDF_BYTES) return { error: 'PDF_FAILED' }

  const view = buildDocumentView({ kind: 'invoice', ...bundle })
  const email = monthlyInvoiceEmail(view, { monthNumber: context.month_number, termMonths: context.term_months, senderName: context.sender_name ?? view.from.name ?? 'HIMARK' })
  return {
    message: { to: context.to, replyTo: context.reply_to ?? undefined, subject: email.subject, text: email.text, html: email.html },
    attachment: { filename: made.filename, bytes: made.bytes },
    sha256: createHash('sha256').update(made.bytes).digest('hex'),
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
    send: (message, attachment) =>
      sendEmail({
        to: message.to,
        template: { subject: message.subject, text: message.text, html: message.html },
        replyTo: message.replyTo,
        attachments: [{ filename: attachment.filename, contentType: 'application/pdf', content: Buffer.from(attachment.bytes) }],
      }),
    sendNotice: (notice) => sendEmail({ to: notice.to, template: { subject: notice.subject, text: notice.body, html: emailHtml(notice.body) } }),
  }
  return runBilling(deps)
}
