// Decides what each of the four KPI cards says. Pure, so the choices that could
// quietly put the wrong number under a label, or invent a comparison, are unit
// tested rather than only looked at. kpi-cards.tsx renders the result and adds the
// icons (functions cannot live in a model that crosses to the client).
import { describeDelta, formatMoney, percentChange, type Delta } from './metrics.ts'
import type { KpiData, Section } from './types.ts'

export type KpiCardId = 'clients' | 'leads' | 'quotes' | 'revenue'

export type KpiBody =
  | {
      state: 'ready'
      value: string
      /** The exact figure, for a tooltip when `value` is abbreviated. */
      valueTitle?: string
      caption: string
      /** Null when no honest comparison exists. */
      delta: Delta | null
      deltaLabel: string
      /** Why there is no comparison, when "No comparison available" would be too vague. */
      noComparisonReason?: string
    }
  | { state: 'unavailable' }
  | { state: 'error' }

export type KpiCardModel = { id: KpiCardId; label: string; href: string; body: KpiBody }

const count = new Intl.NumberFormat('en-ZA')
const asDelta = (percent: number | null) => (percent === null ? null : describeDelta(percent))

/** Retainer and project clients, plus any not yet typed so the parts always add up to the total. */
function clientSplit({ total, retainer, project }: { total: number; retainer: number; project: number }) {
  const untyped = total - retainer - project
  return `${count.format(retainer)} Retainer · ${count.format(project)} Project${untyped > 0 ? ` · ${count.format(untyped)} not set` : ''}`
}

function clients(data: KpiData): KpiBody {
  if (!data.clients) return { state: 'unavailable' }
  const { total, atPreviousMonthEnd } = data.clients
  return {
    state: 'ready',
    value: count.format(total),
    caption: total === 0 ? 'No clients recorded yet' : clientSplit(data.clients),
    delta: asDelta(percentChange(total, atPreviousMonthEnd)),
    deltaLabel: 'vs last month',
  }
}

function leads(data: KpiData): KpiBody {
  if (!data.leads) return { state: 'unavailable' }
  return {
    state: 'ready',
    value: count.format(data.leads.open),
    // Leads keep no status history, so what they were a month ago cannot be rebuilt.
    caption: `${count.format(data.leads.createdThisMonth)} new this month`,
    delta: null,
    deltaLabel: '',
  }
}

function quotes(data: KpiData): KpiBody {
  if (!data.quotes) return { state: 'unavailable' }
  return {
    state: 'ready',
    value: count.format(data.quotes.active),
    caption: data.quotes.sent === 0 ? 'None awaiting a response' : `${count.format(data.quotes.sent)} awaiting a response`,
    delta: null,
    deltaLabel: '',
  }
}

function revenue(data: KpiData): KpiBody {
  if (!data.revenue) return { state: 'unavailable' }
  const { byCurrency, wonWithoutDate } = data.revenue
  const entries = byCurrency.filter((entry) => entry.yearToDate !== 0 || entry.previousYearToDate !== 0)
  const deals = byCurrency.reduce((total, entry) => total + entry.deals, 0)
  const undated = wonWithoutDate > 0 ? ` · ${count.format(wonWithoutDate)} won without a date, not counted` : ''
  const caption = `${deals === 0 ? 'No won sales this year' : `${count.format(deals)} won ${deals === 1 ? 'deal' : 'deals'} this year`}${undated}`

  if (entries.length === 0) return { state: 'ready', value: '0', caption, delta: null, deltaLabel: '' }

  // One figure per currency, side by side: adding rand to dollars would need an
  // exchange rate this system does not hold.
  const value = entries.map((entry) => formatMoney(entry.yearToDate, entry.currency, 'compact')).join(' + ')
  const valueTitle = entries.map((entry) => formatMoney(entry.yearToDate, entry.currency, 'full')).join(' + ')
  const single = entries.length === 1 ? entries[0] : null
  return {
    state: 'ready',
    value,
    valueTitle,
    caption,
    delta: single ? asDelta(percentChange(single.yearToDate, single.previousYearToDate)) : null,
    deltaLabel: 'vs same period last year',
    noComparisonReason: single ? undefined : 'No comparison across currencies',
  }
}

const cards: ReadonlyArray<{ id: KpiCardId; label: string; href: string; read: (data: KpiData) => KpiBody }> = [
  { id: 'clients', label: 'Total clients', href: '/operations/clients', read: clients },
  { id: 'leads', label: 'Open leads', href: '/commercial/leads', read: leads },
  { id: 'quotes', label: 'Active quotes', href: '/commercial/quotes', read: quotes },
  { id: 'revenue', label: 'Sales revenue (YTD)', href: '/commercial/sales', read: revenue },
]

/** A failed section is `error` on every card: the cards must never fall back to zero. */
export function buildKpiCards(kpis: Section<KpiData>): KpiCardModel[] {
  return cards.map(({ id, label, href, read }) => ({
    id,
    label,
    href,
    body: kpis.status === 'ready' ? read(kpis.data) : { state: 'error' },
  }))
}
