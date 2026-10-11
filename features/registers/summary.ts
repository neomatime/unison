// The summary cards from the register_summary function's JSON. Pure: no directive, no imports.
import type { RegisterKind } from './register-spec.ts'

export type Card = { label: string; value: string; detail: string }
type Money = Record<string, number>

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const count = (summary: Record<string, unknown>, key: string) => Number(summary[key] ?? 0) || 0
const moneyOf = (summary: Record<string, unknown>, key: string): Money => {
  const raw = summary[key]
  if (!isObject(raw)) return {}
  return Object.fromEntries(Object.entries(raw).map(([currency, amount]) => [currency, Number(amount) || 0]))
}

/** ZAR when present, otherwise the first by name, otherwise none. */
export function mainCurrency(maps: Array<Record<string, number>>): string | null {
  const currencies = [...new Set(maps.flatMap((map) => Object.keys(map)))].sort()
  if (currencies.length === 0) return null
  return currencies.includes('ZAR') ? 'ZAR' : currencies[0]
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: currency || 'ZAR', maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en-ZA')}`
  }
}

export function buildCards(kind: RegisterKind, raw: unknown): Card[] {
  const summary = isObject(raw) ? raw : {}
  const maps: Money[] = []
  const cash = (key: string, detail: string, label: string): Card => {
    const map = moneyOf(summary, key)
    maps.push(map)
    return { label, value: '', detail }
  }
  let cards: Card[]
  switch (kind) {
    case 'lead':
      cards = [
        { label: 'Active leads', value: String(count(summary, 'count')), detail: 'Persistent prospects' },
        { label: 'Qualified', value: String(count(summary, 'qualified')), detail: 'Ready for opportunity conversion' },
        cash('value', 'Recorded pipeline potential', 'Estimated value'),
      ]
      break
    case 'quote':
      cards = [
        { label: 'Active quotes', value: String(count(summary, 'count')), detail: 'Across all current statuses' },
        { label: 'Accepted', value: String(count(summary, 'accepted')), detail: 'Commercially approved' },
        cash('value', 'Total recorded value', 'Quoted value'),
      ]
      break
    case 'opportunity':
      cards = [
        { label: 'Open opportunities', value: String(count(summary, 'open')), detail: 'Active commercial pipeline' },
        cash('pipeline', 'Unweighted opportunity value', 'Pipeline value'),
        cash('weighted', 'Probability-adjusted value', 'Weighted forecast'),
      ]
      break
    case 'invoice':
      cards = [
        { label: 'Invoices', value: String(count(summary, 'count')), detail: 'Current billing records' },
        cash('outstanding', 'Balance still collectible', 'Outstanding'),
        { label: 'Overdue', value: String(count(summary, 'overdue')), detail: 'Invoices requiring attention' },
      ]
      break
    case 'expense':
      cards = [
        cash('spend', 'Current tenant spend', 'Recorded expenses'),
        { label: 'Awaiting approval', value: String(count(summary, 'awaiting')), detail: 'Submitted control items' },
        cash('approved', 'Approved recorded spend', 'Approved'),
      ]
      break
  }
  const main = mainCurrency(maps) ?? 'ZAR'
  const others = new Set(maps.flatMap((map) => Object.keys(map).filter((currency) => currency !== main && map[currency] !== 0)))
  const keys: Record<RegisterKind, Record<string, string>> = {
    lead: { 'Estimated value': 'value' },
    quote: { 'Quoted value': 'value' },
    opportunity: { 'Pipeline value': 'pipeline', 'Weighted forecast': 'weighted' },
    invoice: { Outstanding: 'outstanding' },
    expense: { 'Recorded expenses': 'spend', Approved: 'approved' },
  }
  return cards.map((card) => {
    const key = keys[kind][card.label]
    if (!key) return card
    return {
      ...card,
      value: money(moneyOf(summary, key)[main] ?? 0, main),
      detail: others.size > 0 ? `${card.detail} · other currencies not included` : card.detail,
    }
  })
}
