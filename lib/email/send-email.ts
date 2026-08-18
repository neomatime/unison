import 'server-only'
import { readGraphEnv } from '@/lib/env'
import { sendMimeViaGraph } from './graph'
import { buildMimeMessage } from './mime'
import type { EmailTemplate } from './templates/invitation'

/**
 * The only mail entry point. Server actions call this and never touch transport
 * details, so the provider stays swappable — which is not theoretical: this
 * moved from SMTP to Graph without any caller changing.
 */
export async function sendEmail(input: { to: string; template: EmailTemplate }): Promise<void> {
  // Local work and tests run without credentials: render the message and log it
  // rather than sending. Checked before readGraphEnv so the log path needs no
  // Azure configuration at all.
  if (process.env.EMAIL_TRANSPORT === 'log') {
    console.log('[email:log]', JSON.stringify({
      to: input.to,
      subject: input.template.subject,
      text: input.template.text,
    }, null, 2))
    return
  }

  const env = readGraphEnv(process.env)
  const mime = buildMimeMessage({
    from: env.MAIL_FROM,
    to: input.to,
    subject: input.template.subject,
    text: input.template.text,
    html: input.template.html,
  })

  await sendMimeViaGraph(mime)
}
