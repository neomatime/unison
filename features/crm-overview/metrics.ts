// Pure rules for the CRM Overview: greeting, percent change, money, chart
// bucketing and activity wording. No React and no I/O, so every rule here is
// covered by a unit test that needs no database. Relative imports only, because
// Node's test runner cannot resolve the '@/' alias.
import { formatCurrency } from '../../lib/utils/format-money.ts'
import type { ActivityEvent, BucketRow, Money, RevenueChartData } from './types.ts'

// ---------------------------------------------------------------- greeting

export type DayPart = 'Good morning' | 'Good afternoon' | 'Good evening'

/** `hour` is the viewer's local hour, 0-23. */
export function greetingFor(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || 'there'
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]
  return letters.toUpperCase()
}

// ---------------------------------------------------------------- comparison

/**
 * Percent change from `previous` to `current`, rounded to a whole number, or null
 * when no honest figure exists. A previous value of zero (or an unknown one) has
 * no percentage: showing "+100%" or "+∞" would be invented growth.
 */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || !Number.isFinite(previous) || previous <= 0) return null
  if (!Number.isFinite(current)) return null
  return Math.round(((current - previous) / previous) * 100)
}

export type Delta = { direction: 'up' | 'down' | 'flat'; text: string }

export function describeDelta(percent: number): Delta {
  if (percent > 0) return { direction: 'up', text: `${percent}%` }
  if (percent < 0) return { direction: 'down', text: `${Math.abs(percent)}%` }
  return { direction: 'flat', text: '0%' }
}

// ---------------------------------------------------------------- money

const LOCALE = 'en-ZA'

/** One currency, never summed with another. Falls back to the code if Intl rejects it. */
export function formatMoney(amount: number, currency: string, style: 'compact' | 'full' = 'full'): string {
  try {
    if (style === 'compact' && Math.abs(amount) >= 10_000) {
      return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(amount)
    }
    // Whole amounts drop the cents; anything else shows both, so 1234.5 is never "R1234,5".
    const fraction = Number.isInteger(amount) ? 0 : 2
    return formatCurrency(amount, currency, { minimumFractionDigits: fraction, maximumFractionDigits: fraction })
  } catch {
    return `${currency} ${amount}`
  }
}

/** Per-currency totals side by side ("R1,2M + US$40K"), never one silent grand total. */
export function formatMoneyList(totals: readonly Money[], style: 'compact' | 'full' = 'full'): string {
  const shown = totals.filter((entry) => entry.amount !== 0)
  if (shown.length === 0) return ''
  return shown.map((entry) => formatMoney(entry.amount, entry.currency, style)).join(' + ')
}

// ---------------------------------------------------------------- revenue chart

export type ChartPeriod = 'this-month' | 'this-quarter' | 'this-year' | 'last-year'

export const CHART_PERIODS: ReadonlyArray<{ id: ChartPeriod; label: string }> = [
  { id: 'this-month', label: 'This Month' },
  { id: 'this-quarter', label: 'This Quarter' },
  { id: 'this-year', label: 'This Year' },
  { id: 'last-year', label: 'Last Year' },
]

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEK_LABELS = ['1–7', '8–14', '15–21', '22–end']

export type ChartBucket = {
  key: string
  label: string
  won: number
  wonDeals: number
  /** Null where it cannot be known: open pipeline in the past is not reconstructable. */
  pipeline: number | null
  pipelineDeals: number
}

export type RevenueChart = {
  period: ChartPeriod
  currencies: string[]
  currency: string | null
  buckets: ChartBucket[]
  wonTotal: number
  pipelineTotal: number
  hasData: boolean
  /** Whether this period can show pipeline at all (a finished year cannot). */
  pipelineShown: boolean
}

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

type Slot = { key: string; label: string; pipelineKnown: boolean }

function slotsFor(data: RevenueChartData, period: ChartPeriod): { slots: Slot[]; won: BucketRow[]; pipeline: BucketRow[] } {
  const { currentYear, currentMonth } = data
  if (period === 'this-month') {
    return {
      slots: WEEK_LABELS.map((label, index) => ({ key: String(index + 1), label, pipelineKnown: true })),
      won: data.wonThisMonthByWeek,
      pipeline: data.pipelineThisMonthByWeek,
    }
  }
  const year = period === 'last-year' ? currentYear - 1 : currentYear
  const months = period === 'this-quarter'
    ? [0, 1, 2].map((offset) => Math.floor((currentMonth - 1) / 3) * 3 + 1 + offset)
    : Array.from({ length: 12 }, (_, index) => index + 1)
  return {
    slots: months.map((month) => ({
      key: monthKey(year, month),
      label: MONTH_LABELS[month - 1],
      // Open pipeline is only known from the current month forward.
      pipelineKnown: period !== 'last-year' && month >= currentMonth,
    })),
    won: data.wonByMonth,
    pipeline: data.pipelineByMonth,
  }
}

/**
 * Buckets the revenue payload for one period and one currency. Currencies are
 * never added together: the caller picks one, or the largest present is chosen.
 */
