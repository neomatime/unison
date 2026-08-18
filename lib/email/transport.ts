import 'server-only'
import nodemailer from 'nodemailer'
import { readSmtpEnv } from '@/lib/env'

let cached: nodemailer.Transporter | undefined

export function getTransport() {
  if (cached) return cached

  // Read SMTP config here, not at import time: a mail misconfiguration
  // must never break authentication or database access.
  const env = readSmtpEnv(process.env)

  // Tests and local work without a mailbox: log instead of sending.
  if (process.env.EMAIL_TRANSPORT === 'log') {
    cached = nodemailer.createTransport({ jsonTransport: true })
    return cached
  }

  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  })
  return cached
}
