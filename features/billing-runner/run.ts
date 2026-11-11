// The billing runner's orchestrator (accept to invoice, stage 2, task 5). Pure: relative imports only, no directive, no server-only
// code and no client of its own. The database client, the PDF and the mail transport arrive as arguments, so a unit test can walk
// the whole run with fakes and nothing real is sent.
//
// WHAT THIS FILE DECIDES: nothing about billing. Which months are due, which checks they pass, which state they end in and who is
// told are all decided by the database functions it calls (billing_due_items, billing_run_item, billing_send_context,
// billing_record_send, billing_record_send_failure), under row locks. This file walks what it is told, in order, and keeps going
// when one item fails. Its log lines carry item ids and database error codes only: never an address, a message or an invoice body.

export type SendContext = {
  state: 'ready' | 'busy' | 'skipped'
  invoice_id: string
  organization_id: string
  to: string | null
  reply_to: string | null
  sender_name: string | null
  month_number: number
  term_months: number | null
}

export type OutgoingMessage = { to: string; replyTo?: string; subject: string; text: string; html: string }
export type OutgoingAttachment = { filename: string; bytes: Uint8Array }
export type PreparedMonth = { message: OutgoingMessage; attachment: OutgoingAttachment; sha256: string }

export type RunDeps = {
  /** The service-role database client (untyped). Only its rpc is used. */
  db: any
  /** The most document emails one organisation may send in an hour (HOURLY_EMAIL_CAP). */
  emailCap: number
  /** The most items one run handles. */
  maxItems: number
  /** Loads the invoice, makes its PDF and its message. An error code says why it could not. */
  prepare(input: { invoiceId: string; context: SendContext }): Promise<PreparedMonth | { error: 'PDF_FAILED' | 'NO_ADDRESS' }>
  /** Hands the message to the mail server. `delivered: false` is log mode: nothing was sent. */
  send(message: OutgoingMessage, attachment: OutgoingAttachment): Promise<{ delivered: boolean }>
  /** Sends one billing notice email. */
  sendNotice(notice: { id: string; to: string; subject: string; body: string }): Promise<{ delivered: boolean }>
}

export type RunSummary = { issued: number; sent: number; held: number; capped: number; failed: number; skipped: number; logged: number; notices: number }

/** A database error as far as a log line repeats it: its code, never its message (which can quote data). */
const code = (error: { code?: unknown } | null | undefined) => (typeof error?.code === 'string' ? error.code : 'unknown')

export async function runBilling(deps: RunDeps): Promise<RunSummary> {
  const { db } = deps
  const summary: RunSummary = { issued: 0, sent: 0, held: 0, capped: 0, failed: 0, skipped: 0, logged: 0, notices: 0 }

  const due = await db.rpc('billing_due_items', { p_limit: deps.maxItems })
  if (due.error) throw new Error(`billing_due_items failed (${code(due.error)})`)
  const items = (due.data ?? []) as Array<{ item_id: string; step: 'issue' | 'send' }>

  for (const item of items) {
    try {
      if (item.step === 'issue') {
        const run = await db.rpc('billing_run_item', { p_item_id: item.item_id, p_email_cap: deps.emailCap })
        if (run.error) {
          console.error('[billing-runner:run]', item.item_id, code(run.error))
          summary.failed += 1
          continue
        }
        const state = (run.data as { state?: string } | null)?.state
        if (state === 'held') summary.held += 1
        else if (state === 'capped') summary.capped += 1
        else if (state !== 'issued') summary.skipped += 1
        if (state !== 'issued') continue
        summary.issued += 1
      }
      await sendItem(deps, summary, item.item_id)
    } catch (error) {
      console.error('[billing-runner:item]', item.item_id, error instanceof Error ? error.name : 'unknown error')
      summary.failed += 1
    }
  }

  await sendNotices(deps, summary)
  return summary
}

async function sendItem(deps: RunDeps, summary: RunSummary, itemId: string): Promise<void> {
  const { db } = deps
  const fetched = await db.rpc('billing_send_context', { p_item_id: itemId })
  if (fetched.error) {
    console.error('[billing-runner:context]', itemId, code(fetched.error))
    summary.failed += 1
    return
  }
  const context = fetched.data as SendContext
  if (context?.state !== 'ready') {
    summary.skipped += 1
    return
  }

  const fail = async (failure: 'MAIL_REJECTED' | 'PDF_FAILED' | 'NO_ADDRESS' | 'NOT_CONFIGURED') => {
    const recorded = await db.rpc('billing_record_send_failure', { p_item_id: itemId, p_code: failure })
    if (recorded.error) console.error('[billing-runner:failure]', itemId, code(recorded.error))
    summary.failed += 1
  }

  if (!context.to) return fail('NO_ADDRESS')
  const prepared = await deps.prepare({ invoiceId: context.invoice_id, context })
  if ('error' in prepared) return fail(prepared.error)

  let delivered: boolean
  try {
    ;({ delivered } = await deps.send(prepared.message, prepared.attachment))
  } catch (error) {
    return fail(error instanceof Error && error.name === 'MissingEnvError' ? 'NOT_CONFIGURED' : 'MAIL_REJECTED')
  }
  // Log mode: nothing was sent, so nothing is recorded. The lease runs out and the next run tries again.
  if (!delivered) {
    summary.logged += 1
    return
  }

  // The message went out. If recording fails it is not sent again by this run: the failure is counted and left for a person.
  const recorded = await db.rpc('billing_record_send', {
    p_item_id: itemId,
    p_to: prepared.message.to,
    p_subject: prepared.message.subject,
    p_body: prepared.message.text,
    p_sha256: prepared.sha256,
    p_bytes: prepared.attachment.bytes.length,
  })
  if (recorded.error) {
    console.error('[billing-runner:record]', itemId, code(recorded.error))
    summary.failed += 1
    return
  }
  summary.sent += 1
}

async function sendNotices(deps: RunDeps, summary: RunSummary): Promise<void> {
  const { db } = deps
  const pending = await db.rpc('billing_pending_notice_emails', { p_limit: 20 })
  if (pending.error) {
    console.error('[billing-runner:notices]', code(pending.error))
    return
  }
  for (const row of (pending.data ?? []) as Array<{ id: string; to_address: string; subject: string; body: string }>) {
    let delivered = false
    try {
      ;({ delivered } = await deps.sendNotice({ id: row.id, to: row.to_address, subject: row.subject, body: row.body }))
    } catch (error) {
      console.error('[billing-runner:notice]', row.id, error instanceof Error ? error.name : 'unknown error')
      const marked = await db.rpc('billing_mark_notice_email', { p_id: row.id, p_sent: false })
      if (marked.error) console.error('[billing-runner:notice-mark]', row.id, code(marked.error))
      continue
    }
    // Log mode: nothing was sent and nothing is marked.
    if (!delivered) continue
    const marked = await db.rpc('billing_mark_notice_email', { p_id: row.id, p_sent: true })
    if (marked.error) console.error('[billing-runner:notice-mark]', row.id, code(marked.error))
    else summary.notices += 1
  }
}
