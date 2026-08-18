import 'server-only'
import { readSmtpEnv } from '@/lib/env'
import { getTransport } from './transport'
import type { EmailTemplate } from './templates/invitation'

export async function sendEmail(input: { to: string; template: EmailTemplate }) {
  const env = readSmtpEnv(process.env)
  const info = await getTransport().sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.template.subject,
    text: input.template.text,
    html: input.template.html,
  })
  if (process.env.EMAIL_TRANSPORT === 'log') console.log('[email:log]', info.message)
  return info
}
