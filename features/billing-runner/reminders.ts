// The reminders step of the billing runner (accept to invoice, stage 3, task 4). Pure: relative imports only, no directive, no
// server-only code and no client of its own; the database client, the PDF and the mail transport arrive as arguments.
//
// WHAT THIS FILE DECIDES: nothing about reminders. Which invoice is due a reminder, and which one, is decided by the database
// (billing_reminder_candidates), which also claims the reminder under a row lock and a ten-minute lease so two runs never send the
// same one (billing_reminder_claim) and records it only after the mail server accepted it (billing_reminder_record). This file walks
// what it is told, in order, and keeps going when one invoice fails. Its log lines carry invoice ids and database error codes only.
import type { OutgoingAttachment, OutgoingMessage, PreparedMonth } from './run.ts'

export type ReminderContext = {
  state: 'ready' | 'busy' | 'skipped'
  invoice_id: string
  sequence: number
  to: string | null
  reply_to: string | null
  sender_name: string | null
  number: string
  /** What is still owing, as the database holds it (a number). */
  balance: number | string
  currency: string
  due_date: string | null
  month_number: number | null
}

export type ReminderDeps = {
  /** The service-role database client (untyped). Only its rpc is used. */
  db: any
  /** The most reminders one run handles. */
  maxItems: number
  /** Loads the invoice, makes its PDF and the reminder message. An error code says why it could not. */
  prepareReminder(input: { invoiceId: string; context: ReminderContext }): Promise<PreparedMonth | { error: 'PDF_FAILED' | 'NO_ADDRESS' }>
  /** Hands the message to the mail server. `delivered: false` is log mode: nothing was sent. */
  send(message: OutgoingMessage, attachment: OutgoingAttachment): Promise<{ delivered: boolean }>
}

export type ReminderSummary = { reminders: number; failed: number; skipped: number; logged: number }

/** A database error as far as a log line repeats it: its code, never its message (which can quote data). */
const code = (error: { code?: unknown } | null | undefined) => (typeof error?.code === 'string' ? error.code : 'unknown')

export async function runReminders(deps: ReminderDeps, summary: ReminderSummary): Promise<void> {
  const { db } = deps
  const listed = await db.rpc('billing_reminder_candidates', { p_limit: deps.maxItems })
  if (listed.error) throw new Error(`billing_reminder_candidates failed (${code(listed.error)})`)

  for (const candidate of (listed.data ?? []) as Array<{ invoice_id: string; sequence: number }>) {
    try {
      await remind(deps, summary, candidate.invoice_id)
    } catch (error) {
      console.error('[billing-runner:reminder]', candidate.invoice_id, error instanceof Error ? error.name : 'unknown error')
      summary.failed += 1
    }
  }
}

async function remind(deps: ReminderDeps, summary: ReminderSummary, invoiceId: string): Promise<void> {
  const { db } = deps
  const claimed = await db.rpc('billing_reminder_claim', { p_invoice_id: invoiceId })
  if (claimed.error) {
    console.error('[billing-runner:reminder-claim]', invoiceId, code(claimed.error))
    summary.failed += 1
    return
  }
  const context = claimed.data as ReminderContext
  if (context?.state !== 'ready') {
    summary.skipped += 1
    return
  }
  const sequence = context.sequence

  // Gives the claim back so the next run can try again. An attempt is counted unless nothing was really tried (log mode).
  const release = async (countAttempt: boolean) => {
    const released = await db.rpc('billing_reminder_release', { p_invoice_id: invoiceId, p_sequence: sequence, p_count_attempt: countAttempt })
    if (released.error) console.error('[billing-runner:reminder-release]', invoiceId, code(released.error))
  }
  const fail = async () => {
    await release(true)
    summary.failed += 1
  }

  if (!context.to) return fail()
  const prepared = await deps.prepareReminder({ invoiceId, context })
  if ('error' in prepared) return fail()

  let delivered: boolean
  try {
    ;({ delivered } = await deps.send(prepared.message, prepared.attachment))
  } catch {
    return fail()
  }
  if (!delivered) {
    await release(false)
    summary.logged += 1
    return
  }

  // The message went out. If recording fails it is not sent again by this run, and the claim is not given back.
  const recorded = await db.rpc('billing_reminder_record', {
    p_invoice_id: invoiceId,
    p_sequence: sequence,
    p_to: prepared.message.to,
    p_subject: prepared.message.subject,
    p_sha256: prepared.sha256,
    p_bytes: prepared.attachment.bytes.length,
  })
  if (recorded.error) {
    console.error('[billing-runner:reminder-record]', invoiceId, code(recorded.error))
    summary.failed += 1
    return
  }
  summary.reminders += 1
}
