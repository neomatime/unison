// The wording of a billing notice email (accept to invoice, stage 2, task 6). Pure: relative imports with their extensions only, no
// directive and no server code. The in-app notice's title becomes the subject and its body the message; a link to the quote is added
// so the person lands where the plan, its blockers and the approve button are. Staff-facing, so plain text first.
import { emailHtml } from '../documents/email.ts'

export function noticeEmail(input: { subject: string; body: string; appUrl: string; quotePath: string | null }): { subject: string; text: string; html: string } {
  const text = input.quotePath ? `${input.body}\n\nOpen it in UNISON: ${input.appUrl.replace(/\/+$/, '')}${input.quotePath}` : input.body
  return { subject: input.subject, text, html: emailHtml(text) }
}
