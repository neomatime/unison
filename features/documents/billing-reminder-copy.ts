// The wording of the payment reminder email (accept to invoice, stage 3, task 4). Client-facing: drafted here, in one place, for the
// owner's approval. Pure: relative imports with their extensions only, no directive and no server code.
//
// One wording for all five reminders: friendly and short. It does not count ("reminder 3 of 5") and it does not escalate: after the
// fifth the owner is told and follows up personally. It names the invoice, the balance still owing, the due date, how to pay (the bank
// details and the invoice number as the payment reference), and says what to do if the client has already paid. The only place it says
// "paid" is that sentence: UNISON never claims an invoice is paid except from a recorded payment.
import type { DocumentView } from './document-view.ts'
import { emailHtml } from './email.ts'

export function reminderEmail(
  view: DocumentView,
  input: { sequence: number; total: number; balance: string; currency: string; dueDateLabel: string | null; senderName: string },
): { subject: string; text: string; html: string } {
  if (!view.number) throw new Error('A reminder email needs the invoice number.')
  const company = view.from.name
  const subject = company ? `Reminder: invoice ${view.number} from ${company}` : `Reminder: invoice ${view.number}`

  const lines = ['Hello,', '', `This is a friendly reminder that ${input.currency} ${input.balance} is still owing on invoice ${view.number}${input.dueDateLabel ? `, which was due on ${input.dueDateLabel}` : ''}.`]
  if (view.bank.length > 0) {
    lines.push('', 'You can pay by bank transfer to:')
    for (const field of view.bank) lines.push(`${field.label}: ${field.value}`)
  }
  lines.push(
    '',
    `Please use ${view.number} as your payment reference. The invoice is attached again for your convenience.`,
    '',
    'If you have already paid, please let us know and ignore this message.',
    '',
    'Kind regards,',
    input.senderName,
  )
  // When the sender is the company itself (the quote's owner has no name on file) its name is printed once.
  if (company && company !== input.senderName) lines.push(company)
  const text = lines.join('\n')
  return { subject, text, html: emailHtml(text) }
}
