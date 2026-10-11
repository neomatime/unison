// Pure readers for the payment forms, so the validation the server actions depend on is unit testable. Relative
// imports only: Node's test runner cannot resolve '@/', and 'use server' modules cannot be imported by a test.
import { parseDecimal } from '../documents/fields.ts'
import { isPaymentMethod, type PaymentMethod } from './vocabulary.ts'

/** The South African calendar date ("2026-10-11"). The database uses the same zone for "today", the future-date check and the Overdue job. */
export function todayInJohannesburg(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const SA_DATE = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: 'short', day: 'numeric' })

/** An instant shown as its South African calendar date, no time ("11 Oct 2026"). A paid date is stored as midnight there, which is the previous day in UTC. */
export function formatSouthAfricanDate(iso: string): string {
  return SA_DATE.format(new Date(iso))
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  // "2026-02-30" is an Invalid Date (toISOString would throw), and "2026-02-29" in a non-leap year rolls over: both are refused.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export type PaymentFields = { amount: number; received_on: string; method: PaymentMethod; reference: string | null }

export function readPaymentFields(form: FormData, today: string = todayInJohannesburg()): PaymentFields | { error: string } {
  const amount = parseDecimal(String(form.get('amount') ?? '').trim())
  if (!amount) return { error: 'Enter the amount as a plain number, for example 1500 or 99.50 (no thousands separators).' }
  if (amount.decimals > 2) return { error: 'Enter at most two decimals.' }
  if (amount.value <= 0) return { error: 'Enter an amount above zero.' }
  if (amount.value > 9999999.99) return { error: 'That amount is too large.' }

  const receivedOn = String(form.get('receivedOn') ?? '').trim()
  if (!isRealDate(receivedOn)) return { error: 'Enter the date the payment was received.' }
  if (receivedOn > today) return { error: "The payment date can't be in the future." }

  const method = String(form.get('method') ?? '').trim()
  if (!isPaymentMethod(method)) return { error: 'Choose Bank transfer, Card, Cash or Other.' }

  const reference = String(form.get('reference') ?? '').trim()
  if (reference.length > 120) return { error: 'The reference is too long (120 characters at most).' }
  return { amount: amount.value, received_on: receivedOn, method, reference: reference || null }
}

export function readVoidReason(form: FormData): { reason: string } | { error: string } {
  const reason = String(form.get('reason') ?? '').trim()
  if (!reason) return { error: 'A reason is required to void a payment.' }
  if (reason.length > 500) return { error: 'The reason is too long (500 characters at most).' }
  return { reason }
}
