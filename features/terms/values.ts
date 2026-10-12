// The numbers behind the placeholders, turned into text. Pure: the caller supplies the money formatter.
import type { PlaceholderValues } from './placeholders.ts'

export type RetainerRate = { monthlyFee: number; credits: number | null; initiativeLimit: number | null }

const text = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? null : String(value))

export function buildPlaceholderValues(input: {
  retainer?: RetainerRate | null
  validDays: number | null
  paymentDays: number | null
  formatMoney: (amount: number) => string
}): PlaceholderValues {
  return {
    monthly_fee: input.retainer ? input.formatMoney(input.retainer.monthlyFee) : null,
    monthly_credits: text(input.retainer?.credits),
    initiative_limit: text(input.retainer?.initiativeLimit),
    valid_days: text(input.validDays),
    payment_days: text(input.paymentDays),
  }
}
