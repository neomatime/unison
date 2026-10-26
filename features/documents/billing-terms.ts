// The start date and term a quote is billed on, and the plain wording staff and clients see for them. Pure: relative imports
// only (this file imports nothing at all: document-view.ts imports it, and a cycle is not wanted), so the quote form action
// and the unit tests can both load it.

export type BillingTerms = { start_date: string | null; term_months: number | null }

/** The words staff read next to the two fields, on the quote page, and in the detail list. One place, so they cannot drift. */
export const BILLING_TERMS_COPY = {
  startDateLabel: 'Start date of the monthly charge',
  termLabel: 'Term in months',
  helper: 'Needed when the quote has a monthly charge. Both are fixed once the quote is sent.',
  detailStartDate: 'Start date',
  detailTerm: 'Term',
} as const

const BOTH_OR_NEITHER = 'Enter both a start date and a term in months, or leave both blank.'
const DATE_INVALID = 'Enter a valid start date.'
const TERM_INVALID = 'The term must be a whole number of months from 1 to 120.'

const EARLIEST = '2020-01-01'
const LATEST = '2100-12-31'

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

/** True for a real calendar date written YYYY-MM-DD ("2026-02-30" is not one). */
function isRealDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * The start date and term of the quote form. Both blank means no terms (both null); one without the other is refused; the
 * date must be a real date between 2020-01-01 and 2100-12-31 and the term a whole number of months from 1 to 120. The database
 * holds the same rules (quotes_billing_terms_check, quotes_term_months_range): this gives the person the sentence first.
 */
export function readBillingTerms(form: FormData): BillingTerms | { error: string } {
  const start = value(form, 'startDate')
  const term = value(form, 'termMonths')
  if (!start && !term) return { start_date: null, term_months: null }
  if (!start || !term) return { error: BOTH_OR_NEITHER }
  // YYYY-MM-DD strings sort as dates, so the range is a string comparison once the shape is known to be right.
  if (!isRealDate(start) || start < EARLIEST || start > LATEST) return { error: DATE_INVALID }
  if (!/^\d{1,3}$/.test(term)) return { error: TERM_INVALID }
  const months = Number(term)
  if (months < 1 || months > 120) return { error: TERM_INVALID }
  return { start_date: start, term_months: months }
}

/** True when any line is a monthly charge. A line with no charge kind (null or absent) is not. */
export function quoteHasMonthlyLine(lines: Array<{ charge_kind?: unknown }>): boolean {
  return lines.some((line) => line.charge_kind === 'monthly')
}

/** "12 months", and "1 month" for one. */
export function formatTermMonths(termMonths: number): string {
  return termMonths === 1 ? '1 month' : `${termMonths} months`
}

/**
 * The sentence that says what the client agrees to pay: "ZAR 1,725.00 per month for 12 months from 15 December 2026". `monthly` is
 * the figure already formatted with its currency, and `startDateLabel` the date already formatted for the reader (the caller
 * formats it with formatDocumentDate). With no single monthly figure it counts the payments instead. Null when there is no term or
 * no date, because the sentence cannot be put together without both.
 */
export function agreementSentence(input: { monthly: string | null; termMonths: number | null; startDateLabel: string | null }): string | null {
  const { monthly, termMonths, startDateLabel } = input
  if (typeof termMonths !== 'number' || !Number.isInteger(termMonths) || termMonths < 1) return null
  if (!startDateLabel || !startDateLabel.trim()) return null
  if (monthly) return `${monthly} per month for ${formatTermMonths(termMonths)} from ${startDateLabel}`
  return `${termMonths === 1 ? '1 monthly payment' : `${termMonths} monthly payments`} from ${startDateLabel}`
}