export function buildRevenueChart(data: RevenueChartData, period: ChartPeriod, requestedCurrency?: string | null): RevenueChart {
  const { slots, won, pipeline } = slotsFor(data, period)
  const keys = new Set(slots.map((slot) => slot.key))
  const wonRows = won.filter((row) => keys.has(row.key))
  const pipelineRows = pipeline.filter((row) => keys.has(row.key) && slots.find((slot) => slot.key === row.key)?.pipelineKnown)

  const weight = new Map<string, number>()
  for (const row of [...wonRows, ...pipelineRows]) weight.set(row.currency, (weight.get(row.currency) ?? 0) + row.amount)
  const currencies = [...weight.keys()].sort()
  const currency = requestedCurrency && weight.has(requestedCurrency)
    ? requestedCurrency
    : [...weight.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null

  const sum = (rows: BucketRow[], key: string) => rows
    .filter((row) => row.key === key && row.currency === currency)
    .reduce((acc, row) => ({ amount: acc.amount + row.amount, deals: acc.deals + row.deals }), { amount: 0, deals: 0 })

  const buckets: ChartBucket[] = slots.map((slot) => {
    const wonSum = sum(wonRows, slot.key)
    const pipelineSum = sum(pipelineRows, slot.key)
    return {
      key: slot.key,
      label: slot.label,
      won: wonSum.amount,
      wonDeals: wonSum.deals,
      pipeline: slot.pipelineKnown ? pipelineSum.amount : null,
      pipelineDeals: slot.pipelineKnown ? pipelineSum.deals : 0,
    }
  })

  return {
    period,
    currencies,
    currency,
    buckets,
    wonTotal: buckets.reduce((total, bucket) => total + bucket.won, 0),
    pipelineTotal: buckets.reduce((total, bucket) => total + (bucket.pipeline ?? 0), 0),
    hasData: currency !== null,
    pipelineShown: slots.some((slot) => slot.pipelineKnown),
  }
}

/** A round upper bound for the y axis so the bars never touch the top of the plot. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const exponent = Math.floor(Math.log10(value))
  const base = 10 ** exponent
  const fraction = value / base
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return step * base
}

// ---------------------------------------------------------------- activity

export type ActivityIcon = 'lead' | 'client' | 'quote' | 'won' | 'invoice' | 'vendor' | 'onboarding' | 'opportunity'

export type ActivityDescription = { label: string; text: string; href: string; icon: ActivityIcon }

const forClient = (event: ActivityEvent, joiner: string) => (event.subtitle ? ` ${joiner} ${event.subtitle}` : '')

/** Wording, icon and link for one event, or null for a kind this dashboard does not know. */
export function describeActivity(event: ActivityEvent): ActivityDescription | null {
  const { title, recordId } = event
  switch (event.kind) {
    case 'lead.created':
      return { label: 'New lead created', text: `${title} was added as a new lead.`, href: `/commercial/leads/${recordId}`, icon: 'lead' }
    case 'client.created':
      return { label: 'Client added', text: `${title} was added as a client.`, href: `/operations/clients/${recordId}`, icon: 'client' }
    case 'quote.created':
      return { label: 'Quote created', text: `Quote ${title}${forClient(event, 'for')} was created.`, href: `/commercial/quotes/${recordId}`, icon: 'quote' }
    case 'quote.sent':
      return { label: 'Quote sent', text: `Quote ${title} was sent${forClient(event, 'to')}.`, href: `/commercial/quotes/${recordId}`, icon: 'quote' }
    case 'quote.accepted':
      return { label: 'Quote accepted', text: `Quote ${title}${forClient(event, 'from')} was accepted.`, href: `/commercial/quotes/${recordId}`, icon: 'won' }
    case 'opportunity.created':
      return { label: 'Opportunity created', text: `${title}${forClient(event, 'for')} was added to the pipeline.`, href: `/commercial/sales/${recordId}`, icon: 'opportunity' }
    case 'opportunity.won':
      return { label: 'Opportunity won', text: `${title}${forClient(event, 'for')} was marked won.`, href: `/commercial/sales/${recordId}`, icon: 'won' }
    case 'invoice.created':
      return { label: 'Invoice created', text: `Invoice ${title}${forClient(event, 'for')} was created.`, href: `/finance/invoices/${recordId}`, icon: 'invoice' }
    case 'vendor.added':
      return { label: 'Vendor added', text: `${title} was added as a vendor.`, href: `/delivery/vendors/${recordId}`, icon: 'vendor' }
    case 'onboarding.started':
      return { label: 'Onboarding started', text: `Onboarding for ${title} was started.`, href: `/operations/onboarding/${recordId}`, icon: 'onboarding' }
    default:
      return null
  }
}

/** The reporting timezone's current year and month, taken from the server clock. */
export function currentYearMonth(timeZone: string, now: Date = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now)
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const year = read('year')
  const month = read('month')
  if (!Number.isInteger(year) || !Number.isInteger(month)) throw new Error('crm-overview: could not read the reporting date')
  return { year, month }
}
