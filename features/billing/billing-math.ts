// Rand arithmetic for the expected amounts on a rate card document. Pure: no imports of server code.
import { rateItem } from './rate-card.ts'

const VAT_PERCENT = 15

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function withVat(amountExVat: number, vatRatePercent: number = VAT_PERCENT): number {
  return roundCents(amountExVat * (1 + vatRatePercent / 100))
}

/** A retainer's first invoice: the monthly fee plus the one-time implementation fee, with VAT. Null for an unknown tier. */
export function firstInvoiceIncVat(tierKey: string): number | null {
  const monthly = rateItem(`retainer.${tierKey}.monthly`)
  const implementation = rateItem(`retainer.${tierKey}.implementation`)
  if (!monthly || !implementation) return null
  return withVat(monthly.price + implementation.price)
}

/** A retainer's invoice from month 2 onwards: the monthly fee with VAT. Null for an unknown tier. */
export function monthlyIncVat(tierKey: string): number | null {
  const monthly = rateItem(`retainer.${tierKey}.monthly`)
  return monthly ? withVat(monthly.price) : null
}
