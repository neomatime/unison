// The wording of the monthly invoice email (accept to invoice, stage 2, task 5). Client-facing: drafted here, in one place, for the
// owner's approval, as the portal's wording is. Pure: relative imports with their extensions only, no directive and no server code.
//
// It is the plain invoice email, not the HIMARK Welcome Email: only the first invoice of a plan goes out as the welcome. It says
// which month of the agreement this is, the total, the due date, how to pay (the company's bank details and the invoice number as
// the payment reference), and who to write to. It never says "paid", "overdue" or "reminder": those are for a recorded payment and
// for the reminders of Stage 3.
import type { DocumentView } from './document-view.ts'
import { emailHtml } from './email.ts'

export function monthlyInvoiceEmail(
  view: DocumentView,
  input: { monthNumber: number; termMonths: number | null; senderName: string },
): { subject: string; text: string; html: string } {
  if (!view.number) throw new Error('A monthly invoice email needs the invoice number.')
  const company = view.from.name
  const subject = company ? `Invoice ${view.number} from ${company}` : `Invoice ${view.number}`
  const dueDate = view.details.find((detail) => detail.label === 'Due date')?.value ?? null
  const month = input.termMonths ? `month ${input.monthNumber} of ${input.termMonths}` : `month ${input.monthNumber}`

  const lines = ['Hello,', '', `Please find attached invoice ${view.number} for ${month} of your agreement: ${view.currency} ${view.totals.total}.`]
  if (dueDate) lines.push(`It is due on ${dueDate}.`)
  if (view.bank.length > 0) {
    lines.push('', 'You can pay by bank transfer to:')
    for (const field of view.bank) lines.push(`${field.label}: ${field.value}`)
  }
  lines.push('', `Please use ${view.number} as your payment reference.`, '', 'Kind regards,', input.senderName)
  // When the sender is the company itself (the quote's owner has no name on file) its name is printed once.
  if (company && company !== input.senderName) lines.push(company)
  const text = lines.join('\n')
  return { subject, text, html: emailHtml(text) }
}
