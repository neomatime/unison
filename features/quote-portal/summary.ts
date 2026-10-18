// What the portal shows around the lines of a quote: the client-facing status word, the version label and the
// commercial summary. Pure: relative imports only, no directive, so unit tests can load it.
import type { PortalLine } from '../../lib/quote-portal/types.ts'

/** The client sees "Awaiting response" for a Sent quote; every other status keeps its name. */
export function clientStatusLabel(status: string): string {
  return status === 'Sent' ? 'Awaiting response' : status
}

/** "Version 1", or "Version 2, replacing HMK-Q-2026-00045" when the replaced number is known. */
export function versionLabel(version: number, replacesNumber: string | null): string {
  const replaced = typeof replacesNumber === 'string' ? replacesNumber.trim() : ''
  return replaced ? `Version ${version}, replacing ${replaced}` : `Version ${version}`
}

export type CommercialSummary =
  | { grouped: false; lines: PortalLine[] }
  | {
      grouped: true
      onceOff: PortalLine[]
      monthly: PortalLine[]
      onceOffSubtotal: number
      monthlySubtotal: number
      monthlyVat: number
      monthlyIncludingVat: number
    }

/** Whole cents from an amount that may be a number or a numeric string; null when it is blank or not a number. */
function toCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string' && raw.trim() === '') return null
  const amount = Number(raw)
  return Number.isFinite(amount) ? Math.round(amount * 100) : null
}

/** Cents added up; null when any amount cannot be read or the total is too large to be exact. */
function sumCents(lines: PortalLine[]): number | null {
  let total = 0
  for (const line of lines) {
    const cents = toCents(line.line_amount)
    if (cents === null) return null
    total += cents
  }
  return Number.isSafeInteger(total) ? total : null
}

/**
 * numerator / denominator as a whole number, halves rounded away from zero, in integer arithmetic only (both are
 * integers and the denominator is positive). This is what the database's round(x, 2) does to the VAT figure.
 */
function divideRounded(numerator: number, denominator: number): number {
  const magnitude = Math.abs(numerator)
  const remainder = magnitude % denominator
  const quotient = (magnitude - remainder) / denominator
  const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient
  return numerator < 0 && rounded !== 0 ? -rounded : rounded
}

/**
 * The portal's commercial summary. It groups the lines into once-off and monthly only when EVERY line has a charge
 * kind and AT LEAST ONE is monthly; otherwise it is one flat list, as for a quote from before charge kinds existed.
 *
 * All arithmetic is in whole cents (each amount is Math.round(Number(x) * 100), and the result is divided by 100 only
 * at the end), so floating point never drifts: 0.1 + 0.2 is 0.3. VAT is charged only on lines whose vat_code is
 * 'standard', at the given percentage (a rate has at most two decimals in the database), rounded half away from zero
 * to whole cents. Each amount is the stored line_amount, never a recalculation from quantity and price.
 *
 * It never shows a wrong figure: when the VAT rate or any amount cannot be read, or a total is too large to add
 * exactly, it returns the flat list instead.
 */
export function buildCommercialSummary(lines: PortalLine[], vatRate: number): CommercialSummary {
  const flat = (): CommercialSummary => ({ grouped: false, lines: [...lines] })

  const onceOff: PortalLine[] = []
  const monthly: PortalLine[] = []
  for (const line of lines) {
    if (line.charge_kind === 'once_off') onceOff.push(line)
    else if (line.charge_kind === 'monthly') monthly.push(line)
    else return flat()
  }
  if (monthly.length === 0) return flat()

  if (typeof vatRate !== 'number' || !Number.isFinite(vatRate) || vatRate < 0) return flat()
  const rateHundredths = Math.round(vatRate * 100)

  const onceOffCents = sumCents(onceOff)
  const monthlyCents = sumCents(monthly)
  const monthlyStandardCents = sumCents(monthly.filter((line) => line.vat_code === 'standard'))
  if (onceOffCents === null || monthlyCents === null || monthlyStandardCents === null) return flat()

  const vatNumerator = monthlyStandardCents * rateHundredths
  if (!Number.isSafeInteger(vatNumerator)) return flat()
  const monthlyVatCents = divideRounded(vatNumerator, 10000)
  const monthlyIncludingVatCents = monthlyCents + monthlyVatCents
  if (!Number.isSafeInteger(monthlyIncludingVatCents)) return flat()

  return {
    grouped: true,
    onceOff,
    monthly,
    onceOffSubtotal: onceOffCents / 100,
    monthlySubtotal: monthlyCents / 100,
    monthlyVat: monthlyVatCents / 100,
    monthlyIncludingVat: monthlyIncludingVatCents / 100,
  }
}
